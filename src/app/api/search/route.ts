import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const FMP_KEY = process.env.FMP_API_KEY || "";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  const supabase = createServiceClient();

  // 1. Search our DB first (symbol or company name)
  const { data: dbResults } = await supabase
    .from("tickers")
    .select("symbol, company_name, exchange, sector")
    .or(`symbol.ilike.%${q}%,company_name.ilike.%${q}%`)
    .eq("is_active", true)
    .limit(15);

  const results: {
    symbol: string;
    name: string;
    exchange: string | null;
    sector: string | null;
    inDb: boolean;
  }[] = (dbResults || []).map((t: any) => ({
    symbol: t.symbol,
    name: t.company_name,
    exchange: t.exchange,
    sector: t.sector,
    inDb: true,
  }));

  // 2. If DB results are sparse, search Finnhub (primary fallback)
  if (results.length < 5 && FINNHUB_KEY) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        const existing = new Set(results.map((r) => r.symbol));
        for (const item of data.result || []) {
          if (
            !existing.has(item.symbol) &&
            results.length < 15 &&
            item.type === "Common Stock" &&
            !item.symbol.includes(".")
          ) {
            results.push({
              symbol: item.symbol,
              name: item.description,
              exchange: item.displaySymbol?.split(":")?.[0] || null,
              sector: null,
              inDb: false,
            });
          }
        }
      }
    } catch {}
  }

  // 3. If still sparse, try FMP stable search
  if (results.length < 5 && FMP_KEY) {
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/search?query=${encodeURIComponent(q)}&limit=10&apikey=${FMP_KEY}`
      );
      if (res.ok) {
        const fmpData = await res.json();
        const existing = new Set(results.map((r) => r.symbol));
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
