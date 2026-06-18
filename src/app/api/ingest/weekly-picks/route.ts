import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyPicks } from "@/lib/ai/gemini";
import { getActiveCalls, logIngestion } from "@/lib/supabase/queries";
import { createServiceClient } from "@/lib/supabase/server";
import { sendWeeklyDigest } from "@/lib/whatsapp";
import { MOCK_SIGNALS } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let activeCalls = (await getActiveCalls().catch(() => []))
    .filter((s) => s.call === "BUY")
    .map((s) => ({
      ticker: s.ticker,
      call: s.call,
      conviction: s.conviction,
      why: s.why,
      changePercent: s.changePercent,
    }));

  if (activeCalls.length === 0) {
    activeCalls = MOCK_SIGNALS.filter((s) => s.call === "BUY").map((s) => ({
      ticker: s.ticker,
      call: s.call,
      conviction: s.conviction,
      why: s.why,
      changePercent: s.changePercent,
    }));
  }

  try {
    const picks = await generateWeeklyPicks(activeCalls);

    const supabase = createServiceClient();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStr = weekStart.toISOString().split("T")[0];

    for (const [i, ticker] of picks.shortTerm.entries()) {
      const { data: t } = await supabase
        .from("tickers")
        .select("id")
        .eq("symbol", ticker)
        .single();

      if (t) {
        await supabase.from("weekly_picks").upsert(
          {
            week_start: weekStr,
            category: "short_term",
            rank: i + 1,
            ticker_id: t.id,
            rationale: picks.summary,
          },
          { onConflict: "week_start,category,rank" }
        );
      }
    }

    for (const [i, ticker] of picks.longTerm.entries()) {
      const { data: t } = await supabase
        .from("tickers")
        .select("id")
        .eq("symbol", ticker)
        .single();

      if (t) {
        await supabase.from("weekly_picks").upsert(
          {
            week_start: weekStr,
            category: "long_term",
            rank: i + 1,
            ticker_id: t.id,
            rationale: picks.summary,
          },
          { onConflict: "week_start,category,rank" }
        );
      }
    }

    const { data: subscribers } = await supabase
      .from("user_alerts")
      .select("user_id")
      .eq("whatsapp_enabled", true);

    if (subscribers?.length) {
      for (const sub of subscribers) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("whatsapp_number")
          .eq("id", sub.user_id)
          .single();

        if (profile?.whatsapp_number) {
          await sendWeeklyDigest(profile.whatsapp_number, picks);
        }
      }
    }

    await logIngestion("weekly_picks", "success", picks.shortTerm.length + picks.longTerm.length);

    return NextResponse.json({
      weekOf: weekStr,
      shortTerm: picks.shortTerm,
      longTerm: picks.longTerm,
      summary: picks.summary,
    });
  } catch (err) {
    await logIngestion(
      "weekly_picks",
      "error",
      0,
      err instanceof Error ? err.message : "Unknown"
    );
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to generate picks",
      },
      { status: 500 }
    );
  }
}
