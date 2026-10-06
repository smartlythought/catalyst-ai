"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TabBar } from "@/components/tab-bar";
import {
  HORIZONS,
  MIN_RELIABLE_N,
  outcomeCounts,
  summarize,
  type EvaluatedCall,
  type Horizon,
} from "@/lib/performance/metrics";

type Scope = "short-term" | "long-term" | "all";

interface PerfResponse {
  calls: EvaluatedCall[];
  baseline: string[];
  computedAt: string;
  error?: string;
  setupNeeded?: boolean;
}

// The horizons each call type is actually judged on.
const PRIMARY: Record<Scope, Horizon[]> = {
  "short-term": [5, 20],
  "long-term": [60, 120],
  all: [20, 60],
};

const STRATEGY_LABEL: Record<string, string> = {
  all: "All strategies",
  "ai-v1": "Original AI picks",
  "momentum-v2": "Momentum v2",
};

const pct = (v: number | null, digits = 1) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
const rate = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const tone = (v: number | null) =>
  v == null ? "text-text-faint" : v > 0 ? "text-pos-green" : v < 0 ? "text-neg-red" : "text-text-muted";

const OUTCOME_STYLE: Record<EvaluatedCall["outcome"], { label: string; cls: string }> = {
  target: { label: "Target", cls: "text-pos-green border-pos-green/30 bg-pos-green/10" },
  stop: { label: "Stopped", cls: "text-neg-red border-neg-red/30 bg-neg-red/10" },
  expired: { label: "Expired", cls: "text-text-muted border-chip-border bg-chip-bg" },
  open: { label: "Open", cls: "text-accent-brand border-accent-brand/30 bg-accent-brand/10" },
  "n/a": { label: "—", cls: "text-text-faint border-chip-border bg-chip-bg" },
};

export default function PerformancePage() {
  const [data, setData] = useState<PerfResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scope, setScope] = useState<Scope>("short-term");
  const [includeImported, setIncludeImported] = useState(true);
  const [strategy, setStrategy] = useState<string>("all");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const r = await fetch(`/api/performance${refresh ? "?refresh=1" : ""}`);
      setData(await r.json());
    } catch (e) {
      setData({ calls: [], baseline: [], computedAt: "", error: String(e) });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const calls = useMemo(
    () =>
      (data?.calls || []).filter(
        (c) =>
          (scope === "all" || c.timeframe === scope) &&
          (includeImported || c.source === "live") &&
          (strategy === "all" || c.strategy === strategy)
      ),
    [data, scope, includeImported, strategy]
  );
  const strategies = useMemo(
    () => Array.from(new Set((data?.calls || []).map((c) => c.strategy))).sort(),
    [data]
  );
  const summaries = useMemo(() => HORIZONS.map((h) => summarize(calls, h)), [calls]);
  const outcomes = useMemo(() => outcomeCounts(calls), [calls]);
  const resolved = outcomes.target + outcomes.stop;
  const totalCalls = data?.calls.length || 0;

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">Track Record</h1>
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="text-[12px] font-bold text-accent-brand px-3 py-1.5 rounded-full border border-accent-brand/30 bg-accent-brand/10 disabled:opacity-50"
          >
            {refreshing ? "Scoring…" : "Rescore"}
          </button>
        </div>
        <p className="text-[13px] text-text-muted mt-1">
          Every call is logged permanently and scored against the S&amp;P 500 (SPY)
          and its sector — so we know if the picks actually work.
        </p>
      </header>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && data?.setupNeeded && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-5 text-[13px] text-text-muted leading-relaxed">
            <div className="text-[15px] font-bold text-text-primary mb-1">One-time setup needed</div>
            Run the migration{" "}
            <span className="font-mono text-[12px]">20261006120000_call_log.sql</span> in the
            Supabase SQL editor, then open Admin and tap <b>Import Past Calls</b>.
          </div>
        </div>
      )}

      {!loading && !data?.setupNeeded && data?.error && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-5 text-[13px] text-text-muted">
            Couldn&apos;t score calls right now: {data.error}
          </div>
        </div>
      )}

      {!loading && !data?.error && totalCalls === 0 && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center text-[13px] text-text-muted">
            No calls logged yet. Open{" "}
            <Link href="/admin" className="text-accent-brand font-bold">Admin</Link> and tap{" "}
            <b>Import Past Calls</b>, or regenerate Daily Picks — every new call is logged
            automatically.
          </div>
        </div>
      )}

      {!loading && totalCalls > 0 && (
        <>
          {/* Filters */}
          <div className="px-5 flex flex-col gap-2.5 mb-4">
            <div className="flex bg-surface-1 border border-border-1 rounded-[12px] p-1">
              {(["short-term", "long-term", "all"] as Scope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`flex-1 h-[34px] rounded-[9px] text-[12px] font-bold ${
                    scope === s ? "bg-accent-brand text-white" : "text-text-muted"
                  }`}
                >
                  {s === "short-term" ? "Short-term" : s === "long-term" ? "Long-term" : "All"}
                </button>
              ))}
            </div>
            {strategies.length > 1 && (
              <div className="flex gap-1.5 flex-wrap">
                {["all", ...strategies].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStrategy(s)}
                    className={`h-[28px] px-3 rounded-full text-[11px] font-bold border ${
                      strategy === s
                        ? "bg-accent-brand/15 text-accent-brand border-accent-brand/40"
                        : "text-text-muted border-border-1"
                    }`}
                  >
                    {STRATEGY_LABEL[s] || s}
                  </button>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 text-[12px] text-text-muted">
              <input
                type="checkbox"
                checked={includeImported}
                onChange={(e) => setIncludeImported(e.target.checked)}
              />
              Include calls imported from before tracking started
            </label>
          </div>

          {/* Horizon cards */}
          <div className="px-5 grid grid-cols-2 gap-2.5">
            {summaries.map((s) => {
              const primary = PRIMARY[scope].includes(s.horizon);
              const thin = s.n > 0 && s.n < MIN_RELIABLE_N;
              return (
                <div
                  key={s.horizon}
                  className={`bg-surface-1 rounded-[16px] p-3.5 border ${
                    primary ? "border-accent-brand/40" : "border-border-1"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-bold">{s.horizon} trading days</span>
                    <span className="font-mono text-[10px] text-text-faint">n={s.n}</span>
                  </div>
                  {s.n === 0 ? (
                    <p className="text-[11px] text-text-faint leading-snug">
                      No calls old enough to score yet.
                    </p>
                  ) : (
                    <>
                      <div className="text-[9px] uppercase tracking-[0.5px] text-text-faint font-mono">
                        Beat SPY
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-[22px] font-bold">{rate(s.hitRate)}</span>
                        <span className="text-[10px] text-text-faint">
                          vs {rate(s.baselineHitRate)} random
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                        <span className="text-text-faint">Avg vs SPY</span>
                        <span className={`font-mono text-right ${tone(s.meanExcessSpy)}`}>
                          {pct(s.meanExcessSpy)}
                        </span>
                        <span className="text-text-faint" title="Middle result — not skewed by one huge winner or loser">
                          Median vs SPY
                        </span>
                        <span className={`font-mono text-right ${tone(s.medianExcessSpy)}`}>
                          {pct(s.medianExcessSpy)}
                        </span>
                        <span className="text-text-faint">Edge vs random</span>
                        <span className={`font-mono text-right ${tone(s.edge)}`}>{pct(s.edge)}</span>
                        <span className="text-text-faint">Avg vs sector</span>
                        <span className={`font-mono text-right ${tone(s.meanExcessSector)}`}>
                          {pct(s.meanExcessSector)}
                        </span>
                        <span className="text-text-faint" title="Do higher-conviction calls do better? (rank correlation, −1 to +1)">
                          Conviction→return
                        </span>
                        <span className={`font-mono text-right ${tone(s.ic)}`}>
                          {s.ic == null ? "—" : s.ic.toFixed(2)}
                        </span>
                        <span className="text-text-faint" title="Above ~2 suggests the edge isn't luck; we want 3+">
                          t-stat
                        </span>
                        <span className="font-mono text-right text-text-muted">
                          {s.tStat == null ? "—" : s.tStat.toFixed(1)}
                        </span>
                      </div>
                      {thin && (
                        <p className="mt-2 text-[10px] leading-snug" style={{ color: "#F5A524" }}>
                          Too few calls to judge — needs {MIN_RELIABLE_N}+.
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Target / stop outcomes */}
          <div className="px-5 mt-3">
            <div className="bg-surface-1 border border-border-1 rounded-[16px] p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-bold">Target vs stop</span>
                <span className="text-[10px] text-text-faint">
                  {resolved > 0
                    ? `${Math.round((outcomes.target / resolved) * 100)}% hit target first`
                    : "none resolved yet"}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {(["target", "stop", "expired", "open"] as const).map((k) => (
                  <div key={k}>
                    <div className={`font-mono text-[18px] font-bold ${k === "target" ? "text-pos-green" : k === "stop" ? "text-neg-red" : ""}`}>
                      {outcomes[k]}
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.5px] text-text-faint font-mono">
                      {OUTCOME_STYLE[k].label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Call list */}
          <div className="px-5 mt-5">
            <h2 className="text-[15px] font-bold mb-2">Calls ({calls.length})</h2>
            <div className="flex flex-col gap-2">
              {calls.slice(0, 80).map((c) => {
                const o = OUTCOME_STYLE[c.outcome];
                return (
                  <Link
                    key={c.id}
                    href={`/stock/${c.symbol}`}
                    className="bg-surface-1 border border-border-1 rounded-[14px] px-3.5 py-2.5 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-extrabold">{c.symbol}</span>
                        <span
                          className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            c.action === "BUY" ? "text-pos-green bg-pos-green/10" : "text-neg-red bg-neg-red/10"
                          }`}
                        >
                          {c.action}
                        </span>
                        <span className="font-mono text-[10px] text-text-faint">{c.conviction}</span>
                      </div>
                      <div className="text-[10px] text-text-faint font-mono mt-0.5">
                        {new Date(c.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" · "}
                        {c.timeframe === "short-term" ? "short" : "long"}
                        {c.source === "backfill" ? " · imported" : ""}
                        {c.status === "pending" ? " · awaiting entry" : ""}
                      </div>
                    </div>
                    <div className="text-right font-mono text-[11px] leading-tight">
                      <div className={tone(c.horizons["5"]?.excessSpy ?? null)}>
                        5d {pct(c.horizons["5"]?.excessSpy ?? null)}
                      </div>
                      <div className={tone(c.horizons["20"]?.excessSpy ?? null)}>
                        20d {pct(c.horizons["20"]?.excessSpy ?? null)}
                      </div>
                      <div className={`${tone(c.liveExcess)} opacity-80`}>now {pct(c.liveExcess)}</div>
                    </div>
                    <span className={`shrink-0 font-mono text-[9px] uppercase px-1.5 py-0.5 rounded border ${o.cls}`}>
                      {o.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Method */}
          <div className="px-5 mt-5">
            <div className="bg-surface-1 border border-border-1 rounded-[14px] p-4 text-[11px] text-text-faint leading-relaxed">
              <b className="text-text-muted">How it&apos;s scored.</b> Each call enters at the first
              market open after it was made and is held for 5, 20, 60 and 120 trading days. Returns
              are compared with SPY and the stock&apos;s sector ETF over the same window (SELL calls
              win when the stock lags). &ldquo;Random&rdquo; is the same windows applied to a fixed{" "}
              {data?.baseline.length || 25}-stock basket from our universe. Overlapping windows make
              the t-stat look stronger than it is, and live edges typically run about half of
              backtests — treat anything under {MIN_RELIABLE_N} calls as noise.
              {data?.computedAt && (
                <span className="block mt-1 font-mono">
                  Scored {new Date(data.computedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      <TabBar />
    </div>
  );
}
