import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getBatchQuotes } from "@/lib/ingestion/market-data";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: items } = await svc
    .from("watchlist")
    .select("ticker_id, added_at, tickers!inner(symbol, company_name, exchange, sector)")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  if (!items?.length) return NextResponse.json({ watchlist: [] });

  const tickers = items.map((i: any) => i.tickers.symbol);
  const quotes = await getBatchQuotes(tickers);

  const watchlist = items.map((i: any) => {
    const q = quotes.get(i.tickers.symbol);
    return {
      symbol: i.tickers.symbol,
      name: i.tickers.company_name,
      exchange: i.tickers.exchange,
      sector: i.tickers.sector,
      price: q?.price ?? 0,
      change: q?.change ?? 0,
      changePercent: q?.changePercent ?? 0,
      addedAt: i.added_at,
    };
  });

  return NextResponse.json({ watchlist });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { symbol } = await request.json();
  if (!symbol) return NextResponse.json({ error: "Symbol required" }, { status: 400 });

  const input = symbol.trim();
  const svc = createServiceClient();

  // 1. Try exact symbol match
  let { data: ticker } = await svc
    .from("tickers")
    .select("id")
    .eq("symbol", input.toUpperCase())
    .single();

  // 2. If no match, try company name search in the database
  if (!ticker) {
    const { data: nameMatch } = await svc
      .from("tickers")
      .select("id")
      .ilike("company_name", `%${input}%`)
      .limit(1)
      .single();
    if (nameMatch) ticker = nameMatch;
  }

  // 3. If still no match, try Finnhub search API to resolve
  if (!ticker) {
    const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
    let finnhubResult: { symbol: string; description: string; type: string; exchange: string } | null = null;

    if (FINNHUB_KEY) {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/search?q=${encodeURIComponent(input)}&token=${FINNHUB_KEY}`
        );
        if (res.ok) {
          const json = await res.json();
          const results = json.result ?? [];
          // Prefer "Common Stock" results to avoid ETFs/funds/etc
          finnhubResult =
            results.find((r: any) => r.type === "Common Stock") ?? results[0] ?? null;
        }
      } catch {
        // Finnhub call failed — continue to fallback
      }
    }

    if (finnhubResult) {
      // Check if the resolved symbol already exists in the database
      const { data: resolvedTicker } = await svc
        .from("tickers")
        .select("id")
        .eq("symbol", finnhubResult.symbol.toUpperCase())
        .single();

      if (resolvedTicker) {
        ticker = resolvedTicker;
      } else {
        // 4. Insert a new ticker using Finnhub data (good name & exchange)
        const { data: inserted } = await svc
          .from("tickers")
          .insert({
            symbol: finnhubResult.symbol.toUpperCase(),
            company_name: finnhubResult.description || finnhubResult.symbol.toUpperCase(),
            exchange: finnhubResult.exchange || "UNKNOWN",
          })
          .select("id")
          .single();
        ticker = inserted;
      }
    }
  }

  // 5. If ALL resolution strategies failed, do NOT create a junk entry
  if (!ticker) {
    return NextResponse.json(
      { error: `Could not resolve "${input}" to a known ticker or company` },
      { status: 404 }
    );
  }

  await svc.from("watchlist").upsert(
    { user_id: user.id, ticker_id: ticker.id },
    { onConflict: "user_id,ticker_id" }
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { symbol } = await request.json();
  if (!symbol) return NextResponse.json({ error: "Symbol required" }, { status: 400 });

  const svc = createServiceClient();

  const { data: ticker } = await svc
    .from("tickers")
    .select("id")
    .eq("symbol", symbol.toUpperCase())
    .single();

  if (ticker) {
    await svc
      .from("watchlist")
      .delete()
      .eq("user_id", user.id)
      .eq("ticker_id", ticker.id);
  }

  return NextResponse.json({ ok: true });
}
