import { NextResponse } from "next/server";
import { evaluateCalls, type EvaluationResult } from "@/lib/performance/evaluate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Scoring pulls daily bars for every called symbol + benchmarks (free Yahoo
// data, no AI). Cache for 30 minutes; ?refresh=1 forces a recompute.
let cache: { at: number; data: EvaluationResult } | null = null;
const TTL_MS = 30 * 60 * 1000;

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.data);
  }
  try {
    const data = await evaluateCalls();
    cache = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (e) {
    const msg = String(e).slice(0, 200);
    // Most likely cause on first deploy: the call_log migration hasn't run.
    const setupNeeded = /call_log|relation|does not exist|schema cache/i.test(msg);
    return NextResponse.json(
      { error: msg, setupNeeded, calls: [], baseline: [], computedAt: new Date().toISOString() },
      { status: setupNeeded ? 200 : 502 }
    );
  }
}
