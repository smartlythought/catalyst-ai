import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const FMP_KEY = process.env.FMP_API_KEY || "";
const FMP_STABLE = "https://financialmodelingprep.com/stable";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  const supabase = createServiceClient();

  const { data: dbResults } = await supabase
    .from("tickers")
    .select("symbol, company_name, exchange, sector")
    .or(`symbol.ilike.%${q}%,company_name.ilike.%${q}%`)
    .eq("is_active", true)
    .limit(15);

  const results = (dbResults || []).map((t: any) => ({
    symbol: t.symbol,
    name: t.company_name,
    exchange: t.exchange,
    sector: t.sector,
    inDb: true,
  }));

  if (results.length < 5 && FMP_KEY) {
    try {
      const res = await fetch(
        `${FMP_STABLE}/search?query=${encodeURIComponent(q)}&limit=10&apikey=${FMP_KEY}`
      );
      if (res.ok) {
        const fmpData = await res.json();
        const existing = new Set(results.map((r: any) => r.symbol));
        for (const item of fmpData || []) {
          if (!existing.has(item.symbol) && results.length < 15) {
            results.push({
              symbol: item.symbol,
              name: item.name,
              exchange: item.exchangeShortName || item.stockExchange,
              sector: null,
              inDb: false,
            });
          }
        }
      }
    } catch {}
  }

  return NextResponse.json({ results });
}
