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

  // Run DB + Finnhub searches in parallel for speed.
  // searchDB tries both the raw query and a space-stripped variant so
  // multi-word queries like "service now" match "ServiceNow".
  const [dbResults, finnhubResults] = await Promise.all([
    searchDB(supabase, q),
    searchFinnhub(q),
  ]);

  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const r of [...dbResults, ...finnhubResults]) {
    if (!seen.has(r.symbol)) {
      seen.add(r.symbol);
      merged.push(r);
    }
  }

  // Always consult FMP — it has the broadest name coverage. Cheap to merge.
  if (merged.length < 8 && FMP_KEY) {
    const fmpResults = await searchFMP(q);
    for (const r of fmpResults) {
      if (!seen.has(r.symbol)) {
        seen.add(r.symbol);
        merged.push(r);
      }
    }
  }

  const upper = q.toUpperCase();
  const lower = q.toLowerCase();
  // Stripped variant ("servicenow") for compound-name matching.
  const upperNoSpace = upper.replace(/\s+/g, "");
  const lowerNoSpace = lower.replace(/\s+/g, "");
  merged.sort(
    (a, b) =>
      relevanceScore(a, upper, lower, upperNoSpace, lowerNoSpace) -
      relevanceScore(b, upper, lower, upperNoSpace, lowerNoSpace)
  );

  return NextResponse.json({ results: merged.slice(0, 20) });
}

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  inDb: boolean;
}

async function searchDB(supabase: any, q: string): Promise<SearchResult[]> {
  // Build OR filters for the raw query plus a space-stripped variant, so a
  // query like "service now" also matches "ServiceNow". Commas/parens in the
  // query would break PostgREST's .or() syntax, so sanitize them out.
  const clean = (s: string) => s.replace(/[,()*]/g, "").trim();
  const variants = Array.from(
    new Set([clean(q), clean(q.replace(/\s+/g, ""))].filter(Boolean))
  );
  const orFilter = variants
    .flatMap((v) => [`symbol.ilike.%${v}%`, `company_name.ilike.%${v}%`])
    .join(",");

  const { data } = await supabase
    .from("tickers")
    .select("symbol, company_name, exchange, sector")
    .or(orFilter)
    .limit(20);

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

  // Query the raw term and, if it contains spaces, the stripped variant too.
  const noSpace = q.replace(/\s+/g, "");
  const queries = noSpace !== q ? [q, noSpace] : [q];

  const fetchOne = async (term: string): Promise<SearchResult[]> => {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/search?q=${encodeURIComponent(term)}&token=${FINNHUB_KEY}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.result || [])
        .filter(
          (item: any) =>
            item.type === "Common Stock" && !item.symbol.includes(".")
        )
        .slice(0, 15)
        .map((item: any) => ({
          symbol: item.symbol,
          name: item.description,
          exchange:
            item.displaySymbol?.split(":")?.[0] || item.primary_exchange || null,
          sector: null,
          inDb: false,
        }));
    } catch {
      return [];
    }
  };

  const batches = await Promise.all(queries.map(fetchOne));
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of batches.flat()) {
    if (!seen.has(r.symbol)) {
      seen.add(r.symbol);
      out.push(r);
    }
  }
  return out;
}

async function searchFMP(q: string): Promise<SearchResult[]> {
  const noSpace = q.replace(/\s+/g, "");
  const term = noSpace !== q ? noSpace : q;
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/search?query=${encodeURIComponent(term)}&limit=10&apikey=${FMP_KEY}`
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

function relevanceScore(
  r: SearchResult,
  upper: string,
  lower: string,
  upperNoSpace: string,
  lowerNoSpace: string
): number {
  const sym = r.symbol.toUpperCase();
  const name = (r.name || "").toLowerCase();
  const nameNoSpace = name.replace(/\s+/g, "");

  // Exact ticker match always wins.
  if (sym === upper || sym === upperNoSpace) return 0;
  if (sym.startsWith(upperNoSpace)) return 1;
  // Exact company-name match (with or without spaces).
  if (name === lower || nameNoSpace === lowerNoSpace) return 2;
  // Name begins with the query.
  if (name.startsWith(lower) || nameNoSpace.startsWith(lowerNoSpace)) return 3;
  // Name contains the query.
  if (name.includes(lower) || nameNoSpace.includes(lowerNoSpace)) return 4;
  if (sym.includes(upperNoSpace)) return 5;
  return 6;
}
