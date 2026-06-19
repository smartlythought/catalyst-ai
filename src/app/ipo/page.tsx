"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TabBar } from "@/components/tab-bar";
import { Disclaimer } from "@/components/disclaimer";

interface IPO {
  name: string;
  symbol: string;
  date: string;
  exchange: string;
  priceRange: string;
  shares: string;
  status: string;
  industry: string;
  aiAnalysis?: string;
  aiRating?: "strong" | "moderate" | "weak" | "avoid";
}

const RATING_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  strong: { bg: "rgba(22, 199, 132, 0.12)", text: "var(--pos-green-bright)", label: "Strong" },
  moderate: { bg: "rgba(59, 130, 246, 0.12)", text: "#3B82F6", label: "Moderate" },
  weak: { bg: "rgba(249, 115, 22, 0.12)", text: "#F97316", label: "Weak" },
  avoid: { bg: "rgba(234, 57, 67, 0.12)", text: "var(--neg-red-bright)", label: "Avoid" },
};

function formatDate(dateStr: string): { month: string; day: string } {
  const d = new Date(dateStr + "T00:00:00");
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }),
    day: String(d.getDate()),
  };
}

function IPOSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-3.5 animate-pulse">
      <div className="w-[44px] h-[50px] rounded-[10px] bg-surface-2" />
      <div className="flex-1">
        <div className="h-4 w-32 bg-surface-2 rounded mb-2" />
        <div className="h-3 w-48 bg-surface-2 rounded mb-2" />
        <div className="h-3 w-24 bg-surface-2 rounded" />
      </div>
    </div>
  );
}

export default function IPOPage() {
  const [ipos, setIpos] = useState<IPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/market/ipo")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load IPOs");
        return r.json();
      })
      .then((d) => setIpos(d.ipos || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    filter === "all"
      ? ipos
      : filter === "ai-strong"
        ? ipos.filter((i) => i.aiRating === "strong" || i.aiRating === "moderate")
        : ipos.filter((i) => i.industry.toLowerCase().includes(filter.toLowerCase()));

  const industries = Array.from(new Set(ipos.map((i) => i.industry).filter((i) => i !== "—"))).sort();

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-2">
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
          Upcoming IPOs
        </h1>
        <p className="text-[13px] text-text-muted mt-1">
          AI-analyzed new listings with recommendations
        </p>
      </header>

      {/* Filter tabs */}
      {!loading && !error && ipos.length > 0 && (
        <div className="px-5 pt-2 pb-3">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilter("all")}
              className={`font-mono text-[11px] font-medium px-3 py-1.5 rounded-[8px] whitespace-nowrap ${
                filter === "all"
                  ? "bg-accent-brand/15 text-accent-brand"
                  : "text-text-muted bg-surface-2"
              }`}
            >
              All ({ipos.length})
            </button>
            <button
              onClick={() => setFilter("ai-strong")}
              className={`font-mono text-[11px] font-medium px-3 py-1.5 rounded-[8px] whitespace-nowrap ${
                filter === "ai-strong"
                  ? "bg-pos-green/15 text-pos-green"
                  : "text-text-muted bg-surface-2"
              }`}
            >
              AI Picks
            </button>
            {industries.slice(0, 5).map((ind) => (
              <button
                key={ind}
                onClick={() => setFilter(ind)}
                className={`font-mono text-[11px] font-medium px-3 py-1.5 rounded-[8px] whitespace-nowrap ${
                  filter === ind
                    ? "bg-accent-brand/15 text-accent-brand"
                    : "text-text-muted bg-surface-2"
                }`}
              >
                {ind}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {!loading && !error && (
        <div className="px-5 mb-3">
          <div className="text-[11px] text-text-faint font-mono">
            {filtered.length} IPO{filtered.length !== 1 ? "s" : ""} in the next 90 days
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <IPOSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center">
            <div className="text-[14px] text-text-muted mb-2">Unable to load IPOs</div>
            <div className="text-[12px] text-text-faint">{error}</div>
          </div>
        </div>
      )}

      {/* IPO list */}
      {!loading && !error && filtered.length > 0 && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
            {filtered.map((ipo, i) => {
              const dateBlock = formatDate(ipo.date);
              const ratingStyle = RATING_STYLES[ipo.aiRating || "moderate"] || RATING_STYLES.moderate;

              return (
                <div
                  key={`${ipo.symbol}-${ipo.date}`}
                  className={`px-4 py-3.5 ${
                    i < filtered.length - 1 ? "border-b border-border-hairline" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    {/* Date block */}
                    <div className="w-[44px] h-[50px] rounded-[10px] bg-surface-2 border border-border-1 flex flex-col items-center justify-center shrink-0">
                      <div className="text-[9px] text-text-faint font-mono leading-none uppercase">
                        {dateBlock.month}
                      </div>
                      <div className="text-[16px] font-bold leading-tight">
                        {dateBlock.day}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-[15px] font-bold">
                          {ipo.symbol}
                        </span>
                        {ipo.aiRating && (
                          <span
                            className="font-mono text-[9px] font-medium tracking-[0.5px] uppercase px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: ratingStyle.bg, color: ratingStyle.text }}
                          >
                            {ratingStyle.label}
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] text-text-secondary truncate mb-1">
                        {ipo.name}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-text-faint font-mono">
                        <span>{ipo.priceRange}</span>
                        <span>{ipo.exchange}</span>
                        <span>{ipo.industry}</span>
                      </div>
                      {ipo.aiAnalysis && (
                        <p className="text-[11px] text-text-muted leading-relaxed mt-1.5">
                          {ipo.aiAnalysis}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center">
            <div className="text-[14px] text-text-muted">No upcoming IPOs found</div>
            <div className="text-[12px] text-text-faint mt-1">Check back later</div>
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
