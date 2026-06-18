import { NextResponse } from "next/server";
import { getMarketNews } from "@/lib/ingestion/news";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServiceClient();

  const [newsResult, callsResult, tickerCountResult] = await Promise.all([
    getMarketNews(10),
    supabase
      .from("calls")
      .select("call, conviction")
      .eq("is_active", true),
    supabase
      .from("tickers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  const calls = callsResult.data || [];
  const stats = {
    totalTickers: tickerCountResult.count || 0,
    activeCalls: calls.length,
    buyCount: calls.filter((c: any) => c.call === "BUY").length,
    reduceCount: calls.filter((c: any) => c.call === "REDUCE").length,
    watchCount: calls.filter((c: any) => c.call === "WATCH").length,
    avgConviction: calls.length
      ? Math.round(calls.reduce((s: number, c: any) => s + c.conviction, 0) / calls.length)
      : 0,
  };

  return NextResponse.json({ news: newsResult, stats });
}
