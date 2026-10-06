// Short-term strategy "momentum-v2".
//
// Why: the Track Record showed the AI's own short-term picks beat SPY only 38%
// of the time at 20 trading days (29% when it claimed 85+ conviction). A
// 2-year backtest (curated universe, weekly, Jun-2024 → Sep-2026, 20-day hold,
// entry at next open) found 12-1 month momentum leaders were the most robust
// simple rule: ranks #1-15 beat SPY ~56% of the time (above 50% in 5 of 6
// half-years), ranks #16-25 ~51%.
//
// So: code picks the candidates (momentum leaders), the AI only screens them
// for news / earnings / valuation red flags and explains them, and conviction
// is the BACKTESTED hit rate for that rank — not a number the AI makes up.
// Stops/targets come from each stock's normal daily range (ATR).
import { yahooDailyBars, type DailyBar } from "@/lib/ingestion/yahoo";

export const STRATEGY_V2 = "momentum-v2";
export const MOMENTUM_CANDIDATES = 20;
export const MAX_V2_PICKS = 8;

// Backtested share of picks that beat SPY over 20 trading days, by rank.
// Re-check against the Track Record once ~30 live v2 calls have matured.
const CALIBRATION: { maxRank: number; hitRate: number }[] = [
  { maxRank: 15, hitRate: 56 },
  { maxRank: 25, hitRate: 51 },
];

export function calibratedConviction(rank: number): number {
  return (CALIBRATION.find((c) => rank <= c.maxRank) ?? CALIBRATION[CALIBRATION.length - 1]).hitRate;
}

// Backtest geometry: stop 2× ATR, target 3× ATR → ~47-51% hit the target first,
// average trade +2.1-2.6% (wins are 1.5× the size of losses).
export const STOP_ATR = 2;
export const TARGET_ATR = 3;

export function atrLevels(entry: number, atr: number): { stop: number; target: number } {
  return {
    stop: +(entry - STOP_ATR * atr).toFixed(2),
    target: +(entry + TARGET_ATR * atr).toFixed(2),
  };
}

export interface MomentumFeatures {
  close: number;
  atr: number; // 14-day average true range, $
  atrPct: number;
  mom12_1: number; // return from ~12 months ago to ~1 month ago
  mom1m: number; // last ~month
  above50: boolean;
  above200: boolean;
}

function todayET(): string {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${et.getFullYear()}-${pad(et.getMonth() + 1)}-${pad(et.getDate())}`;
}

/** Features from COMPLETED daily bars only (today's live bar is dropped). */
export function computeFeatures(bars: DailyBar[]): MomentumFeatures | null {
  const today = todayET();
  const b = bars.length && bars[bars.length - 1].date === today ? bars.slice(0, -1) : bars;
  if (b.length < 253) return null;
  const k = b.length - 1;
  const c = b[k].close;
  let tr = 0;
  for (let j = k - 13; j <= k; j++) {
    tr += Math.max(b[j].high - b[j].low, Math.abs(b[j].high - b[j - 1].close), Math.abs(b[j].low - b[j - 1].close));
  }
  const atr = tr / 14;
  const avg = (n: number) => b.slice(-n).reduce((s, x) => s + x.close, 0) / n;
  return {
    close: c,
    atr,
    atrPct: atr / c,
    mom12_1: b[k - 21].close / b[k - 252].close - 1,
    mom1m: c / b[k - 21].close - 1,
    above50: c > avg(50),
    above200: c > avg(200),
  };
}

// Daily bars barely change intraday for a 12-month signal — cache per day.
const cache = new Map<string, { day: string; f: MomentumFeatures | null }>();

export async function momentumFeatures(symbols: string[]): Promise<Map<string, MomentumFeatures>> {
  const day = todayET();
  const out = new Map<string, MomentumFeatures>();
  const from = new Date(Date.now() - 400 * 86400000);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, symbols.length) }, async () => {
      while (next < symbols.length) {
        const s = symbols[next++];
        const hit = cache.get(s);
        let f: MomentumFeatures | null;
        if (hit && hit.day === day) f = hit.f;
        else {
          f = computeFeatures(await yahooDailyBars(s, from));
          cache.set(s, { day, f });
        }
        if (f) out.set(s, f);
      }
    })
  );
  return out;
}
