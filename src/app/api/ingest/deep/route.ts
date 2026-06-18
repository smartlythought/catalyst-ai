import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRecentForm4, getRecent8K } from "@/lib/ingestion/sec-edgar";
import { getAnalystRatings } from "@/lib/ingestion/market-data";
import { getCompanyNews } from "@/lib/ingestion/news";
import { generateCall } from "@/lib/ai/gemini";
import {
  storeIngestionResults,
  storeInsiderTrade,
  logIngestion,
} from "@/lib/supabase/queries";

const FMP_KEY = process.env.FMP_API_KEY || "";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const offset = parseInt(searchParams.get("offset") || "0");
  const limit = parseInt(searchParams.get("limit") || "20");

  await logIngestion("deep_analysis", "running", 0);

  const supabase = createServiceClient();

  const { data: tickers } = (await supabase
    .from("tickers")
    .select("id, symbol, company_name, cik, sector")
    .eq("is_active", true)
    .order("market_cap", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)) as {
    data: {
      id: number;
      symbol: string;
      company_name: string;
      cik: string | null;
      sector: string | null;
    }[]
    | null;
  };

  if (!tickers?.length) {
    return NextResponse.json({ error: "No tickers in range" }, { status: 404 });
  }

  // Batch-fetch quotes
  const quotesMap = new Map<string, any>();
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/${tickers.map((t) => t.symbol).join(",")}?apikey=${FMP_KEY}`
    );
    if (res.ok) {
      const data = await res.json();
      for (const q of data || []) {
        quotesMap.set(q.symbol, {
          price: q.price,
          change: q.change,
          changePercent: q.changesPercentage,
          volume: q.volume,
          avgVolume: q.avgVolume,
        });
      }
    }
  } catch {}

  const results: any[] = [];

  for (const ticker of tickers) {
    if (Date.now() - startTime > 50000) break;

    const quote = quotesMap.get(ticker.symbol);
    if (!quote?.price) continue;

    const signals: any[] = [];

    // SEC Form 4
    if (ticker.cik) {
      try {
        const form4s = await getRecentForm4(ticker.cik);
        for (const f4 of form4s.slice(0, 3)) {
          await storeInsiderTrade(ticker.symbol, {
            filerName: f4.filerName,
            filerRole: f4.filerRole,
            tradeType: f4.transactionType,
            shares: f4.shares,
            pricePerShare: f4.pricePerShare,
            totalValue: f4.totalValue,
            sharesOwnedAfter: f4.sharesOwnedAfter,
            filingDate: f4.filingDate,
            transactionDate: f4.transactionDate,
            accessionNumber: f4.accessionNumber,
          });
          const isBuy = f4.transactionType === "P";
          signals.push({
            source: "insider_trade",
            title: `${f4.filerRole} ${f4.filerName} ${isBuy ? "buys" : "sells"} $${((f4.totalValue || 0) / 1e6).toFixed(1)}M`,
            detail: `${(f4.shares || 0).toLocaleString()} shares at $${(f4.pricePerShare || 0).toFixed(2)}`,
            sentiment: isBuy ? "positive" : "negative",
          });
        }
      } catch {}
    }

    // SEC 8-K
    if (ticker.cik) {
      try {
        const filings = await getRecent8K(ticker.cik);
        for (const f of filings.slice(0, 2)) {
          signals.push({
            source: "sec_filing",
            title: `8-K Filed: ${f.description}`,
            detail: `Filed ${f.filingDate}`,
            sentiment: "neutral",
          });
        }
      } catch {}
    }

    // News
    try {
      const news = await getCompanyNews(ticker.symbol, 3);
      for (const n of news.slice(0, 3)) {
        signals.push({
          source: "news_sentiment",
          title: n.title.slice(0, 120),
          detail: n.summary.slice(0, 200),
          sentiment: n.sentiment,
        });
      }
    } catch {}

    // Quote-based signal
    const pctAbs = Math.abs(quote.changePercent || 0);
    signals.push({
      source: "technical",
      title: `${pctAbs > 0.5 ? (quote.changePercent >= 0 ? "Up" : "Down") + " " + pctAbs.toFixed(1) + "%" : "Flat"} at $${quote.price.toFixed(2)}`,
      detail: `Volume: ${quote.volume?.toLocaleString() || "N/A"}`,
      sentiment:
        quote.changePercent > 0.5
          ? "positive"
          : quote.changePercent < -0.5
            ? "negative"
            : "neutral",
    });

    // AI analysis
    try {
      const analysts = await getAnalystRatings(ticker.symbol).catch(() => null);

      const aiResult = await generateCall({
        ticker: ticker.symbol,
        company: ticker.company_name,
        currentPrice: quote.price,
        signals,
        analystConsensus: analysts
          ? {
              buy: analysts.buy + analysts.strongBuy,
              hold: analysts.hold,
              sell: analysts.sell + analysts.strongSell,
              avgTarget: 0,
            }
          : undefined,
      });

      await storeIngestionResults(
        ticker.symbol,
        signals,
        aiResult,
        "gemini-2.5-flash"
      );

      results.push({
        ticker: ticker.symbol,
        status: "ok",
        call: aiResult.call,
        conviction: aiResult.conviction,
        signalCount: signals.length,
      });
    } catch (err) {
      results.push({
        ticker: ticker.symbol,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  const okCount = results.filter((r) => r.status === "ok").length;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  await logIngestion("deep_analysis", "success", okCount);

  return NextResponse.json({
    offset,
    limit,
    processed: results.length,
    ingested: okCount,
    errors: results.filter((r) => r.status === "error").length,
    elapsedSeconds: elapsed,
    nextOffset: offset + limit,
    results,
  });
}
