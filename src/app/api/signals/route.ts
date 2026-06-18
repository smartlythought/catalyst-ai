import { NextRequest, NextResponse } from "next/server";
import { getActiveCalls } from "@/lib/supabase/queries";
import { getBatchQuotes } from "@/lib/ingestion/market-data";
import { MOCK_SIGNALS } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const ticker = searchParams.get("ticker");
  const callType = searchParams.get("call");

  let signals = await getActiveCalls();

  if (signals.length > 0) {
    const tickers = [...new Set(signals.map((s) => s.ticker))];
    const quotes = await getBatchQuotes(tickers);

    for (const s of signals) {
      const q = quotes.get(s.ticker);
      if (q) {
        s.price = q.price;
        s.change = q.change;
        s.changePercent = q.changePercent;
      }
    }
  } else {
    signals = MOCK_SIGNALS;
  }

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
