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
  // Extra signals — free in the same quote response, used to enrich AI analysis.
  forwardPE: number;
  epsTtm: number;
  epsForward: number;
  week52ChangePct: number;
  dividendYield: number;
  analystRating: string; // e.g. "1.5 - Strong Buy"
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
    forwardPE: r.forwardPE || 0,
    epsTtm: r.epsTrailingTwelveMonths || 0,
    epsForward: r.epsForward || 0,
    week52ChangePct: r.fiftyTwoWeekChangePercent || 0,
    dividendYield: r.dividendYield || 0,
    analystRating: r.averageAnalystRating || "",
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

export interface MarketContext {
  tenYearYield: number; // ^TNX
  vix: number; // ^VIX
  sp500ChangePct: number; // ^GSPC
  nasdaqChangePct: number; // ^IXIC
  dowChangePct: number; // ^DJI
}

/** Free macro snapshot from Yahoo index quotes — no API key needed. */
export async function yahooMarketContext(): Promise<MarketContext | null> {
  try {
    const res = await yf.quote(["^TNX", "^VIX", "^GSPC", "^IXIC", "^DJI"]);
    const arr = Array.isArray(res) ? res : [res];
    const m = new Map(arr.map((r: any) => [r.symbol, r]));
    const px = (s: string) => m.get(s)?.regularMarketPrice || 0;
    const chg = (s: string) => m.get(s)?.regularMarketChangePercent || 0;
    return {
      tenYearYield: px("^TNX"),
      vix: px("^VIX"),
      sp500ChangePct: chg("^GSPC"),
      nasdaqChangePct: chg("^IXIC"),
      dowChangePct: chg("^DJI"),
    };
  } catch {
    return null;
  }
}

export interface YahooFundamentals {
  recommendationKey: string;
  targetMeanPrice: number;
  profitMargin: number;
  returnOnEquity: number;
  revenueGrowth: number;
  earningsGrowth: number;
  debtToEquity: number;
  pegRatio: number;
  beta: number;
  shortPercentOfFloat: number;
  analystTrend: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  } | null;
}

/** Deep fundamentals + analyst trend from Yahoo quoteSummary — free, keyless. */
export async function yahooFundamentals(
  symbol: string
): Promise<YahooFundamentals | null> {
  try {
    const qs: any = await yf.quoteSummary(symbol, {
      modules: ["financialData", "defaultKeyStatistics", "recommendationTrend"],
    });
    const f = qs.financialData || {};
    const k = qs.defaultKeyStatistics || {};
    const rt = qs.recommendationTrend?.trend?.[0];
    return {
      recommendationKey: f.recommendationKey || "",
      targetMeanPrice: f.targetMeanPrice || 0,
      profitMargin: f.profitMargins || 0,
      returnOnEquity: f.returnOnEquity || 0,
      revenueGrowth: f.revenueGrowth || 0,
      earningsGrowth: f.earningsGrowth || 0,
      debtToEquity: f.debtToEquity || 0,
      pegRatio: k.pegRatio || 0,
      beta: k.beta || 0,
      shortPercentOfFloat: k.shortPercentOfFloat || 0,
      analystTrend: rt
        ? {
            strongBuy: rt.strongBuy || 0,
            buy: rt.buy || 0,
            hold: rt.hold || 0,
            sell: rt.sell || 0,
            strongSell: rt.strongSell || 0,
          }
        : null,
    };
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
