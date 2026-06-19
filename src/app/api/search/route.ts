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

  // Run DB + Finnhub searches in parallel for speed
  const [dbResults, finnhubResults] = await Promise.all([
    searchDB(supabase, q),
    searchFinnhub(q),
  ]);

  // Merge: DB results first (they have sector info), then Finnhub
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (const r of dbResults) {
    if (!seen.has(r.symbol)) {
      seen.add(r.symbol);
      results.push(r);
    }
  }

  for (const r of finnhubResults) {
    if (!seen.has(r.symbol) && results.length < 20) {
      seen.add(r.symbol);
      results.push(r);
    }
  }

  // If still few results, try FMP as tertiary source
  if (results.length < 5 && FMP_KEY) {
    const fmpResults = await searchFMP(q);
    for (const r of fmpResults) {
      if (!seen.has(r.symbol) && results.length < 20) {
        seen.add(r.symbol);
        results.push(r);
      }
    }
  }

  return NextResponse.json({ results });
}

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  inDb: boolean;
}

async function searchDB(supabase: any, q: string): Promise<SearchResult[]> {
  // Search both active and inactive tickers for broader coverage
  const { data } = await supabase
    .from("tickers")
    .select("symbol, company_name, exchange, sector")
    .or(`symbol.ilike.%${q}%,company_name.ilike.%${q}%`)
    .limit(15);

  return (data || []).map((t: any) => ({
    symbol: t.symbol,
    name: t.company_name,
    exchange: t.exchange,
    sector: t.sector,
    inDb: true,
  }));
}

async function searchFinnhub(q: string): Promise<SearchResult[]> {
  if (!FINNHUB_KEY) return [];

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`
    );
    if (!res.ok) return [];

    const data = await res.json();
    return (data.result || [])
      .filter(
        (item: any) =>
          item.type === "Common Stock" &&
          !item.symbol.includes(".")
      )
      .slice(0, 15)
      .map((item: any) => ({
        symbol: item.symbol,
        name: item.description,
        exchange: item.displaySymbol?.split(":")?.[0] || item.primary_exchange || null,
        sector: null,
        inDb: false,
      }));
  } catch {
    return [];
  }
}

async function searchFMP(q: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/search?query=${encodeURIComponent(q)}&limit=10&apikey=${FMP_KEY}`
    );
    if (!res.ok) return [];

    const data = await res.json();
    return (data || []).map((item: any) => ({
      symbol: item.symbol,
      name: item.name,
      exchange: item.exchangeShortName || item.stockExchange,
      sector: null,
      inDb: false,
    }));
  } catch {
    return [];
  }
}
