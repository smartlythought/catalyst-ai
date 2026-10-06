// Track-record math. Pure functions with no server imports, so the Track
// Record page can re-aggregate client-side when filters change.

export const HORIZONS = [5, 20, 60, 120] as const;
export type Horizon = (typeof HORIZONS)[number];

// Below this many matured calls a horizon's stats are mostly noise.
export const MIN_RELIABLE_N = 30;

export interface HorizonResult {
  excessSpy: number | null; // direction-adjusted return minus SPY over the window
  excessSector: number | null; // direction-adjusted return minus sector ETF
  baselineExcess: number | null; // same window, random-basket average (direction-adjusted)
  baselineHit: number | null; // share of the basket that beat SPY (direction-adjusted)
}

export type CallOutcome = "target" | "stop" | "expired" | "open" | "n/a";

export interface EvaluatedCall {
  id: number;
  runId: string;
  generatedAt: string;
  source: "live" | "backfill";
  symbol: string;
  timeframe: "short-term" | "long-term";
  action: "BUY" | "SELL";
  conviction: number;
  sector: string;
  status: "pending" | "active" | "no-data";
  entryDate: string | null;
  entryPx: number | null;
  targetPx: number | null;
  stopPx: number | null;
  horizons: Record<string, HorizonResult>; // keyed by horizon ("5", "20", ...)
  outcome: CallOutcome;
  liveExcess: number | null; // mark-to-market excess vs SPY since entry
  tradingDaysHeld: number;
}

export interface HorizonSummary {
  horizon: Horizon;
  n: number;
  hitRate: number | null;
  meanExcessSpy: number | null;
  meanExcessSector: number | null;
  tStat: number | null; // naive: overlapping windows overstate it
  ic: number | null; // Spearman rank corr: conviction vs excess return
  baselineMean: number | null;
  baselineHitRate: number | null;
  edge: number | null; // meanExcessSpy - baselineMean
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1; // average rank for ties
    for (let k = i; k <= j; k++) r[order[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(a: number[], b: number[]): number | null {
  if (a.length < 5 || a.length !== b.length) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = mean(ra)!;
  const mb = mean(rb)!;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

export function summarize(calls: EvaluatedCall[], horizon: Horizon): HorizonSummary {
  const key = String(horizon);
  const matured = calls.filter((c) => c.horizons[key]?.excessSpy != null);
  const ex = matured.map((c) => c.horizons[key].excessSpy as number);
  const sec = matured
    .map((c) => c.horizons[key].excessSector)
    .filter((v): v is number => v != null);
  const base = matured
    .map((c) => c.horizons[key].baselineExcess)
    .filter((v): v is number => v != null);
  const baseHit = matured
    .map((c) => c.horizons[key].baselineHit)
    .filter((v): v is number => v != null);

  const n = ex.length;
  const m = mean(ex);
  let tStat: number | null = null;
  if (n >= 3 && m != null) {
    const sd = Math.sqrt(ex.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
    tStat = sd > 0 ? m / (sd / Math.sqrt(n)) : null;
  }
  const baselineMean = mean(base);
  return {
    horizon,
    n,
    hitRate: n ? ex.filter((v) => v > 0).length / n : null,
    meanExcessSpy: m,
    meanExcessSector: mean(sec),
    tStat,
    ic: spearman(
      matured.map((c) => c.conviction),
      ex
    ),
    baselineMean,
    baselineHitRate: mean(baseHit),
    edge: m != null && baselineMean != null ? m - baselineMean : null,
  };
}

export function outcomeCounts(calls: EvaluatedCall[]): Record<CallOutcome, number> {
  const out: Record<CallOutcome, number> = { target: 0, stop: 0, expired: 0, open: 0, "n/a": 0 };
  for (const c of calls) out[c.outcome]++;
  return out;
}
