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

  const svc = createServiceClient();

  let { data: ticker } = await svc
    .from("tickers")
    .select("id")
    .eq("symbol", symbol.toUpperCase())
    .single();

  if (!ticker) {
    const { data: inserted } = await svc
      .from("tickers")
      .insert({
        symbol: symbol.toUpperCase(),
        company_name: symbol.toUpperCase(),
        exchange: "UNKNOWN",
      })
      .select("id")
      .single();
    ticker = inserted;
  }

  if (!ticker) return NextResponse.json({ error: "Failed to resolve ticker" }, { status: 500 });

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
