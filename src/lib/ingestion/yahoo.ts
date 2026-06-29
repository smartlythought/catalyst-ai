import YahooFinance from "yahoo-finance2";

// Single shared instance. Yahoo Finance data is free, keyless, and effectively
// unlimited — the Node equivalent of Python's yfinance. Used as the primary
// fast source for batch quotes (the picks scan) and as a reliable fallback for
// quotes / historical prices when the FMP / Finnhub free tiers flake out.
const yf = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

export interface YahooQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number;
  pe: number;
  week52High: number;
  week52Low: number;
  volume: number;
  name: string;
  open: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
}

function normalize(r: any): YahooQuote {
  return {
    symbol: r.symbol,
    price: r.regularMarketPrice || 0,
    change: r.regularMarketChange || 0,
    changePercent: r.regularMarketChangePercent || 0,
    marketCap: r.marketCap || 0,
    pe: r.trailingPE || r.forwardPE || 0,
    week52High: r.fiftyTwoWeekHigh || 0,
    week52Low: r.fiftyTwoWeekLow || 0,
    volume: r.regularMarketVolume || 0,
    name: r.shortName || r.longName || r.symbol,
    open: r.regularMarketOpen || 0,
    previousClose: r.regularMarketPreviousClose || 0,
    dayHigh: r.regularMarketDayHigh || 0,
    dayLow: r.regularMarketDayLow || 0,
  };
}

/** Batch quotes for many symbols. Chunked; resilient to partial failures. */
export async function yahooBatchQuotes(
  symbols: string[]
): Promise<Map<string, YahooQuote>> {
  const out = new Map<string, YahooQuote>();
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    try {
      const res = await yf.quote(chunk);
      const arr = Array.isArray(res) ? res : [res];
      for (const r of arr) {
        if (!r?.symbol || !(r.regularMarketPrice > 0)) continue;
        out.set(r.symbol, normalize(r));
      }
    } catch {
      // Skip the failed chunk; other chunks still populate.
    }
  }
  return out;
}

export async function yahooQuote(symbol: string): Promise<YahooQuote | null> {
  try {
    const r = await yf.quote(symbol);
    const q = Array.isArray(r) ? r[0] : r;
    if (!q?.regularMarketPrice) return null;
    return normalize(q);
  } catch {
    return null;
  }
}

/**
 * Historical daily closes, returned NEWEST-first to match the FMP convention
 * the rest of the app expects.
 */
export async function yahooHistorical(
  symbol: string,
  days: number
): Promise<{ date: string; close: number; volume: number }[]> {
  try {
    const period2 = new Date();
    const period1 = new Date(period2.getTime() - days * 86400000);
    const interval = days > 365 ? "1wk" : "1d";
    const res = await yf.chart(symbol, { period1, period2, interval });
    const quotes = res?.quotes || [];
    const rows = quotes
      .filter((q: any) => q.close != null)
      .map((q: any) => ({
        date: (q.date instanceof Date
          ? q.date
          : new Date(q.date)
        )
          .toISOString()
          .split("T")[0],
        close: q.close as number,
        volume: (q.volume as number) || 0,
      }));
    // Yahoo returns oldest-first; flip to newest-first.
    return rows.reverse();
  } catch {
    return [];
  }
}
