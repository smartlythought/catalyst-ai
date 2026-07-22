import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Collapse duplicate history rows created by the old "save on view" behavior:
// viewing the (stale) picks on later days stamped an identical row under each
// date. We keep the FIRST day each distinct picks set appeared and delete the
// consecutive duplicates, so history reflects only real generations.
//
// Called server-side by /api/admin/run (owner-gated) with the CRON_SECRET.
function pickSignature(payload: any): string {
  if (!Array.isArray(payload)) return "empty";
  return payload
    .map((p) => `${p?.symbol}:${p?.action}:${p?.conviction}:${p?.entryPrice}`)
    .sort()
    .join("|");
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sb = createServiceClient();
    const { data: rows } = await sb
      .from("daily_ai_history")
      .select("id, snapshot_date, payload")
      .eq("kind", "picks")
      .order("snapshot_date", { ascending: true });

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0, kept: 0 });
    }

    // Walk oldest→newest; delete any row whose picks are identical to the last
    // KEPT row (a run of copies collapses to the first day it appeared).
    let prevSig: string | null = null;
    const toDelete: any[] = [];
    let kept = 0;
    for (const r of rows) {
      const sig = pickSignature(r.payload);
      if (sig === prevSig) {
        toDelete.push(r.id);
      } else {
        prevSig = sig;
        kept++;
      }
    }

    if (toDelete.length > 0) {
      await sb.from("daily_ai_history").delete().in("id", toDelete);
    }

    return NextResponse.json({ ok: true, deleted: toDelete.length, kept });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e).slice(0, 200) },
      { status: 500 }
    );
  }
}
