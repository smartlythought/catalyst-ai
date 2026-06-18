import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";

export async function GET() {
  const supabase = createServiceClient();

  const [callStats, sectorData, gainersLosers] = await Promise.all([
    getCallStats(supabase),
    getSectorPerformance(supabase),
    getGainersLosers(supabase),
  ]);

  return NextResponse.json({
    callStats,
    sectors: sectorData,
    gainers: gainersLosers.gainers,
    losers: gainersLosers.losers,
    mostActive: gainersLosers.mostActive,
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

async function getSectorPerformance(supabase: any) {
  const { data: calls } = await supabase
    .from("calls")
    .select("ticker_symbol, call, conviction")
    .eq("is_active", true);

  if (!calls?.length) return [];

  const symbols = [...new Set(calls.map((c: any) => c.ticker_symbol))];
  const { data: tickers } = await supabase
    .from("tickers")
    .select("symbol, sector")
    .in("symbol", symbols);

  const sectorMap = new Map<string, string>();
  for (const t of tickers || []) {
    if (t.sector) sectorMap.set(t.symbol, t.sector);
  }

  const sectors = new Map<string, { bullish: number; total: number }>();
  for (const c of calls) {
    const sector = sectorMap.get(c.ticker_symbol) || "Unknown";
    const entry = sectors.get(sector) || { bullish: 0, total: 0 };
    entry.total++;
    if (c.call === "BUY") entry.bullish++;
    sectors.set(sector, entry);
  }

  return [...sectors.entries()]
    .map(([sector, data]) => ({
      sector,
      bullishPercent: Math.round((data.bullish / data.total) * 100),
      signalCount: data.total,
    }))
    .sort((a, b) => b.signalCount - a.signalCount);
}

async function getGainersLosers(supabase: any) {
  const { data: calls } = await supabase
    .from("calls")
    .select("ticker_symbol, call, conviction, price_at_call, target_price")
    .eq("is_active", true)
    .order("conviction", { ascending: false });

  if (!calls?.length) {
    return { gainers: [], losers: [], mostActive: [] };
  }

  const mapItem = (c: any) => ({
    symbol: c.ticker_symbol,
    call: c.call,
    conviction: c.conviction,
    price: c.price_at_call,
    targetPrice: c.target_price,
    upsidePercent: c.target_price && c.price_at_call
      ? Math.round(((c.target_price - c.price_at_call) / c.price_at_call) * 100)
      : 0,
  });

  const buys = calls.filter((c: any) => c.call === "BUY");
  const sells = calls.filter((c: any) => c.call === "REDUCE");
  const active = calls.slice(0, 10);

  // Try Finnhub for live top movers
  if (FINNHUB_KEY) {
    try {
      const topSymbols = calls.slice(0, 20).map((c: any) => c.ticker_symbol);
      const quotes = await Promise.all(
        topSymbols.slice(0, 10).map(async (sym: string) => {
          try {
            const res = await fetch(
              `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`
            );
            const d = await res.json();
            return d.c > 0
              ? { symbol: sym, price: d.c, change: d.d || 0, changePercent: d.dp || 0 }
              : null;
          } catch {
            return null;
          }
        })
      );

      const liveQuotes = quotes.filter(Boolean) as any[];
      if (liveQuotes.length >= 5) {
        const sorted = [...liveQuotes].sort((a, b) => b.changePercent - a.changePercent);
        return {
          gainers: sorted.filter((q) => q.changePercent > 0).slice(0, 5),
          losers: sorted.filter((q) => q.changePercent < 0).slice(-5).reverse(),
          mostActive: sorted.slice(0, 5),
        };
      }
    } catch {}
  }

  return {
    gainers: buys.slice(0, 5).map(mapItem),
    losers: sells.slice(0, 5).map(mapItem),
    mostActive: active.slice(0, 5).map(mapItem),
  };
}
