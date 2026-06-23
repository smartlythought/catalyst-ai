const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const FMP_KEY = process.env.FMP_API_KEY || "";

const FMP_STABLE = "https://financialmodelingprep.com/stable";

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

interface PriceTarget {
  targetHigh: number;
  targetLow: number;
  targetMean: number;
  targetMedian: number;
  lastUpdated: string;
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

export async function getQuote(symbol: string): Promise<Quote | null> {
  // Primary: Finnhub
  if (FINNHUB_KEY) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`
      );
      const data = await res.json();
      if (data.c && data.c > 0) {
        return {
          symbol,
          price: data.c,
          change: data.d || 0,
          changePercent: data.dp || 0,
          high: data.h || 0,
          low: data.l || 0,
          open: data.o || 0,
          previousClose: data.pc || 0,
          volume: 0,
          timestamp: (data.t || 0) * 1000,
        };
      }
    } catch {}
  }

  // Fallback: FMP stable single quote
  if (FMP_KEY) {
    try {
      const res = await fetch(
        `${FMP_STABLE}/quote?symbol=${symbol}&apikey=${FMP_KEY}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      const q = Array.isArray(data) ? data[0] : data;
      if (!q?.price) return null;
      return {
        symbol,
        price: q.price,
        change: q.change || 0,
        changePercent: q.changePercentage || q.changesPercentage || 0,
        high: q.dayHigh || 0,
        low: q.dayLow || 0,
        open: q.open || 0,
        previousClose: q.previousClose || 0,
        volume: q.volume || 0,
        timestamp: (q.timestamp || 0) * 1000,
      };
    } catch {}
  }

  return null;
}

export async function getFMPStableQuote(symbol: string): Promise<Quote | null> {
  if (!FMP_KEY) return null;
  try {
    const res = await fetch(
      `${FMP_STABLE}/quote?symbol=${symbol}&apikey=${FMP_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const q = Array.isArray(data) ? data[0] : data;
    if (!q?.price) return null;
    return {
      symbol,
      price: q.price,
      change: q.change || 0,
      changePercent: q.changePercentage || q.changesPercentage || 0,
      high: q.dayHigh || 0,
      low: q.dayLow || 0,
      open: q.open || 0,
      previousClose: q.previousClose || 0,
      volume: q.volume || 0,
      timestamp: (q.timestamp || 0) * 1000,
    };
  } catch {
    return null;
  }
}

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

export async function getPriceTarget(
  symbol: string
): Promise<PriceTarget | null> {
  if (!FINNHUB_KEY) return null;

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/price-target?symbol=${symbol}&token=${FINNHUB_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.targetMean && !data.targetMedian) return null;

    return {
      targetHigh: data.targetHigh || 0,
      targetLow: data.targetLow || 0,
      targetMean: data.targetMean || 0,
      targetMedian: data.targetMedian || 0,
      lastUpdated: data.lastUpdated || "",
    };
  } catch {
    return null;
  }
}

export async function getCompanyProfile(
  symbol: string
): Promise<CompanyProfile | null> {
  let profile: CompanyProfile | null = null;

  // Try FMP stable profile
  if (FMP_KEY) {
    try {
      const res = await fetch(
        `${FMP_STABLE}/profile?symbol=${symbol}&apikey=${FMP_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        const p = Array.isArray(data) ? data[0] : data;
        if (p?.companyName || p?.name) {
          profile = {
            symbol: p.symbol || symbol,
            name: p.companyName || p.name || symbol,
            exchange: p.exchangeShortName || p.exchange || "",
            sector: p.sector || "",
            industry: p.industry || "",
            marketCap: p.mktCap || p.marketCap || 0,
            pe: p.pe || 0,
            week52High: p.yearHigh || (p.range ? parseFloat(p.range.split("-")[1]) : 0),
            week52Low: p.yearLow || (p.range ? parseFloat(p.range.split("-")[0]) : 0),
            avgVolume: p.volAvg || 0,
            description: p.description || "",
          };
        }
      }
    } catch {}
  }

  // Fallback: Finnhub profile
  if (FINNHUB_KEY) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_KEY}`
      );
      const p = await res.json();
      if (p?.name) {
        profile = {
          symbol: p.ticker || symbol,
          name: p.name,
          exchange: p.exchange || "",
          sector: p.finnhubIndustry || "",
          industry: p.finnhubIndustry || "",
          marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : 0,
          pe: 0,
          week52High: 0,
          week52Low: 0,
          avgVolume: 0,
          description: "",
        };
      }
    } catch {}
  }

  // Enrich with basic financials if key fields are missing
  if (profile && (!profile.pe || !profile.avgVolume)) {
    try {
      const financials = await getBasicFinancials(symbol);
      if (financials) {
        if (!profile.pe && financials.pe) profile.pe = financials.pe;
        if (!profile.avgVolume && financials.avgVolume)
          profile.avgVolume = financials.avgVolume;
        if (!profile.week52High && financials.week52High)
          profile.week52High = financials.week52High;
        if (!profile.week52Low && financials.week52Low)
          profile.week52Low = financials.week52Low;
      }
    } catch {}
  }

  return profile;
}

export async function getBasicFinancials(
  symbol: string
): Promise<{
  pe: number;
  avgVolume: number;
  week52High: number;
  week52Low: number;
} | null> {
  if (!FINNHUB_KEY) return null;

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB_KEY}`
    );
    const data = await res.json();
    const m = data?.metric;
    if (!m) return null;

    return {
      pe: m.peNormalizedAnnual || m.peTTM || 0,
      avgVolume: m["10DayAverageTradingVolume"]
        ? m["10DayAverageTradingVolume"] * 1e6
        : 0,
      week52High: m["52WeekHigh"] || 0,
      week52Low: m["52WeekLow"] || 0,
    };
  } catch {
    return null;
  }
}

export async function getHistoricalPrices(
  symbol: string,
  days = 90
): Promise<{ date: string; close: number; volume: number }[]> {
  if (FMP_KEY) {
    const urls = [
      `${FMP_STABLE}/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_KEY}`,
      `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?apikey=${FMP_KEY}`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.log(`[prices] ${symbol} FMP ${res.status}: ${url.split("?")[0]}`);
          continue;
        }
        const data = await res.json();
        const hist = data?.historical || (Array.isArray(data) ? data : []);
        if (hist.length > 0) {
          console.log(`[prices] ${symbol} FMP OK: ${hist.length} points`);
          return hist.slice(0, days).map(
            (d: { date: string; close: number; volume: number }) => ({
              date: d.date,
              close: d.close,
              volume: d.volume || 0,
            })
          );
        }
        console.log(`[prices] ${symbol} FMP empty response from ${url.split("/stable/")[1]?.split("?")[0] || url.split("/v3/")[1]?.split("?")[0] || "?"}`);
      } catch (e) {
        console.log(`[prices] ${symbol} FMP error:`, e);
      }
    }
  } else {
    console.log(`[prices] ${symbol} no FMP_KEY`);
  }

  if (FINNHUB_KEY) {
    try {
      const to = Math.floor(Date.now() / 1000);
      const from = to - days * 86400;
      const resolution = days <= 1 ? "5" : days > 365 ? "W" : "D";
      const res = await fetch(
        `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_KEY}`
      );
      const data = await res.json();
      if (data.s === "ok" && data.c?.length) {
        console.log(`[prices] ${symbol} Finnhub OK: ${data.c.length} candles`);
        return data.t.map((t: number, i: number) => ({
          date: new Date(t * 1000).toISOString().split("T")[0],
          close: data.c[i],
          volume: data.v?.[i] || 0,
        }));
      }
      console.log(`[prices] ${symbol} Finnhub status: ${data.s}`);
    } catch (e) {
      console.log(`[prices] ${symbol} Finnhub error:`, e);
    }
  } else {
    console.log(`[prices] ${symbol} no FINNHUB_KEY`);
  }

  // Final fallback: Stooq — free, no API key, covers all US stocks.
  // Returns daily EOD CSV (oldest first). Reliable when FMP/Finnhub
  // historical endpoints are plan-gated (they 403 on free tiers).
  try {
    const stooqSymbol = `${symbol.toLowerCase()}.us`;
    const res = await fetch(`https://stooq.com/q/d/l/?s=${stooqSymbol}&i=d`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const csv = await res.text();
      const rows = csv.trim().split("\n");
      // Header: Date,Open,High,Low,Close,Volume
      if (rows.length > 1 && rows[0].toLowerCase().startsWith("date")) {
        const parsed = rows
          .slice(1)
          .map((line) => {
            const cols = line.split(",");
            return {
              date: cols[0],
              close: parseFloat(cols[4]),
              volume: parseInt(cols[5]) || 0,
            };
          })
          .filter((d) => d.date && !isNaN(d.close));
        if (parsed.length > 0) {
          // Newest first to match FMP shape, then slice to requested window.
          const newestFirst = parsed.reverse().slice(0, days);
          console.log(`[prices] ${symbol} Stooq OK: ${newestFirst.length} points`);
          return newestFirst;
        }
      }
      console.log(`[prices] ${symbol} Stooq empty/unparseable`);
    } else {
      console.log(`[prices] ${symbol} Stooq ${res.status}`);
    }
  } catch (e) {
    console.log(`[prices] ${symbol} Stooq error:`, e);
  }

  console.log(`[prices] ${symbol} NO DATA from any source`);
  return [];
}

export async function getBatchQuotes(
  symbols: string[]
): Promise<Map<string, Quote>> {
  const quotes = new Map<string, Quote>();

  // Parallel batches of 5 with rate limiting
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    const results = await Promise.all(batch.map((s) => getQuote(s)));
    for (const q of results) {
      if (q) quotes.set(q.symbol, q);
    }
    if (i + 5 < symbols.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return quotes;
}
