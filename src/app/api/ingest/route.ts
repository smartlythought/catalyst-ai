import { NextRequest, NextResponse } from "next/server";
import { getRecentForm4, getRecent8K } from "@/lib/ingestion/sec-edgar";
import { getQuote, getAnalystRatings } from "@/lib/ingestion/market-data";
import { generateCall } from "@/lib/ai/gemini";
import {
  storeIngestionResults,
  storeInsiderTrade,
  logIngestion,
} from "@/lib/supabase/queries";

const TRACKED_TICKERS = [
  { symbol: "NVDA", cik: "1045810", company: "NVIDIA Corporation" },
  { symbol: "AAPL", cik: "320193", company: "Apple Inc." },
  { symbol: "MSFT", cik: "789019", company: "Microsoft Corporation" },
  { symbol: "GOOGL", cik: "1652044", company: "Alphabet Inc." },
  { symbol: "META", cik: "1326801", company: "Meta Platforms, Inc." },
  { symbol: "TSLA", cik: "1318605", company: "Tesla, Inc." },
  { symbol: "AMD", cik: "2488", company: "Advanced Micro Devices, Inc." },
  { symbol: "AMZN", cik: "1018724", company: "Amazon.com, Inc." },
];

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await logIngestion("full_pipeline", "running", 0);
  const results = [];

  for (const ticker of TRACKED_TICKERS) {
    try {
      const [form4s, filings8k, quote, analysts] = await Promise.all([
        getRecentForm4(ticker.cik).catch(() => []),
        getRecent8K(ticker.cik).catch(() => []),
        getQuote(ticker.symbol),
        getAnalystRatings(ticker.symbol),
      ]);

      if (!quote) {
        results.push({
          ticker: ticker.symbol,
          status: "skip",
          reason: "no quote",
        });
        continue;
      }

      for (const f4 of form4s.slice(0, 5)) {
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
      }

      const signals: {
        source: string;
        title: string;
        detail: string;
        sentiment: string;
      }[] = [];

      for (const f4 of form4s.slice(0, 5)) {
        const isBuy = f4.transactionType === "P";
        signals.push({
          source: "insider_trade",
          title: `${f4.filerRole} ${f4.filerName} ${isBuy ? "buys" : "sells"} $${(f4.totalValue / 1e6).toFixed(1)}M`,
          detail: `${f4.shares.toLocaleString()} shares at $${f4.pricePerShare.toFixed(2)} on ${f4.transactionDate}`,
          sentiment: isBuy ? "positive" : "negative",
        });
      }

      for (const f8k of filings8k.slice(0, 3)) {
        signals.push({
          source: "sec_filing",
          title: `8-K Filed: ${f8k.description}`,
          detail: `Filed ${f8k.filingDate}`,
          sentiment: "neutral",
        });
      }

      if (signals.length === 0) {
        results.push({
          ticker: ticker.symbol,
          status: "skip",
          reason: "no signals",
        });
        continue;
      }

      const aiResult = await generateCall({
        ticker: ticker.symbol,
        company: ticker.company,
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

      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      results.push({
        ticker: ticker.symbol,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const okCount = results.filter((r) => r.status === "ok").length;
  await logIngestion("full_pipeline", "success", okCount);

  return NextResponse.json({
    ingested: okCount,
    skipped: results.filter((r) => r.status === "skip").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  });
}
