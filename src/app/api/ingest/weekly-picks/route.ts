import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyPicks } from "@/lib/ai/gemini";
import { MOCK_SIGNALS } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO: Replace with Supabase query for active calls
  const activeCalls = MOCK_SIGNALS.filter((s) => s.call === "BUY").map((s) => ({
    ticker: s.ticker,
    call: s.call,
    conviction: s.conviction,
    why: s.why,
    changePercent: s.changePercent,
  }));

  try {
    const picks = await generateWeeklyPicks(activeCalls);

    // TODO: Store in Supabase weekly_picks table
    // const supabase = createServiceClient();
    // const weekStart = getThisSunday();
    // for (const [i, ticker] of picks.shortTerm.entries()) {
    //   await supabase.from('weekly_picks').upsert({ week_start: weekStart, category: 'short_term', rank: i+1, ... });
    // }

    return NextResponse.json({
      weekOf: new Date().toISOString().split("T")[0],
      shortTerm: picks.shortTerm,
      longTerm: picks.longTerm,
      summary: picks.summary,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate picks" },
      { status: 500 }
    );
  }
}
