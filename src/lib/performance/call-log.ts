// Append-only call log — every AI call is recorded once, permanently, so the
// app can measure its real hit rate. Fail-soft: logging never breaks picks.
import { createServiceClient } from "@/lib/supabase/server";

export interface LoggablePick {
  symbol: string;
  action: string;
  timeframe: string;
  conviction: number;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  currentPrice?: number;
  signals?: string[];
  strategy?: string;
}

// The strategy that produced a call is stored as a "strategy:<name>" entry in
// the logged signals array (no schema change needed). Calls without one predate
// strategy tagging and are the original AI-only logic.
export const DEFAULT_STRATEGY = "ai-v1";
const STRATEGY_PREFIX = "strategy:";

export function strategyFromSignals(signals: unknown): string {
  if (Array.isArray(signals)) {
    const tag = signals.find((s) => typeof s === "string" && s.startsWith(STRATEGY_PREFIX));
    if (tag) return (tag as string).slice(STRATEGY_PREFIX.length);
  }
  return DEFAULT_STRATEGY;
}

/** Stable identity of a picks set — used to collapse duplicate snapshots. */
export function pickSignature(payload: unknown): string {
  if (!Array.isArray(payload)) return "empty";
  return payload
    .map((p: any) => `${p?.symbol}:${p?.action}:${p?.conviction}:${p?.entryPrice}`)
    .sort()
    .join("|");
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function callRows(
  picks: LoggablePick[],
  generatedAt: string,
  source: "live" | "backfill"
) {
  // Normalize so the same run always gets the same run_id regardless of how the
  // timestamp was formatted (JS "...Z" vs Postgres "...+00:00").
  const runId = new Date(generatedAt).toISOString();
  return picks
    .filter(
      (p) =>
        typeof p?.symbol === "string" &&
        (p.action === "BUY" || p.action === "SELL") &&
        (p.timeframe === "short-term" || p.timeframe === "long-term") &&
        typeof p.conviction === "number"
    )
    .map((p) => ({
      run_id: runId,
      generated_at: runId,
      symbol: p.symbol.toUpperCase(),
      timeframe: p.timeframe,
      action: p.action,
      conviction: Math.round(p.conviction),
      ref_price: num(p.currentPrice),
      entry_price: num(p.entryPrice),
      target_price: num(p.targetPrice),
      stop_price: num(p.stopLoss),
      signals:
        source === "live"
          ? [...(Array.isArray(p.signals) ? p.signals : []), `${STRATEGY_PREFIX}${p.strategy || DEFAULT_STRATEGY}`]
          : Array.isArray(p.signals) && p.signals.length
            ? p.signals
            : null,
      source,
    }));
}

/**
 * Insert rows, ignoring any already logged (same run/symbol/timeframe).
 * Returns rows submitted (duplicates are silently skipped by the DB).
 * With `strict`, a DB error throws instead of being logged and skipped.
 */
export async function insertCallRows(
  rows: ReturnType<typeof callRows>,
  strict = false
): Promise<number> {
  if (!rows.length) return 0;
  const sb = createServiceClient();
  let submitted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb
      .from("call_log")
      .upsert(chunk, { onConflict: "run_id,symbol,timeframe", ignoreDuplicates: true });
    if (error) {
      if (strict) throw new Error(`call_log: ${error.message}`);
      console.log("[call-log] insert failed:", error.message);
      continue;
    }
    submitted += chunk.length;
  }
  return submitted;
}

/** Log a fresh generation's picks. Never throws. */
export async function logCalls(picks: LoggablePick[], generatedAt: string): Promise<number> {
  try {
    return await insertCallRows(callRows(picks, generatedAt, "live"));
  } catch (e) {
    console.log("[call-log] skipped:", e);
    return 0;
  }
}
