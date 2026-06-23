"use client";

import { use, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { cn, formatPercent } from "@/lib/utils";
import { TabBar } from "@/components/tab-bar";

/* ─── Types ─── */

type SignalTier = "S" | "A" | "B" | "C";

interface EcosystemEdge {
  sourceTicker: string;
  targetTicker: string;
  relationship: string;
  description: string;
  confidence: number;
  tier?: SignalTier;
  category?: string;
  quote: { price: number; changePercent: number } | null;
}

interface EcosystemPicks {
  partners: {
    ticker: string;
    relationship: string;
    description: string;
    price: number;
    change: number;
  }[];
  bestPick: string;
  rationale: string;
}

interface EcosystemData {
  ticker: string;
  totalRelationships: number;
  isAiGenerated: boolean;
  edges: EcosystemEdge[];
  picks: EcosystemPicks;
  summary: string;
}

/* ─── Constants ─── */

const relColors: Record<string, string> = {
  supplier: "#53BDEB",
  customer: "var(--pos-green)",
  partner: "var(--accent-brand)",
  competitor: "var(--neg-red)",
  subsidiary: "#9AA1AD",
  investor: "#E8A838",
};

const relLabels: Record<string, string> = {
  supplier: "SUPPLIER",
  customer: "CUSTOMER",
  partner: "PARTNER",
  competitor: "COMPETITOR",
  subsidiary: "SUBSIDIARY",
  investor: "INVESTOR",
};

const relIcons: Record<string, string> = {
  supplier: "↑",
  customer: "↓",
  partner: "⇄",
  competitor: "⚡",
  subsidiary: "◇",
  investor: "◈",
};

const tierOrder: SignalTier[] = ["S", "A", "B", "C"];

const tierStyles: Record<
  SignalTier,
  { bg: string; text: string; border: string }
> = {
  S: {
    bg: "rgba(232, 168, 56, 0.18)",
    text: "#E8A838",
    border: "rgba(232, 168, 56, 0.35)",
  },
  A: {
    bg: "rgba(83, 189, 235, 0.15)",
    text: "#53BDEB",
    border: "rgba(83, 189, 235, 0.30)",
  },
  B: {
    bg: "rgba(154, 161, 173, 0.12)",
    text: "#9AA1AD",
    border: "rgba(154, 161, 173, 0.25)",
  },
  C: {
    bg: "rgba(154, 161, 173, 0.06)",
    text: "#6B7280",
    border: "rgba(154, 161, 173, 0.15)",
  },
};

const relOrder = [
  "supplier",
  "customer",
  "partner",
  "competitor",
  "investor",
  "subsidiary",
];

/* ─── Helpers ─── */

function assignTier(edge: EcosystemEdge): SignalTier {
  if (edge.tier) return edge.tier;
  const c = edge.confidence;
  if (c >= 0.9) return "S";
  if (c >= 0.7) return "A";
  if (c >= 0.5) return "B";
  return "C";
}

/* ─── Components ─── */

function TierBadge({ tier }: { tier: SignalTier }) {
  const style = tierStyles[tier];
  return (
    <span
      className="inline-flex items-center justify-center font-mono text-[10px] font-bold w-[22px] h-[18px] rounded-[4px]"
      style={{
        backgroundColor: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
      }}
    >
      {tier}
    </span>
  );
}

function RelBadge({ rel }: { rel: string }) {
  const color = relColors[rel] || "#9AA1AD";
  return (
    <span
      className="font-mono text-[9px] font-medium tracking-[0.5px] uppercase px-1.5 py-0.5 rounded"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {relLabels[rel] || rel.toUpperCase()}
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
      <div className="w-[22px] h-[18px] rounded-[4px] bg-surface-2" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 w-16 rounded bg-surface-2" />
        <div className="h-3 w-40 rounded bg-surface-2" />
      </div>
      <div className="space-y-1.5 text-right">
        <div className="h-3.5 w-14 rounded bg-surface-2 ml-auto" />
        <div className="h-3 w-12 rounded bg-surface-2 ml-auto" />
      </div>
    </div>
  );
}

function LoadingSkeleton({ symbol }: { symbol: string }) {
  return (
    <div className="min-h-dvh pb-24">
      <header className="safe-top px-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <Link
            href={`/stock/${symbol}`}
            className="text-[14px] text-accent-brand font-medium flex items-center gap-1"
          >
            <span className="text-[18px]">&lsaquo;</span> Back
          </Link>
        </div>
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
          {symbol} Ecosystem
        </h1>
        <p className="text-[14px] text-text-muted mt-1">Loading ecosystem...</p>
      </header>

      {/* Summary skeleton */}
      <div className="px-5 mb-5">
        <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4 animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-surface-2" />
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex-1 h-12 rounded-[10px] bg-surface-2" />
            ))}
          </div>
        </div>
      </div>

      {/* List skeleton */}
      <div className="px-5 mb-5">
        <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={cn(i < 5 ? "border-b border-border-hairline" : "")}
            >
              <SkeletonRow />
            </div>
          ))}
        </div>
      </div>
      <TabBar />
    </div>
  );
}

/* ─── Main Page ─── */

export default function EcosystemPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = use(params);
  const symbol = ticker.toUpperCase();

  const [data, setData] = useState<EcosystemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/ecosystem/${symbol}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ecosystem (${r.status})`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbol]);

  /* ─── Derived data ─── */

  const filteredEdges = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase().trim();
    if (!q) return data.edges;
    return data.edges.filter(
      (e) =>
        e.targetTicker.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.relationship.toLowerCase().includes(q) ||
        (e.category || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  // Group by tier, then by relationship type within each tier
  const groupedByTier = useMemo(() => {
    const tiers: Record<SignalTier, Record<string, EcosystemEdge[]>> = {
      S: {},
      A: {},
      B: {},
      C: {},
    };

    for (const edge of filteredEdges) {
      const tier = assignTier(edge);
      const rel = edge.relationship;
      if (!tiers[tier][rel]) tiers[tier][rel] = [];
      tiers[tier][rel].push(edge);
    }

    return tiers;
  }, [filteredEdges]);

  // Stats for summary card
  const stats = useMemo(() => {
    if (!data) return null;
    const byTier: Record<string, number> = { S: 0, A: 0, B: 0, C: 0 };
    const byRel: Record<string, number> = {};

    for (const edge of data.edges) {
      const tier = assignTier(edge);
      byTier[tier] = (byTier[tier] || 0) + 1;
      byRel[edge.relationship] = (byRel[edge.relationship] || 0) + 1;
    }

    return { total: data.totalRelationships, byTier, byRel };
  }, [data]);

  /* ─── Loading ─── */

  if (loading) return <LoadingSkeleton symbol={symbol} />;

  /* ─── Error ─── */

  if (error || !data) {
    return (
      <div className="min-h-dvh pb-24">
        <header className="safe-top px-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/"
              className="text-[14px] text-accent-brand font-medium flex items-center gap-1"
            >
              <span className="text-[18px]">&lsaquo;</span> Back
            </Link>
          </div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
            {symbol} Ecosystem
          </h1>
        </header>
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center">
            <p className="text-[15px] font-semibold mb-1">
              Could not load ecosystem
            </p>
            <p className="text-[13px] text-text-muted">
              {error || "No data available for this ticker."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 text-[13px] font-medium text-accent-brand"
            >
              Try again
            </button>
          </div>
        </div>
        <TabBar />
      </div>
    );
  }

  /* ─── Render ─── */

  const hasResults = filteredEdges.length > 0;

  if (data.totalRelationships === 0) {
    return (
      <div className="min-h-dvh pb-24">
        <header className="safe-top px-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <Link href="/" className="text-[14px] text-accent-brand font-medium flex items-center gap-1">
              <span className="text-[18px]">&lsaquo;</span> Back
            </Link>
          </div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">{symbol} Ecosystem</h1>
        </header>
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center">
            <div className="text-[32px] mb-3">🔍</div>
            <p className="text-[15px] font-semibold mb-1">Ecosystem not available yet</p>
            <p className="text-[13px] text-text-muted mb-4">
              AI-generated ecosystem maps are available for select tickers. Try one of the popular ones below, or check back later.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA"].map((t) => (
                <Link
                  key={t}
                  href={`/ecosystem/${t}`}
                  className="font-mono text-[13px] font-bold text-accent-brand bg-accent-brand/10 px-3 py-1.5 rounded-full"
                >
                  {t}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <TabBar />
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-24">
      {/* Header */}
      <header className="safe-top px-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <Link
            href={`/stock/${symbol}`}
            className="text-[14px] text-accent-brand font-medium flex items-center gap-1"
          >
            <span className="text-[18px]">&lsaquo;</span> Back
          </Link>
          <Link
            href={`/chat?ticker=${symbol}&q=ecosystem`}
            className="flex items-center gap-1.5 text-[13px] font-medium text-accent-brand bg-accent-brand/10 px-3 py-1.5 rounded-full"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l4.93-1.38A9.96 9.96 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="12" r="1" fill="currentColor" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
              <circle cx="16" cy="12" r="1" fill="currentColor" />
            </svg>
            Ask AI
          </Link>
        </div>
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
          {symbol} Ecosystem
        </h1>
        <p className="text-[14px] text-text-muted mt-1">
          {data.isAiGenerated
            ? `AI-generated · ${data.totalRelationships} companies`
            : `${data.totalRelationships} companies in the network`}
        </p>
      </header>

      {/* Summary card */}
      {stats && (
        <div className="px-5 mb-4">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4">
            {/* Tier breakdown */}
            <div className="flex gap-2 mb-3">
              {tierOrder.map((t) => {
                const count = stats.byTier[t] || 0;
                if (count === 0) return null;
                const style = tierStyles[t];
                return (
                  <div
                    key={t}
                    className="flex-1 rounded-[10px] p-2.5 text-center"
                    style={{
                      backgroundColor: style.bg,
                      border: `1px solid ${style.border}`,
                    }}
                  >
                    <div
                      className="font-mono text-[18px] font-bold"
                      style={{ color: style.text }}
                    >
                      {count}
                    </div>
                    <div
                      className="font-mono text-[9px] font-semibold tracking-[0.5px] uppercase"
                      style={{ color: style.text }}
                    >
                      Tier {t}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Relationship type breakdown */}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {relOrder.map((rel) => {
                const count = stats.byRel[rel] || 0;
                if (count === 0) return null;
                const color = relColors[rel] || "#9AA1AD";
                return (
                  <div key={rel} className="flex items-center gap-1.5">
                    <div
                      className="w-[5px] h-[5px] rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-mono text-[10px] text-text-muted">
                      {count} {rel}
                      {count !== 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* AI summary */}
            {data.summary && (
              <p className="text-[12px] text-text-muted mt-3 leading-relaxed">
                {data.summary}
              </p>
            )}
          </div>
        </div>
      )}

      {/* AI best pick */}
      {data.picks?.bestPick && (
        <div className="px-5 mb-4">
          <div
            className="bg-surface-1 border rounded-[14px] p-3.5"
            style={{ borderColor: "rgba(232, 168, 56, 0.3)" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12px]">✦</span>
              <span className="font-mono text-[10px] text-text-faint uppercase tracking-[1px]">
                AI Best Pick
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/stock/${data.picks.bestPick}`}
                className="text-[17px] font-bold text-accent-brand"
              >
                {data.picks.bestPick}
              </Link>
            </div>
            <p className="text-[12px] text-text-muted mt-1 leading-relaxed">
              {data.picks.rationale}
            </p>
          </div>
        </div>
      )}

      {/* Search / filter */}
      <div className="px-5 mb-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
            width="16"
            height="16"
            viewBox="0 0 22 22"
            fill="none"
          >
            <circle
              cx="10"
              cy="10"
              r="6"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M14.5 14.5L19 19"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by ticker, description, or type..."
            className="w-full bg-surface-1 border border-border-1 rounded-[12px] pl-9 pr-4 py-2.5 text-[14px] placeholder:text-text-faint outline-none focus:border-accent-brand/50 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint text-[18px] leading-none"
            >
              ×
            </button>
          )}
        </div>
        {search && (
          <p className="text-[11px] text-text-muted mt-1.5 px-1">
            {filteredEdges.length} result{filteredEdges.length !== 1 ? "s" : ""}{" "}
            for &ldquo;{search}&rdquo;
          </p>
        )}
      </div>

      {/* Grouped list: Tier → Relationship */}
      {!hasResults && search && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center">
            <p className="text-[14px] text-text-muted">
              No companies match &ldquo;{search}&rdquo;
            </p>
          </div>
        </div>
      )}

      {tierOrder.map((tier) => {
        const relGroups = groupedByTier[tier];
        const rels = relOrder.filter((r) => relGroups[r]?.length);
        if (rels.length === 0) return null;

        const tierStyle = tierStyles[tier];
        const tierCount = rels.reduce(
          (acc, r) => acc + (relGroups[r]?.length || 0),
          0
        );

        return (
          <div key={tier} className="px-5 mb-5">
            {/* Tier header */}
            <div className="flex items-center gap-2 mb-3">
              <TierBadge tier={tier} />
              <span className="font-mono text-[10px] text-text-faint uppercase tracking-[1px]">
                Tier {tier}
              </span>
              <span
                className="font-mono text-[10px] tracking-[0.5px]"
                style={{ color: tierStyle.text }}
              >
                · {tierCount}
              </span>
            </div>

            {rels.map((rel) => {
              const edges = relGroups[rel];
              if (!edges || edges.length === 0) return null;

              return (
                <div key={`${tier}-${rel}`} className="mb-3 last:mb-0">
                  {/* Relationship sub-header */}
                  <div className="flex items-center gap-1.5 mb-1.5 px-1">
                    <span className="text-[11px]">{relIcons[rel] || "·"}</span>
                    <span
                      className="font-mono text-[9px] font-medium tracking-[0.5px] uppercase"
                      style={{ color: relColors[rel] || "#9AA1AD" }}
                    >
                      {relLabels[rel] || rel}
                    </span>
                  </div>

                  {/* Edge list */}
                  <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
                    {edges.map((edge, i) => (
                      <Link
                        key={edge.targetTicker}
                        href={`/stock/${edge.targetTicker}`}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3.5 active:bg-surface-2/50 transition-colors",
                          i < edges.length - 1
                            ? "border-b border-border-hairline"
                            : ""
                        )}
                      >
                        {/* Tier dot */}
                        <div
                          className="w-[6px] h-[6px] rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              relColors[edge.relationship] ||
                              "var(--neutral-watch)",
                          }}
                        />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] font-bold">
                              {edge.targetTicker}
                            </span>
                            <TierBadge tier={assignTier(edge)} />
                            <RelBadge rel={edge.relationship} />
                          </div>
                          <div className="text-[12px] text-text-muted truncate mt-0.5">
                            {edge.description}
                          </div>
                        </div>

                        {/* Quote */}
                        <div className="text-right shrink-0">
                          {edge.quote ? (
                            <>
                              <div className="font-mono text-[13px] font-medium">
                                ${edge.quote.price.toFixed(2)}
                              </div>
                              <div
                                className="font-mono text-[11px] font-medium"
                                style={{
                                  color:
                                    edge.quote.changePercent >= 0
                                      ? "var(--pos-green-bright)"
                                      : "var(--neg-red-bright)",
                                }}
                              >
                                {formatPercent(edge.quote.changePercent)}
                              </div>
                            </>
                          ) : (
                            <div className="font-mono text-[11px] text-text-faint">
                              —
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Ask AI CTA (bottom) */}
      <div className="px-5 mb-6">
        <Link
          href={`/chat?ticker=${symbol}&q=ecosystem`}
          className="flex items-center justify-center gap-2 w-full bg-surface-1 border border-border-1 rounded-[14px] py-3.5 text-[14px] font-medium text-accent-brand active:bg-surface-2/50 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l4.93-1.38A9.96 9.96 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="8" cy="12" r="1" fill="currentColor" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
            <circle cx="16" cy="12" r="1" fill="currentColor" />
          </svg>
          Ask AI about this ecosystem
        </Link>
      </div>

      <TabBar />
    </div>
  );
}
