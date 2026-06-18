import { NextRequest, NextResponse } from "next/server";
import { getRecentForm4, getRecent8K } from "@/lib/ingestion/sec-edgar";
import { getQuote, getAnalystRatings } from "@/lib/ingestion/market-data";
import { generateCall } from "@/lib/ai/gemini";

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

  const results = [];

  for (const ticker of TRACKED_TICKERS) {
    try {
      // 1. Fetch signals from multiple sources in parallel
      const [form4s, filings8k, quote, analysts] = await Promise.all([
        getRecentForm4(ticker.cik).catch(() => []),
        getRecent8K(ticker.cik).catch(() => []),
        getQuote(ticker.symbol),
        getAnalystRatings(ticker.symbol),
      ]);

      if (!quote) {
        results.push({ ticker: ticker.symbol, status: "skip", reason: "no quote" });
        continue;
      }

      // 2. Build signal inputs for AI
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
        results.push({ ticker: ticker.symbol, status: "skip", reason: "no signals" });
        continue;
      }

      // 3. Generate AI call
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

      results.push({
        ticker: ticker.symbol,
        status: "ok",
        call: aiResult.call,
        conviction: aiResult.conviction,
        signalCount: signals.length,
      });

      // TODO: Store in Supabase
      // const supabase = createServiceClient();
      // await supabase.from('calls').insert({ ... });

      // Rate limit between tickers
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      results.push({
        ticker: ticker.symbol,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    ingested: results.filter((r) => r.status === "ok").length,
    skipped: results.filter((r) => r.status === "skip").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  });
}
