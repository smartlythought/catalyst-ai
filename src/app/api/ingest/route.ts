import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRecentForm4, getRecent8K } from "@/lib/ingestion/sec-edgar";
import { getAnalystRatings } from "@/lib/ingestion/market-data";
import { getCompanyNews, classifySentiment } from "@/lib/ingestion/news";
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
  await logIngestion("full_pipeline", "running", 0);

  const supabase = createServiceClient();

  // 1. Get all active tickers
  const { data: allTickers } = await supabase
    .from("tickers")
    .select("id, symbol, company_name, cik, sector")
    .eq("is_active", true) as { data: { id: number; symbol: string; company_name: string; cik: string | null; sector: string | null }[] | null };

  if (!allTickers?.length) {
    return NextResponse.json({ error: "No tickers in database" }, { status: 500 });
  }

  // 2. Batch-fetch quotes for ALL tickers via FMP (~500 per call)
  const quotesMap = new Map<string, any>();
  const symbolChunks = chunkArray(allTickers.map((t) => t.symbol), 500);

  for (const chunk of symbolChunks) {
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/api/v3/quote/${chunk.join(",")}?apikey=${FMP_KEY}`
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
    await delay(150);
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

  // Take top 30 for SEC + news analysis
  const topTickers = scored.slice(0, 30);
  const results: any[] = [];

  // 4. Fetch SEC data + news for top tickers (parallel batches of 5)
  const tickerSignals = new Map<string, any[]>();

  for (const batch of chunkArray(topTickers, 5)) {
    await Promise.all(
      batch.map(async (ticker) => {
        const signals: any[] = [];

        // SEC Form 4 (insider trades)
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

        // SEC 8-K filings
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

        // News sentiment
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

        // Always add quote-based signal so AI has context even without SEC/news
        const q = ticker.quote;
        if (q?.price > 0) {
          const pctAbs = Math.abs(q.changePercent || 0);
          const volRatio = q.avgVolume > 0 ? q.volume / q.avgVolume : 1;
          if (pctAbs > 0.5 || volRatio > 1.2) {
            signals.push({
              source: "technical",
              title: `${q.changePercent >= 0 ? "Up" : "Down"} ${pctAbs.toFixed(1)}% today at $${q.price.toFixed(2)}`,
              detail: `Volume ${volRatio > 1 ? (volRatio.toFixed(1) + "x avg") : "normal"}. Price: $${q.price.toFixed(2)}`,
              sentiment: q.changePercent >= 0 ? "positive" : "negative",
            });
          } else {
            signals.push({
              source: "technical",
              title: `Trading flat at $${q.price.toFixed(2)}`,
              detail: `Change: ${q.changePercent >= 0 ? "+" : ""}${(q.changePercent || 0).toFixed(2)}%. Volume normal.`,
              sentiment: "neutral",
            });
          }
        }

        tickerSignals.set(ticker.symbol, signals);
      })
    );

    if (Date.now() - startTime > 45000) break; // Safety: stop before 60s timeout
  }

  // 5. Run AI analysis on top tickers (max 15, parallel batches of 3)
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
          const analysts = await getAnalystRatings(candidate.symbol).catch(
            () => null
          );

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
                  avgTarget: 0,
                }
              : undefined,
          });

          await storeIngestionResults(
            candidate.symbol,
            candidate.signals,
            aiResult,
            "gemini-2.5-flash"
          );

          results.push({
            ticker: candidate.symbol,
            status: "ok",
            call: aiResult.call,
            conviction: aiResult.conviction,
            signalCount: candidate.signals.length,
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
    skipped: topTickers.length - results.length,
    errors: results.filter((r) => r.status === "error").length,
    totalTickers: allTickers.length,
    screened: topTickers.length,
    aiCandidates: aiCandidates.length,
    quotesFound: quotesMap.size,
    signalsFound: tickerSignals.size,
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
