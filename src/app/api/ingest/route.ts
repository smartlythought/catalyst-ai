import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRecentForm4, getRecent8K } from "@/lib/ingestion/sec-edgar";
import { getAnalystRatings, getPriceTarget, getFMPStableQuote } from "@/lib/ingestion/market-data";
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
  await logIngestion("full_pipeline", "running", 0);

  const supabase = createServiceClient();

  // 1. Get all active tickers
  const { data: allTickers } = (await supabase
    .from("tickers")
    .select("id, symbol, company_name, cik, sector")
    .eq("is_active", true)) as {
    data: {
      id: number;
      symbol: string;
      company_name: string;
      cik: string | null;
      sector: string | null;
    }[] | null;
  };

  if (!allTickers?.length) {
    return NextResponse.json(
      { error: "No tickers in database" },
      { status: 500 }
    );
  }

  // 2. Fetch quotes for top 50 tickers using Finnhub + FMP stable
  //    (sequential with rate limiting — Finnhub free = 60 calls/min)
  const quotesMap = new Map<string, any>();
  const tickersToQuote = allTickers.slice(0, 50);

  for (let i = 0; i < tickersToQuote.length; i += 5) {
    if (Date.now() - startTime > 15000) break;

    const batch = tickersToQuote.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (t) => {
        // Try Finnhub first
        if (FINNHUB_KEY) {
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
        }

        // Fallback: FMP stable
        const fmpQ = await getFMPStableQuote(t.symbol);
        if (fmpQ) {
          return {
            symbol: t.symbol,
            price: fmpQ.price,
            change: fmpQ.change,
            changePercent: fmpQ.changePercent,
            volume: fmpQ.volume,
            avgVolume: 0,
          };
        }
        return null;
      })
    );

    for (const r of results) {
      if (r) quotesMap.set(r.symbol, r);
    }
    await delay(250);
  }

  // 3. Score tickers for signal potential
  const scored = allTickers
    .map((t) => {
      const q = quotesMap.get(t.symbol);
      let score = 0;
      if (q) {
        if (Math.abs(q.changePercent || 0) > 3) score += 3;
        else if (Math.abs(q.changePercent || 0) > 1.5) score += 1;
        if (q.volume > (q.avgVolume || 0) * 1.5) score += 2;
        if (q.price > 0) score += 1;
      }
      if (t.cik) score += 1;
      return { ...t, score, quote: q };
    })
    .sort((a, b) => b.score - a.score);

  const topTickers = scored.slice(0, 30);
  const results: any[] = [];

  // 4. Fetch SEC data + news for top tickers
  const tickerSignals = new Map<string, any[]>();

  for (const batch of chunkArray(topTickers, 5)) {
    if (Date.now() - startTime > 35000) break;

    await Promise.all(
      batch.map(async (ticker) => {
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

        // Always add quote-based signal
        const q = ticker.quote;
        if (q?.price > 0) {
          const pctAbs = Math.abs(q.changePercent || 0);
          signals.push({
            source: "technical",
            title: `${pctAbs > 0.5 ? (q.changePercent >= 0 ? "Up" : "Down") + " " + pctAbs.toFixed(1) + "%" : "Flat"} at $${q.price.toFixed(2)}`,
            detail: `Change: ${q.changePercent >= 0 ? "+" : ""}${(q.changePercent || 0).toFixed(2)}%`,
            sentiment:
              q.changePercent > 0.5
                ? "positive"
                : q.changePercent < -0.5
                  ? "negative"
                  : "neutral",
          });
        }

        tickerSignals.set(ticker.symbol, signals);
      })
    );
  }

  // 5. AI analysis on top 15 tickers with most signals
  const aiCandidates = [...tickerSignals.entries()]
    .map(([symbol, signals]) => ({
      symbol,
      signals,
      ticker: topTickers.find((t) => t.symbol === symbol)!,
      quote: quotesMap.get(symbol),
    }))
    .filter((c) => c.quote?.price > 0)
    .sort((a, b) => b.signals.length - a.signals.length)
    .slice(0, 15);

  for (const batch of chunkArray(aiCandidates, 3)) {
    if (Date.now() - startTime > 50000) break;

    await Promise.all(
      batch.map(async (candidate) => {
        try {
          const [analysts, priceTarget] = await Promise.all([
            getAnalystRatings(candidate.symbol).catch(() => null),
            getPriceTarget(candidate.symbol).catch(() => null),
          ]);

          const avgTarget = priceTarget?.targetMean || priceTarget?.targetMedian || 0;

          const aiResult = await generateCall({
            ticker: candidate.symbol,
            company: candidate.ticker.company_name,
            currentPrice: candidate.quote.price,
            signals: candidate.signals,
            analystConsensus: analysts
              ? {
                  buy: analysts.buy + analysts.strongBuy,
                  hold: analysts.hold,
                  sell: analysts.sell + analysts.strongSell,
                  avgTarget,
                }
              : undefined,
          });

          await storeIngestionResults(
            candidate.symbol,
            candidate.signals,
            aiResult,
            "gemini-2.5-flash"
          );

          // Dispatch alerts for high-conviction signals
          let whatsappSent = 0;
          let emailSent = 0;
          if (aiResult.call !== "WATCH" && aiResult.conviction >= 65) {
            const alertPayload = {
              ticker: candidate.symbol,
              call: aiResult.call,
              conviction: aiResult.conviction,
              price: candidate.quote.price,
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

          results.push({
            ticker: candidate.symbol,
            status: "ok",
            call: aiResult.call,
            conviction: aiResult.conviction,
            signalCount: candidate.signals.length,
            whatsappSent,
            emailSent,
          });
        } catch (err) {
          results.push({
            ticker: candidate.symbol,
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      })
    );
  }

  const okCount = results.filter((r) => r.status === "ok").length;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  await logIngestion("full_pipeline", "success", okCount);

  return NextResponse.json({
    ingested: okCount,
    errors: results.filter((r) => r.status === "error").length,
    totalTickers: allTickers.length,
    quotesFound: quotesMap.size,
    signalsFound: tickerSignals.size,
    aiCandidates: aiCandidates.length,
    elapsedSeconds: elapsed,
    results,
  });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
