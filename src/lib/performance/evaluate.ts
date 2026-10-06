// Scores every logged call against real market data.
//
// Protocol (fixed so results can't be cherry-picked):
//   - Entry = the first market OPEN after the call was made (a pre-market call
//     enters that day's open; anything later enters the next session's open).
//   - Horizon h = hold h trading days; exit at that day's CLOSE.
//   - Excess = direction-adjusted return minus SPY (and minus the stock's sector
//     ETF) over the identical window. SELL calls profit when the stock lags.
//   - Baseline = the same windows applied to a fixed basket from our own
//     universe, so we can tell skill from "the market went up".
import { createServiceClient } from "@/lib/supabase/server";
import { yahooDailyBars, yahooSector, type DailyBar } from "@/lib/ingestion/yahoo";
import { CURATED_UNIVERSE } from "@/lib/ingestion/universe";
import { HORIZONS, type EvaluatedCall, type HorizonResult } from "./metrics";

const SECTOR_ETF: Record<string, string> = {
  Technology: "XLK",
  "Financial Services": "XLF",
  Healthcare: "XLV",
  "Consumer Cyclical": "XLY",
  "Consumer Defensive": "XLP",
  Energy: "XLE",
  Industrials: "XLI",
  "Basic Materials": "XLB",
  Utilities: "XLU",
  "Real Estate": "XLRE",
  "Communication Services": "XLC",
};

// Fixed, transparent baseline: every Nth name of the curated universe.
const BASELINE_SIZE = 25;
const BASELINE: string[] = (() => {
  const step = Math.max(1, Math.floor(CURATED_UNIVERSE.length / BASELINE_SIZE));
  const out: string[] = [];
  for (let i = 0; i < CURATED_UNIVERSE.length && out.length < BASELINE_SIZE; i += step) {
    out.push(CURATED_UNIVERSE[i]);
  }
  return out;
})();

const MARKET_OPEN_MIN = 9 * 60 + 30;
// If the first available bar is this many calendar days after the call, the
// symbol had a data gap (halt, delisting, feed hole) — don't pretend it entered.
const MAX_ENTRY_GAP_DAYS = 5;
const CLOSE_SETTLED_MIN = 16 * 60 + 15;

interface Series {
  bars: DailyBar[];
  idx: Map<string, number>; // date -> bar index
  completedLen: number; // bars with a final close (excludes today's live bar)
}

function etParts(at: Date): { date: string; minutes: number } {
  const et = new Date(at.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${et.getFullYear()}-${pad(et.getMonth() + 1)}-${pad(et.getDate())}`,
    minutes: et.getHours() * 60 + et.getMinutes(),
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

function toSeries(bars: DailyBar[], today: { date: string; minutes: number }): Series {
  const idx = new Map<string, number>();
  bars.forEach((b, i) => idx.set(b.date, i));
  const last = bars[bars.length - 1];
  const lastIsLive = !!last && last.date === today.date && today.minutes < CLOSE_SETTLED_MIN;
  return { bars, idx, completedLen: lastIsLive ? bars.length - 1 : bars.length };
}

/** open(entryDate) → close(exitDate) return for a series, or null if a date is missing. */
function windowRet(s: Series | undefined, entryDate: string, exitDate: string): number | null {
  if (!s) return null;
  const a = s.idx.get(entryDate);
  const b = s.idx.get(exitDate);
  if (a == null || b == null || !s.bars[a].open) return null;
  return s.bars[b].close / s.bars[a].open - 1;
}

interface CallRow {
  id: number;
  run_id: string;
  generated_at: string;
  symbol: string;
  timeframe: "short-term" | "long-term";
  action: "BUY" | "SELL";
  conviction: number;
  target_price: number | string | null;
  stop_price: number | string | null;
  source: string;
}

export interface EvaluationResult {
  calls: EvaluatedCall[];
  baseline: string[];
  computedAt: string;
}

export async function evaluateCalls(): Promise<EvaluationResult> {
  const computedAt = new Date().toISOString();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("call_log")
    .select("id, run_id, generated_at, symbol, timeframe, action, conviction, target_price, stop_price, source")
    .order("generated_at", { ascending: false })
    .limit(1500);
  if (error) throw new Error(`call_log: ${error.message}`);
  const rows = (data || []) as CallRow[];
  if (!rows.length) return { calls: [], baseline: BASELINE, computedAt };

  const earliest = rows.reduce(
    (min, r) => Math.min(min, new Date(r.generated_at).getTime()),
    Date.now()
  );
  const from = new Date(earliest - 7 * 86400000);
  const today = etParts(new Date());

  const callSymbols = Array.from(new Set(rows.map((r) => String(r.symbol))));
  const sectors = new Map<string, string>();
  await mapLimit(callSymbols, 6, async (s) => sectors.set(s, await yahooSector(s)));

  const etfs = Array.from(new Set(Array.from(sectors.values()).map((s) => SECTOR_ETF[s]).filter(Boolean)));
  const allSymbols = Array.from(new Set(["SPY", ...callSymbols, ...etfs, ...BASELINE]));
  const series = new Map<string, Series>();
  await mapLimit(allSymbols, 6, async (s) => {
    const bars = await yahooDailyBars(s, from);
    if (bars.length) series.set(s, toSeries(bars, today));
  });

  const spy = series.get("SPY");
  const calls: EvaluatedCall[] = rows.map((r) => {
    const symbol = String(r.symbol);
    const sector = sectors.get(symbol) || "";
    const dir = r.action === "SELL" ? -1 : 1;
    const base: EvaluatedCall = {
      id: r.id,
      runId: r.run_id,
      generatedAt: r.generated_at,
      source: r.source === "backfill" ? "backfill" : "live",
      symbol,
      timeframe: r.timeframe,
      action: r.action,
      conviction: r.conviction,
      sector,
      status: "no-data",
      entryDate: null,
      entryPx: null,
      targetPx: r.target_price != null ? Number(r.target_price) : null,
      stopPx: r.stop_price != null ? Number(r.stop_price) : null,
      horizons: {},
      outcome: "n/a",
      liveExcess: null,
      tradingDaysHeld: 0,
    };

    const s = series.get(symbol);
    if (!s || !spy) return base;

    const gen = etParts(new Date(r.generated_at));
    const e = s.bars.findIndex(
      (b) => b.date > gen.date || (b.date === gen.date && gen.minutes < MARKET_OPEN_MIN)
    );
    if (e < 0) return { ...base, status: "pending" };

    const entryDate = s.bars[e].date;
    const gapDays =
      (new Date(entryDate + "T00:00:00Z").getTime() - new Date(gen.date + "T00:00:00Z").getTime()) /
      86400000;
    if (gapDays > MAX_ENTRY_GAP_DAYS) return base; // status stays "no-data"

    const entryPx = s.bars[e].open;
    const etf = series.get(SECTOR_ETF[sector]);

    for (const h of HORIZONS) {
      const x = e + h - 1;
      const result: HorizonResult = {
        excessSpy: null,
        excessSector: null,
        baselineExcess: null,
        baselineHit: null,
      };
      if (x < s.completedLen) {
        const exitDate = s.bars[x].date;
        const ret = s.bars[x].close / entryPx - 1;
        const spyRet = windowRet(spy, entryDate, exitDate);
        const etfRet = windowRet(etf, entryDate, exitDate);
        if (spyRet != null) {
          result.excessSpy = dir * (ret - spyRet);
          const basket = BASELINE.map((b) => windowRet(series.get(b), entryDate, exitDate))
            .filter((v): v is number => v != null)
            .map((v) => dir * (v - spyRet));
          if (basket.length) {
            result.baselineExcess = basket.reduce((a, b) => a + b, 0) / basket.length;
            result.baselineHit = basket.filter((v) => v > 0).length / basket.length;
          }
        }
        if (etfRet != null) result.excessSector = dir * (ret - etfRet);
      }
      base.horizons[String(h)] = result;
    }

    // Mark-to-market since entry (includes today's live bar).
    const last = s.bars[s.bars.length - 1];
    const spyLast = spy.bars[spy.bars.length - 1];
    const spyEntry = spy.idx.get(entryDate);
    if (spyEntry != null && spy.bars[spyEntry].open) {
      const spyLive = spyLast.close / spy.bars[spyEntry].open - 1;
      base.liveExcess = dir * (last.close / entryPx - 1 - spyLive);
    }

    // Trade outcome: which level was hit first within the call's horizon.
    const H = r.timeframe === "short-term" ? 20 : 120;
    let outcome: EvaluatedCall["outcome"] = "n/a";
    if (base.targetPx != null && base.stopPx != null) {
      outcome = "open";
      const end = Math.min(e + H - 1, s.bars.length - 1);
      for (let i = e; i <= end; i++) {
        const b = s.bars[i];
        // Check the stop first on a day both are touched (conservative).
        const stopHit = dir === 1 ? b.low <= base.stopPx : b.high >= base.stopPx;
        const targetHit = dir === 1 ? b.high >= base.targetPx : b.low <= base.targetPx;
        if (stopHit) { outcome = "stop"; break; }
        if (targetHit) { outcome = "target"; break; }
      }
      if (outcome === "open" && e + H - 1 < s.completedLen) outcome = "expired";
    }

    return {
      ...base,
      status: "active",
      entryDate,
      entryPx,
      outcome,
      tradingDaysHeld: Math.max(0, s.completedLen - e),
    };
  });

  return { calls, baseline: BASELINE, computedAt };
}
