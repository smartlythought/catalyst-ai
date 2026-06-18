import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("price_alerts")
    .select("*, tickers!inner(symbol, company_name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const alerts = (data || []).map((a: any) => ({
    id: a.id,
    ticker: a.tickers.symbol,
    company: a.tickers.company_name,
    condition: a.condition,
    targetPrice: a.target_price,
    isActive: a.is_active,
    triggered: a.triggered_at !== null,
    triggeredAt: a.triggered_at,
    createdAt: a.created_at,
  }));

  return NextResponse.json({ alerts });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { symbol, condition, targetPrice } = body;

  if (!symbol || !condition || !targetPrice) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!["above", "below"].includes(condition)) {
    return NextResponse.json({ error: "Invalid condition" }, { status: 400 });
  }

  const { data: ticker } = await supabase
    .from("tickers")
    .select("id")
    .eq("symbol", symbol.toUpperCase())
    .single();

  if (!ticker) {
    return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
  }

  const { data: alert, error } = await supabase
    .from("price_alerts")
    .insert({
      user_id: user.id,
      ticker_id: ticker.id,
      condition,
      target_price: targetPrice,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: alert.id, status: "created" });
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
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await supabase
    .from("price_alerts")
    .delete()
    .eq("id", parseInt(id))
    .eq("user_id", user.id);

  return NextResponse.json({ status: "deleted" });
}
