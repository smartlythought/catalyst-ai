"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TabBar } from "@/components/tab-bar";
import { Disclaimer } from "@/components/disclaimer";

interface PennyPick {
  symbol: string;
  companyName: string;
  price: number;
  sector: string;
  marketCap: string;
  catalyst: string;
  potential: string;
  risk: string;
  rating: "high" | "medium" | "speculative";
  conviction: number;
  currentPrice?: number;
  changePercent?: number;
}

const RATING_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "rgba(22, 199, 132, 0.12)", text: "var(--pos-green-bright)", label: "High Potential" },
  medium: { bg: "rgba(59, 130, 246, 0.12)", text: "#3B82F6", label: "Moderate" },
  speculative: { bg: "rgba(249, 115, 22, 0.12)", text: "#F97316", label: "Speculative" },
};

function PickSkeleton() {
  return (
    <div className="p-4 animate-pulse">
      <div className="h-5 w-20 bg-surface-2 rounded mb-2" />
      <div className="h-3 w-40 bg-surface-2 rounded mb-2" />
      <div className="h-3 w-56 bg-surface-2 rounded mb-2" />
      <div className="h-3 w-32 bg-surface-2 rounded" />
    </div>
  );
}

export default function PennyStocksPage() {
  const [picks, setPicks] = useState<PennyPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "high" | "speculative">("all");

  useEffect(() => {
    fetch("/api/market/penny")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d) => setPicks(d.picks || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    tab === "all" ? picks : picks.filter((p) => p.rating === tab);

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-2">
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
          High-Yield Picks
        </h1>
        <p className="text-[13px] text-text-muted mt-1">
          Small-cap stocks under $20 with strong growth potential
        </p>
      </header>

      {/* Tabs */}
      <div className="px-5 pt-2 pb-3">
        <div className="flex gap-1">
          {([
            { key: "all", label: "All" },
            { key: "high", label: "High Potential" },
            { key: "speculative", label: "Speculative" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`font-mono text-[11px] font-medium px-3 py-1.5 rounded-[8px] whitespace-nowrap ${
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

      {/* Loading */}
      {loading && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <PickSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center">
            <div className="text-[14px] text-text-muted mb-2">Unable to load picks</div>
            <div className="text-[12px] text-text-faint">{error}</div>
          </div>
        </div>
      )}

      {/* Picks */}
      {!loading && !error && filtered.length > 0 && (
        <div className="px-5 flex flex-col gap-3">
          {filtered.map((pick) => {
            const ratingStyle = RATING_STYLES[pick.rating] || RATING_STYLES.medium;
            const livePrice = pick.currentPrice || pick.price;
            const changePct = pick.changePercent || 0;

            return (
              <Link
                key={pick.symbol}
                href={`/stock/${pick.symbol}`}
                className="bg-surface-1 border border-border-1 rounded-[18px] p-4 block active:opacity-90 transition-opacity"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[17px] font-bold">
                      {pick.symbol}
                    </span>
                    <span
                      className="font-mono text-[9px] font-medium tracking-[0.5px] uppercase px-2 py-0.5 rounded-md"
                      style={{ backgroundColor: ratingStyle.bg, color: ratingStyle.text }}
                    >
                      {ratingStyle.label}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[16px] font-bold">
                      ${livePrice.toFixed(2)}
                    </div>
                    {changePct !== 0 && (
                      <div
                        className="font-mono text-[11px] font-medium"
                        style={{
                          color: changePct >= 0 ? "var(--pos-green-bright)" : "var(--neg-red-bright)",
                        }}
                      >
                        {changePct >= 0 ? "+" : ""}
                        {changePct.toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[13px] text-text-secondary mb-2">
                  {pick.companyName}
                </div>

                {/* Conviction bar */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-[4px] rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pick.conviction}%`,
                        backgroundColor: ratingStyle.text,
                      }}
                    />
                  </div>
                  <span className="font-mono text-[11px] font-bold" style={{ color: ratingStyle.text }}>
                    {pick.conviction}%
                  </span>
                </div>

                {/* Details */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-pos-green font-mono mt-0.5 shrink-0">CATALYST</span>
                    <span className="text-[12px] text-text-muted">{pick.catalyst}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-accent-brand font-mono mt-0.5 shrink-0">UPSIDE</span>
                    <span className="text-[12px] text-text-muted">{pick.potential}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-neg-red font-mono mt-0.5 shrink-0">RISK</span>
                    <span className="text-[12px] text-text-muted">{pick.risk}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border-hairline">
                  <span className="font-mono text-[10px] text-text-faint">{pick.sector}</span>
                  <span className="font-mono text-[10px] text-text-faint">{pick.marketCap}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center">
            <div className="text-[14px] text-text-muted">No picks in this category</div>
          </div>
        </div>
      )}

      <div className="mt-5">
        <Disclaimer />
      </div>
      <TabBar />
    </div>
  );
}
