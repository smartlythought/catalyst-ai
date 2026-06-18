import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const FMP_KEY = process.env.FMP_API_KEY || "";

export async function GET() {
  const supabase = createServiceClient();

  const [callStats, sectorData, gainersLosers] = await Promise.all([
    getCallStats(supabase),
    getSectorPerformance(),
    getGainersLosers(),
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

async function getSectorPerformance() {
  if (!FMP_KEY) return [];
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/sector-performance?apikey=${FMP_KEY}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((s: any) => ({
      sector: s.sector,
      change: parseFloat(s.changesPercentage?.replace("%", "") || "0"),
    }));
  } catch {
    return [];
  }
}

async function getGainersLosers() {
  if (!FMP_KEY) return { gainers: [], losers: [], mostActive: [] };
  try {
    const [gRes, lRes, aRes] = await Promise.all([
      fetch(
        `https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${FMP_KEY}`
      ),
      fetch(
        `https://financialmodelingprep.com/api/v3/stock_market/losers?apikey=${FMP_KEY}`
      ),
      fetch(
        `https://financialmodelingprep.com/api/v3/stock_market/actives?apikey=${FMP_KEY}`
      ),
    ]);

    const [gainers, losers, actives] = await Promise.all([
      gRes.ok ? gRes.json() : [],
      lRes.ok ? lRes.json() : [],
      aRes.ok ? aRes.json() : [],
    ]);

    const mapItem = (item: any) => ({
      symbol: item.symbol,
      name: item.name,
      price: item.price,
      change: item.change,
      changePercent: item.changesPercentage,
    });

    return {
      gainers: (gainers || []).slice(0, 5).map(mapItem),
      losers: (losers || []).slice(0, 5).map(mapItem),
      mostActive: (actives || []).slice(0, 5).map(mapItem),
    };
  } catch {
    return { gainers: [], losers: [], mostActive: [] };
  }
}
