import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServiceClient();

    const [calls, signals, tickers, log] = await Promise.all([
      supabase.from("calls").select("id, ticker_id, call, conviction, is_active, created_at").order("created_at", { ascending: false }).limit(10),
      supabase.from("signals").select("id, ticker_id, source, title, created_at").order("created_at", { ascending: false }).limit(10),
      supabase.from("tickers").select("id, symbol").limit(20),
      supabase.from("ingestion_log").select("*").order("started_at", { ascending: false }).limit(5),
    ]);

    return NextResponse.json({
      calls: { data: calls.data, error: calls.error?.message },
      signals: { data: signals.data, error: signals.error?.message },
      tickers: { data: tickers.data, error: tickers.error?.message },
      log: { data: log.data, error: log.error?.message },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
