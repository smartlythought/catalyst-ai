import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const FMP_KEY = process.env.FMP_API_KEY || "";

const MARKET_UNIVERSE = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology" },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology" },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Technology" },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Technology" },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Consumer Cyclical" },
  { symbol: "META", name: "Meta Platforms Inc.", sector: "Technology" },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Consumer Cyclical" },
  { symbol: "AVGO", name: "Broadcom Inc.", sector: "Technology" },
  { symbol: "AMD", name: "AMD Inc.", sector: "Technology" },
  { symbol: "PLTR", name: "Palantir Technologies", sector: "Technology" },
  { symbol: "CRWV", name: "CoreWeave Inc.", sector: "Technology" },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financial Services" },
  { symbol: "V", name: "Visa Inc.", sector: "Financial Services" },
  { symbol: "UNH", name: "UnitedHealth Group", sector: "Healthcare" },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare" },
  { symbol: "XOM", name: "Exxon Mobil Corp.", sector: "Energy" },
  { symbol: "WMT", name: "Walmart Inc.", sector: "Consumer Defensive" },
  { symbol: "PG", name: "Procter & Gamble", sector: "Consumer Defensive" },
  { symbol: "HD", name: "Home Depot Inc.", sector: "Consumer Cyclical" },
  { symbol: "CRM", name: "Salesforce Inc.", sector: "Technology" },
  { symbol: "NFLX", name: "Netflix Inc.", sector: "Communication Services" },
  { symbol: "COST", name: "Costco Wholesale", sector: "Consumer Defensive" },
  { symbol: "BA", name: "Boeing Co.", sector: "Industrials" },
  { symbol: "DIS", name: "Walt Disney Co.", sector: "Communication Services" },
  { symbol: "COIN", name: "Coinbase Global", sector: "Financial Services" },
  { symbol: "ARM", name: "Arm Holdings", sector: "Technology" },
  { symbol: "SMCI", name: "Super Micro Computer", sector: "Technology" },
  { symbol: "SNOW", name: "Snowflake Inc.", sector: "Technology" },
  { symbol: "UBER", name: "Uber Technologies", sector: "Technology" },
  { symbol: "SQ", name: "Block Inc.", sector: "Financial Services" },
];

interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  sector: string;
}

/** Fetch Finnhub quotes for the entire MARKET_UNIVERSE. */
async function fetchMarketQuotes(): Promise<MarketQuote[]> {
  if (!FINNHUB_KEY) return [];

  const results: MarketQuote[] = [];

  // Batch in groups of 10 — Finnhub allows 60 calls/min, 30 stocks is fine
  const batchSize = 10;
  for (let i = 0; i < MARKET_UNIVERSE.length; i += batchSize) {
    const batch = MARKET_UNIVERSE.slice(i, i + batchSize);
    const quotes = await Promise.all(
      batch.map(async (stock) => {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${stock.symbol}&token=${FINNHUB_KEY}`,
            { next: { revalidate: 300 } }
          );
          const d = await res.json();
          if (d.c > 0) {
            return {
              symbol: stock.symbol,
              name: stock.name,
              price: d.c,
              change: d.d ?? 0,
              changePercent: d.dp ?? 0,
              sector: stock.sector,
            };
          }
          return null;
        } catch {
          return null;
        }
      })
    );
    for (const q of quotes) {
      if (q) results.push(q);
    }
  }

  return results;
}

interface MoverItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

/**
 * Fetch real market-wide movers from FMP. These are the actual top gainers/
 * losers/most-active across the whole US market — not limited to a curated
 * list. `most-actives` is sorted by real trading volume.
 * Tries the stable API first, falls back to v3.
 */
async function fetchFMPMovers(
  kind: "gainers" | "losers" | "actives"
): Promise<MoverItem[]> {
  if (!FMP_KEY) return [];

  const stablePath =
    kind === "gainers"
      ? "biggest-gainers"
      : kind === "losers"
        ? "biggest-losers"
        : "most-active"; // stable endpoint is singular

  const urls = [
    `https://financialmodelingprep.com/stable/${stablePath}?apikey=${FMP_KEY}`,
    `https://financialmodelingprep.com/api/v3/stock_market/${kind}?apikey=${FMP_KEY}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { next: { revalidate: 120 } });
      if (!res.ok) {
        console.log(`[pulse] FMP ${kind} ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;
      return data
        .map((d: any) => ({
          symbol: d.symbol,
          name: d.name || d.symbol,
          price: d.price ?? 0,
          change: d.change ?? 0,
          changePercent:
            typeof d.changesPercentage === "number"
              ? d.changesPercentage
              : parseFloat(String(d.changesPercentage || "0").replace(/[()%]/g, "")) || 0,
        }))
        .filter((d: MoverItem) => d.symbol && d.price > 0)
        .slice(0, 10);
    } catch (e) {
      console.log(`[pulse] FMP ${kind} error:`, e);
    }
  }
  return [];
}

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServiceClient();

  // Real market-wide movers from FMP + curated universe quotes for sectors.
  const [callStats, liveQuotes, fmpGainers, fmpLosers, fmpActives] =
    await Promise.all([
      getCallStats(supabase),
      fetchMarketQuotes(),
      fetchFMPMovers("gainers"),
      fetchFMPMovers("losers"),
      fetchFMPMovers("actives"),
    ]);

  // Fall back to universe-derived movers only if FMP returns nothing.
  const fallback = getGainersLosers(liveQuotes);
  const sectorData = getSectorPerformance(liveQuotes);

  return NextResponse.json({
    callStats,
    sectors: sectorData,
    gainers: fmpGainers.length > 0 ? fmpGainers.slice(0, 5) : fallback.gainers,
    losers: fmpLosers.length > 0 ? fmpLosers.slice(0, 5) : fallback.losers,
    mostActive:
      fmpActives.length > 0 ? fmpActives.slice(0, 5) : fallback.mostActive,
    updatedAt: new Date().toISOString(),
  });
}

async function getCallStats(supabase: any) {
  const { data: calls } = await supabase
    .from("calls")
    .select("call, conviction")
    .eq("is_active", true);

  const all = calls || [];
  return {
    total: all.length,
    buy: all.filter((c: any) => c.call === "BUY").length,
    reduce: all.filter((c: any) => c.call === "REDUCE").length,
    watch: all.filter((c: any) => c.call === "WATCH").length,
    avgConviction:
      all.length > 0
        ? Math.round(
            all.reduce((s: number, c: any) => s + c.conviction, 0) / all.length
          )
        : 0,
    highConviction: all.filter((c: any) => c.conviction >= 80).length,
  };
}

/**
 * Derive sector performance from live quotes.
 * Groups by sector and averages changePercent.
 */
function getSectorPerformance(
  quotes: MarketQuote[]
): { sector: string; change: number }[] {
  if (quotes.length === 0) return [];

  const sectorAgg = new Map<string, { total: number; count: number }>();
  for (const q of quotes) {
    const entry = sectorAgg.get(q.sector) || { total: 0, count: 0 };
    entry.total += q.changePercent;
    entry.count++;
    sectorAgg.set(q.sector, entry);
  }

  return [...sectorAgg.entries()]
    .map(([sector, data]) => ({
      sector,
      change: parseFloat((data.total / data.count).toFixed(2)),
    }))
    .sort((a, b) => b.change - a.change);
}

/**
 * Compute gainers, losers, and most-active from live Finnhub quotes
 * over the curated MARKET_UNIVERSE. No DB dependency.
 */
function getGainersLosers(quotes: MarketQuote[]): {
  gainers: { symbol: string; name: string; price: number; change: number; changePercent: number }[];
  losers: { symbol: string; name: string; price: number; change: number; changePercent: number }[];
  mostActive: { symbol: string; name: string; price: number; change: number; changePercent: number }[];
} {
  const empty = { gainers: [], losers: [], mostActive: [] };
  if (quotes.length < 3) return empty;

  const toItem = (q: MarketQuote) => ({
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    change: q.change,
    changePercent: q.changePercent,
  });

  const sorted = [...quotes].sort((a, b) => b.changePercent - a.changePercent);
  const byAbsChange = [...quotes].sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)
  );

  return {
    gainers: sorted
      .filter((q) => q.changePercent > 0)
      .slice(0, 5)
      .map(toItem),
    losers: sorted
      .filter((q) => q.changePercent < 0)
      .reverse()
      .slice(0, 5)
      .map(toItem),
    mostActive: byAbsChange.slice(0, 5).map(toItem),
  };
}
