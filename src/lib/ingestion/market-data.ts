const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const FMP_KEY = process.env.FMP_API_KEY || "";

interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
  timestamp: number;
}

interface AnalystRating {
  symbol: string;
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string;
}

interface CompanyProfile {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  marketCap: number;
  pe: number;
  week52High: number;
  week52Low: number;
  avgVolume: number;
  description: string;
}

/**
 * Finnhub: Real-time quote
 */
export async function getQuote(symbol: string): Promise<Quote | null> {
  if (!FINNHUB_KEY) return getFMPQuote(symbol);

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`
    );
    const data = await res.json();
    if (!data.c) return null;

    return {
      symbol,
      price: data.c,
      change: data.d,
      changePercent: data.dp,
      high: data.h,
      low: data.l,
      open: data.o,
      previousClose: data.pc,
      volume: 0,
      timestamp: data.t * 1000,
    };
  } catch {
    return getFMPQuote(symbol);
  }
}

async function getFMPQuote(symbol: string): Promise<Quote | null> {
  if (!FMP_KEY) return null;
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${FMP_KEY}`
    );
    const data = await res.json();
    if (!data[0]) return null;
    const q = data[0];
    return {
      symbol,
      price: q.price,
      change: q.change,
      changePercent: q.changesPercentage,
      high: q.dayHigh,
      low: q.dayLow,
      open: q.open,
      previousClose: q.previousClose,
      volume: q.volume,
      timestamp: q.timestamp * 1000,
    };
  } catch {
    return null;
  }
}

/**
 * Finnhub: Analyst recommendations
 */
export async function getAnalystRatings(
  symbol: string
): Promise<AnalystRating | null> {
  if (!FINNHUB_KEY) return null;

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${FINNHUB_KEY}`
    );
    const data = await res.json();
    if (!data[0]) return null;

    const latest = data[0];
    return {
      symbol,
      buy: latest.buy,
      hold: latest.hold,
      sell: latest.sell,
      strongBuy: latest.strongBuy,
      strongSell: latest.strongSell,
      period: latest.period,
    };
  } catch {
    return null;
  }
}

/**
 * FMP: Company profile with fundamentals
 */
export async function getCompanyProfile(
  symbol: string
): Promise<CompanyProfile | null> {
  if (!FMP_KEY) return null;

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${FMP_KEY}`
    );
    const data = await res.json();
    if (!data[0]) return null;

    const p = data[0];
    return {
      symbol: p.symbol,
      name: p.companyName,
      exchange: p.exchangeShortName,
      sector: p.sector,
      industry: p.industry,
      marketCap: p.mktCap,
      pe: p.pe || 0,
      week52High: p.range ? parseFloat(p.range.split("-")[1]) : 0,
      week52Low: p.range ? parseFloat(p.range.split("-")[0]) : 0,
      avgVolume: p.volAvg,
      description: p.description,
    };
  } catch {
    return null;
  }
}

/**
 * FMP: Historical daily prices
 */
export async function getHistoricalPrices(
  symbol: string,
  days = 90
): Promise<{ date: string; close: number; volume: number }[]> {
  if (!FMP_KEY) return [];

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?timeseries=${days}&apikey=${FMP_KEY}`
    );
    const data = await res.json();
    return (data.historical || []).map(
      (d: { date: string; close: number; volume: number }) => ({
        date: d.date,
        close: d.close,
        volume: d.volume,
      })
    );
  } catch {
    return [];
  }
}

/**
 * Batch quotes for multiple symbols
 */
export async function getBatchQuotes(
  symbols: string[]
): Promise<Map<string, Quote>> {
  const quotes = new Map<string, Quote>();
  const batchSize = 5;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((s) => getQuote(s)));
    results.forEach((q) => {
      if (q) quotes.set(q.symbol, q);
    });
    if (i + batchSize < symbols.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return quotes;
}
