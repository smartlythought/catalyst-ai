import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBatchQuotes } from "@/lib/ingestion/market-data";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: holdings } = await supabase
    .from("portfolio")
    .select("*, tickers!inner(symbol, company_name)")
    .eq("user_id", user.id);

  if (!holdings?.length) {
    return NextResponse.json({ holdings: [], totalValue: 0, totalPnl: 0 });
  }

  const symbols = holdings.map((h: any) => h.tickers.symbol);
  const quotes = await getBatchQuotes(symbols).catch(() => new Map());

  const result = holdings.map((h: any) => {
    const q = quotes.get(h.tickers.symbol);
    const currentPrice = q?.price || 0;
    const totalValue = h.shares * currentPrice;
    const totalCost = h.shares * h.avg_cost;
    const pnl = totalValue - totalCost;
    const pnlPercent = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

    return {
      ticker: h.tickers.symbol,
      company: h.tickers.company_name,
      shares: h.shares,
      avgCost: h.avg_cost,
      currentPrice,
      change: q?.change || 0,
      changePercent: q?.changePercent || 0,
      totalValue,
      pnl,
      pnlPercent,
    };
  });

  const totalValue = result.reduce((s: number, h: any) => s + h.totalValue, 0);
  const totalPnl = result.reduce((s: number, h: any) => s + h.pnl, 0);

  return NextResponse.json({ holdings: result, totalValue, totalPnl });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol, shares, avgCost } = await request.json();
  if (!symbol || !shares || !avgCost) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { data: ticker } = await supabase
    .from("tickers")
    .select("id")
    .eq("symbol", symbol.toUpperCase())
    .single();

  if (!ticker) {
    return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
  }

  const { error } = await supabase.from("portfolio").upsert(
    {
      user_id: user.id,
      ticker_id: ticker.id,
      shares,
      avg_cost: avgCost,
    },
    { onConflict: "user_id,ticker_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "saved" });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  const { data: ticker } = await supabase
    .from("tickers")
    .select("id")
    .eq("symbol", symbol.toUpperCase())
    .single();

  if (!ticker) {
    return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
  }

  await supabase
    .from("portfolio")
    .delete()
    .eq("user_id", user.id)
    .eq("ticker_id", ticker.id);

  return NextResponse.json({ status: "deleted" });
}
