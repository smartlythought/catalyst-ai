import { NextRequest, NextResponse } from "next/server";
import { MOCK_SIGNALS } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const ticker = searchParams.get("ticker");
  const callType = searchParams.get("call");

  let signals = MOCK_SIGNALS;

  if (ticker) {
    signals = signals.filter(
      (s) => s.ticker.toLowerCase() === ticker.toLowerCase()
    );
  }

  if (callType) {
    signals = signals.filter(
      (s) => s.call.toLowerCase() === callType.toLowerCase()
    );
  }

  // TODO: Replace with Supabase query when DB is connected
  // const supabase = await createClient();
  // const { data, error } = await supabase
  //   .from('calls')
  //   .select(`
  //     *,
  //     tickers (*),
  //     signals (*)
  //   `)
  //   .eq('is_active', true)
  //   .order('created_at', { ascending: false });

  return NextResponse.json({
    signals,
    meta: {
      total: signals.length,
      buyCount: signals.filter((s) => s.call === "BUY").length,
      reduceCount: signals.filter((s) => s.call === "REDUCE").length,
      watchCount: signals.filter((s) => s.call === "WATCH").length,
    },
  });
}
