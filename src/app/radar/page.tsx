"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TabBar } from "@/components/tab-bar";
import { Disclaimer } from "@/components/disclaimer";

interface RadarHit {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  volumeRatio: number;
  gapPct: number;
  heat: number;
  chips: string[];
}

function HitSkeleton() {
  return (
    <div className="bg-surface-1 border border-border-1 rounded-[16px] p-4 animate-pulse">
      <div className="h-5 w-24 bg-surface-2 rounded mb-2" />
      <div className="h-3 w-40 bg-surface-2 rounded mb-3" />
      <div className="h-3 w-32 bg-surface-2 rounded" />
    </div>
  );
}

function heatColor(heat: number): string {
  if (heat >= 65) return "var(--neg-red-bright)";
  if (heat >= 45) return "#F97316";
  return "var(--accent-brand)";
}

export default function RadarPage() {
  const [hits, setHits] = useState<RadarHit[]>([]);
  const [scanned, setScanned] = useState(0);
  const [at, setAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const r = await fetch(`/api/market/radar${refresh ? "?refresh=1" : ""}`);
      if (!r.ok) throw new Error("Failed to load radar");
      const d = await r.json();
      setHits(d.hits || []);
      setScanned(d.scanned || 0);
      setAt(d.at || null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scanTime = at
    ? new Date(at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      }) + " ET"
    : "";

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
            ⚡ Momentum Radar
          </h1>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="text-[12px] font-bold text-accent-brand px-3 py-1.5 rounded-full border border-accent-brand/30 bg-accent-brand/10 disabled:opacity-50"
          >
            {refreshing ? "Scanning…" : "Rescan"}
          </button>
        </div>
        <p className="text-[13px] text-text-muted mt-1">
          Stocks breaking out right now — unusual volume, gaps &amp; 52-week
          breakouts. Live scan, no delay for the daily picks.
        </p>
        {scanned > 0 && (
          <p className="text-[11px] text-text-faint mt-1 font-mono">
            {scanned} scanned · {hits.length} in play · {scanTime}
          </p>
        )}
      </header>

      <div className="px-5 mt-3 flex flex-col gap-2.5">
        {loading ? (
          <>
            <HitSkeleton />
            <HitSkeleton />
            <HitSkeleton />
          </>
        ) : error ? (
          <div className="bg-surface-1 border border-border-1 rounded-[16px] p-6 text-center text-[13px] text-text-muted">
            {error}
          </div>
        ) : hits.length === 0 ? (
          <div className="bg-surface-1 border border-border-1 rounded-[16px] p-6 text-center">
            <div className="text-[14px] text-text-muted mb-1">
              Nothing unusual right now
            </div>
            <div className="text-[12px] text-text-faint">
              No stocks are showing volume surges, gaps, or breakouts at the
              moment. Tap Rescan later — the radar catches moves as they ignite.
            </div>
          </div>
        ) : (
          hits.map((h) => {
            const col =
              h.changePct >= 0 ? "var(--pos-green-bright)" : "var(--neg-red-bright)";
            return (
              <Link
                key={h.symbol}
                href={`/stock/${h.symbol}`}
                className="bg-surface-1 border border-border-1 rounded-[16px] p-4 flex flex-col gap-2.5 active:opacity-90 transition-opacity"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[18px] font-extrabold">{h.symbol}</span>
                      <span className="text-[12px] text-text-muted truncate">
                        {h.name}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[14px] font-medium">
                      ${h.price.toFixed(2)}
                    </div>
                    <div
                      className="font-mono text-[12px] font-medium"
                      style={{ color: col }}
                    >
                      {h.changePct >= 0 ? "+" : ""}
                      {h.changePct.toFixed(2)}%
                    </div>
                  </div>
                  {/* Heat badge */}
                  <div
                    className="shrink-0 w-[42px] text-center rounded-[10px] py-1"
                    style={{ background: `${heatColor(h.heat)}1A` }}
                    title="Momentum heat (0–100)"
                  >
                    <div
                      className="font-mono text-[15px] font-bold"
                      style={{ color: heatColor(h.heat) }}
                    >
                      {h.heat}
                    </div>
                    <div className="text-[7px] text-text-faint font-mono uppercase tracking-[0.5px]">
                      heat
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {h.chips.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold tracking-[0.3px] uppercase text-accent-brand px-2 py-0.5 rounded-md bg-accent-brand/10 border border-accent-brand/25"
                    >
                      <span aria-hidden>⚡</span>
                      {c}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })
        )}
      </div>

      <Disclaimer />
      <TabBar />
    </div>
  );
}
