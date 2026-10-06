import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { callRows, insertCallRows, pickSignature } from "@/lib/performance/call-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One-time import of picks generated before the call log existed, from
// daily_picks (precise generation time) and daily_ai_history (older days).
// Duplicate snapshots — the same picks copied forward by the old save-on-view
// bug — collapse to the first time they appeared. Idempotent: re-running
// inserts nothing new. Rows are tagged source='backfill'.
//
// Called server-side by /api/admin/run (owner-gated) with the CRON_SECRET.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sb = createServiceClient();
    const [{ data: daily }, { data: hist }] = await Promise.all([
      sb.from("daily_picks").select("generated_date, picks, generated_at"),
      sb.from("daily_ai_history").select("snapshot_date, payload, created_at").eq("kind", "picks"),
    ]);

    // Index exact generation times by date + picks signature.
    const exact = new Map<string, string>();
    for (const d of daily || []) {
      if (Array.isArray(d.picks) && d.generated_at) {
        exact.set(`${d.generated_date}|${pickSignature(d.picks)}`, d.generated_at);
      }
    }

    const runs: { at: string; picks: any[] }[] = [];
    for (const d of daily || []) {
      if (Array.isArray(d.picks) && d.picks.length && d.generated_at) {
        runs.push({ at: d.generated_at, picks: d.picks });
      }
    }
    for (const h of hist || []) {
      if (!Array.isArray(h.payload) || !h.payload.length) continue;
      const key = `${h.snapshot_date}|${pickSignature(h.payload)}`;
      runs.push({ at: exact.get(key) || h.created_at, picks: h.payload });
    }

    runs.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const kept: typeof runs = [];
    let prevSig: string | null = null;
    for (const r of runs) {
      const sig = pickSignature(r.picks);
      if (sig === prevSig) continue; // copy of the previous run, not a new call
      prevSig = sig;
      kept.push(r);
    }

    const rows = kept.flatMap((r) => callRows(r.picks, r.at, "backfill"));
    await insertCallRows(rows, true);
    return NextResponse.json({ ok: true, runs: kept.length, calls: rows.length });
  } catch (e) {
    const msg = String(e).slice(0, 200);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
