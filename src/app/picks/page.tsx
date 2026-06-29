"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TabBar } from "@/components/tab-bar";
import { Disclaimer } from "@/components/disclaimer";
import { ConvictionMeter } from "@/components/conviction-meter";

interface Pick {
  symbol: string;
  companyName: string;
  action: "BUY" | "SELL";
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  timeframe: "short-term" | "long-term";
  conviction: number;
  rationale: string;
  catalysts: string[];
  currentPrice?: number;
}

interface PicksResponse {
  picks: Pick[];
  generatedAt: string;
  disclaimer: string;
}

function PickSkeleton() {
  return (
    <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-[44px] h-[44px] rounded-full bg-surface-2" />
        <div className="flex-1">
          <div className="h-4 w-20 bg-surface-2 rounded mb-1.5" />
          <div className="h-3 w-32 bg-surface-2 rounded" />
        </div>
        <div className="h-6 w-14 bg-surface-2 rounded-md" />
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="h-10 bg-surface-2 rounded-[10px]" />
        <div className="h-10 bg-surface-2 rounded-[10px]" />
        <div className="h-10 bg-surface-2 rounded-[10px]" />
      </div>
      <div className="h-3 w-full bg-surface-2 rounded mb-2" />
      <div className="h-3 w-3/4 bg-surface-2 rounded" />
    </div>
  );
}

function PickCard({ pick }: { pick: Pick }) {
  const isBuy = pick.action === "BUY";
  const actionColor = isBuy ? "var(--pos-green)" : "var(--neg-red)";
  const actionColorBright = isBuy
    ? "var(--pos-green-bright)"
    : "var(--neg-red-bright)";

  const potentialGain = isBuy
    ? ((pick.targetPrice - pick.entryPrice) / pick.entryPrice) * 100
    : ((pick.entryPrice - pick.targetPrice) / pick.entryPrice) * 100;

  const risk = isBuy
    ? ((pick.entryPrice - pick.stopLoss) / pick.entryPrice) * 100
    : ((pick.stopLoss - pick.entryPrice) / pick.entryPrice) * 100;

  const riskReward = risk > 0 ? (potentialGain / risk).toFixed(1) : "--";

  return (
    <Link href={`/stock/${pick.symbol}`}>
      <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4 flex flex-col gap-3 active:opacity-90 transition-opacity">
        {/* Row 1: Symbol, name, action badge */}
        <div className="flex items-center gap-3">
          <div
            className="w-[44px] h-[44px] rounded-full flex items-center justify-center font-mono text-[12px] font-bold border"
            style={{
              backgroundColor: isBuy
                ? "rgba(22, 199, 132, 0.1)"
                : "rgba(234, 57, 67, 0.1)",
              borderColor: isBuy
                ? "rgba(22, 199, 132, 0.2)"
                : "rgba(234, 57, 67, 0.2)",
              color: actionColorBright,
            }}
          >
            {pick.symbol.slice(0, 4)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[18px] font-extrabold">{pick.symbol}</span>
              {pick.timeframe === "short-term" ? (
                <span className="font-mono text-[9px] font-medium tracking-[0.5px] uppercase text-text-faint px-1.5 py-0.5 rounded-md bg-chip-bg border border-chip-border">
                  Short
                </span>
              ) : (
                <span className="font-mono text-[9px] font-medium tracking-[0.5px] uppercase text-accent-brand px-1.5 py-0.5 rounded-md bg-accent-brand/10 border border-accent-brand/20">
                  Long
                </span>
              )}
            </div>
            <div className="text-[12px] text-text-muted truncate">
              {pick.companyName}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className="font-mono text-[11px] font-bold tracking-[0.5px] px-2.5 py-1 rounded-[8px]"
              style={{
                backgroundColor: isBuy
                  ? "rgba(22, 199, 132, 0.15)"
                  : "rgba(234, 57, 67, 0.15)",
                color: actionColorBright,
              }}
            >
              {pick.action}
            </span>
            <span
              className="font-mono text-[11px] font-bold"
              style={{ color: actionColorBright }}
            >
              +{potentialGain.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Row 2: Price grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-surface-2 rounded-[10px] px-3 py-2 text-center">
            <div className="text-[9px] text-text-faint font-mono uppercase tracking-[0.5px] mb-0.5">
              Entry
            </div>
            <div className="font-mono text-[14px] font-bold">
              ${pick.entryPrice.toFixed(2)}
            </div>
            {pick.currentPrice != null && (
              <div
                className="font-mono text-[10px] mt-0.5"
                style={{
                  color:
                    pick.currentPrice >= pick.entryPrice
                      ? "var(--pos-green-bright)"
                      : "var(--neg-red-bright)",
                }}
              >
                Now ${pick.currentPrice.toFixed(2)}
              </div>
            )}
          </div>
          <div className="bg-surface-2 rounded-[10px] px-3 py-2 text-center">
            <div className="text-[9px] text-text-faint font-mono uppercase tracking-[0.5px] mb-0.5">
              Target
            </div>
            <div
              className="font-mono text-[14px] font-bold"
              style={{ color: actionColorBright }}
            >
              ${pick.targetPrice.toFixed(2)}
            </div>
          </div>
          <div className="bg-surface-2 rounded-[10px] px-3 py-2 text-center">
            <div className="text-[9px] text-text-faint font-mono uppercase tracking-[0.5px] mb-0.5">
              Stop Loss
            </div>
            <div className="font-mono text-[14px] font-bold text-neg-red">
              ${pick.stopLoss.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Row 3: Risk/Reward + Conviction */}
        <div className="flex items-center gap-3">
          <div className="shrink-0 text-[10px] text-text-faint font-mono">
            R:R {riskReward}
          </div>
          <div className="flex-1">
            <ConvictionMeter
              value={pick.conviction}
              color={actionColor}
              label="Conv."
            />
          </div>
        </div>

        {/* Row 4: Rationale */}
        <p className="text-[12px] text-text-secondary leading-relaxed">
          {pick.rationale}
        </p>

        {/* Row 5: Catalyst chips */}
        <div className="flex flex-wrap gap-1.5">
          {pick.catalysts.map((c) => (
            <span
              key={c}
              className="font-mono text-[10px] font-medium tracking-[0.5px] uppercase text-text-faint px-2 py-0.5 rounded-md bg-chip-bg border border-chip-border"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

export default function PicksPage() {
  const [data, setData] = useState<PicksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"short-term" | "long-term">("short-term");

  function loadPicks() {
    setLoading(true);
    setError(null);
    fetch("/api/picks/daily")
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 502 ? "Picks are being generated — check back shortly" : `Error ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadPicks();
  }, []);

  const filtered =
    data?.picks.filter((p) => p.timeframe === tab) ?? [];
  const buyCount = filtered.filter((p) => p.action === "BUY").length;
  const sellCount = filtered.filter((p) => p.action === "SELL").length;

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
            Daily Top 10
          </h1>
          <Link
            href="/history"
            className="text-[12px] font-bold text-accent-brand flex items-center gap-1"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            History
          </Link>
        </div>
        <p className="text-[13px] text-text-muted mt-1">
          AI-recommended buy &amp; sell picks with targets
        </p>
      </header>

      {/* Timeframe tabs */}
      <div className="px-5 pt-2 pb-3">
        <div className="flex gap-1">
          {(
            [
              { key: "short-term", label: "Short Term" },
              { key: "long-term", label: "Long Term" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`font-mono text-[11px] font-medium px-3 py-1.5 rounded-[8px] ${
                tab === t.key
                  ? "bg-accent-brand/15 text-accent-brand"
                  : "text-text-muted bg-surface-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="px-5 flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <PickSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center">
            <div className="text-[14px] text-text-muted mb-2">
              Unable to load picks
            </div>
            <div className="text-[12px] text-text-faint">{error}</div>
          </div>
        </div>
      )}

      {/* Picks list */}
      {!loading && !error && data && (
        <>
          {/* Summary bar */}
          <div className="px-5 mb-3">
            <div className="flex items-center gap-3 text-[11px] text-text-faint font-mono">
              <span>
                {filtered.length} pick{filtered.length !== 1 ? "s" : ""}
              </span>
              <span className="text-border-1">|</span>
              <span style={{ color: "var(--pos-green)" }}>
                {buyCount} BUY
              </span>
              <span style={{ color: "var(--neg-red)" }}>
                {sellCount} SELL
              </span>
              {data.generatedAt && (
                <>
                  <span className="text-border-1">|</span>
                  <span>
                    {new Date(data.generatedAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Cards */}
          <div className="px-5 flex flex-col gap-3">
            {filtered.length > 0 ? (
              filtered.map((pick) => (
                <PickCard key={pick.symbol} pick={pick} />
              ))
            ) : (
              <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center">
                <div className="text-[14px] text-text-muted">
                  No {tab} picks available
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-5">
        <Disclaimer />
      </div>

      <TabBar />
    </div>
  );
}
