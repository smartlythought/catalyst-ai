import { NextResponse } from "next/server";
import { getAISnapshots } from "@/lib/ai/history";

export const dynamic = "force-dynamic";

/** Returns recent daily AI snapshots (picks/penny/ipo), grouped by date. */
export async function GET() {
  const rows = await getAISnapshots(45);

  const byDate: Record<string, Record<string, unknown>> = {};
  for (const r of rows) {
    byDate[r.snapshot_date] ||= {};
    byDate[r.snapshot_date][r.kind] = r.payload;
    byDate[r.snapshot_date].createdAt = r.created_at;
  }

  const days = Object.keys(byDate)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((date) => ({ date, ...byDate[date] }));

  return NextResponse.json({ days });
}
