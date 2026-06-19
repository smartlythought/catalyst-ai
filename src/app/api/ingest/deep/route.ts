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
import { dispatchSignalAlerts } from "@/lib/whatsapp";
import { dispatchEmailAlerts } from "@/lib/email";

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";

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

  // Fetch quotes individually via Finnhub
  const quotesMap = new Map<string, any>();
  for (let i = 0; i < tickers.length; i += 5) {
    if (Date.now() - startTime > 10000) break;

    const batch = tickers.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (t) => {
        if (!FINNHUB_KEY) return null;
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${t.symbol}&token=${FINNHUB_KEY}`
          );
          const data = await res.json();
          if (data.c > 0) {
            return {
              symbol: t.symbol,
              price: data.c,
              change: data.d || 0,
              changePercent: data.dp || 0,
              volume: 0,
              avgVolume: 0,
            };
          }
        } catch {}
        return null;
      })
    );

    for (const r of results) {
      if (r) quotesMap.set(r.symbol, r);
    }
    await delay(250);
  }

  const processResults: any[] = [];

  for (const ticker of tickers) {
    if (Date.now() - startTime > 50000) break;

    const quote = quotesMap.get(ticker.symbol);
    if (!quote?.price) continue;

    const signals: any[] = [];

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

    const pctAbs = Math.abs(quote.changePercent || 0);
    signals.push({
      source: "technical",
      title: `${pctAbs > 0.5 ? (quote.changePercent >= 0 ? "Up" : "Down") + " " + pctAbs.toFixed(1) + "%" : "Flat"} at $${quote.price.toFixed(2)}`,
      detail: `Change: ${quote.changePercent >= 0 ? "+" : ""}${(quote.changePercent || 0).toFixed(2)}%`,
      sentiment:
        quote.changePercent > 0.5
          ? "positive"
          : quote.changePercent < -0.5
            ? "negative"
            : "neutral",
    });

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

      let whatsappSent = 0;
      let emailSent = 0;
      if (aiResult.call !== "WATCH" && aiResult.conviction >= 65) {
        const alertPayload = {
          ticker: ticker.symbol,
          call: aiResult.call,
          conviction: aiResult.conviction,
          price: quote.price,
          entry: aiResult.entryPrice ?? undefined,
          target: aiResult.targetPrice ?? undefined,
          stop: aiResult.stopPrice ?? undefined,
          why: aiResult.why,
        };
        [whatsappSent, emailSent] = await Promise.all([
          dispatchSignalAlerts(alertPayload).catch(() => 0),
          dispatchEmailAlerts(alertPayload).catch(() => 0),
        ]);
      }

      processResults.push({
        ticker: ticker.symbol,
        status: "ok",
        call: aiResult.call,
        conviction: aiResult.conviction,
        signalCount: signals.length,
        whatsappSent,
        emailSent,
      });
    } catch (err) {
      processResults.push({
        ticker: ticker.symbol,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  const okCount = processResults.filter((r) => r.status === "ok").length;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  await logIngestion("deep_analysis", "success", okCount);

  return NextResponse.json({
    offset,
    limit,
    processed: processResults.length,
    ingested: okCount,
    quotesFound: quotesMap.size,
    errors: processResults.filter((r) => r.status === "error").length,
    elapsedSeconds: elapsed,
    nextOffset: offset + limit,
    results: processResults,
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
