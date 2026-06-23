"use client";

import { useState, useEffect } from "react";

interface IndexQuote {
  symbol: string;
  name: string;
  shortName: string;
  price: number;
  change: number;
  changePercent: number;
  isFuture?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pre: { label: "Pre-Market", color: "#F59E0B" },
  open: { label: "Market Open", color: "var(--pos-green-bright)" },
  post: { label: "After Hours", color: "#8B5CF6" },
  closed: { label: "Market Closed", color: "var(--text-faint)" },
};

export function MarketIndices() {
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [futures, setFutures] = useState<IndexQuote[]>([]);
  const [marketStatus, setMarketStatus] = useState<string>("closed");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch("/api/market/indices");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) {
          setIndices(data.indices || []);
          setFutures(data.futures || []);
          setMarketStatus(data.marketStatus || "closed");
          setLoaded(true);
        }
      } catch {}
    }

    load();
    const interval = setInterval(load, 60000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (!loaded) {
    return (
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="shrink-0 w-[100px] h-[62px] rounded-[12px] bg-surface-1 border border-border-1 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (indices.length === 0) return null;

  const status = STATUS_LABELS[marketStatus] || STATUS_LABELS.closed;

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 px-5 mb-2">
        <span
          className="w-[6px] h-[6px] rounded-full"
          style={{ backgroundColor: status.color }}
        />
        <span
          className="font-mono text-[10px] font-semibold tracking-[0.5px] uppercase"
          style={{ color: status.color }}
        >
          {status.label}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-5">
        {indices.map((idx) => {
          const isUp = idx.changePercent >= 0;
          return (
            <div
              key={idx.symbol}
              className="shrink-0 rounded-[12px] px-3 py-2.5 border"
              style={{
                minWidth: "100px",
                backgroundColor: isUp
                  ? "rgba(22, 199, 132, 0.06)"
                  : "rgba(234, 57, 67, 0.06)",
                borderColor: isUp
                  ? "rgba(22, 199, 132, 0.15)"
                  : "rgba(234, 57, 67, 0.15)",
              }}
            >
              <div className="font-mono text-[10px] font-semibold text-text-muted tracking-[0.5px] mb-0.5">
                {idx.shortName}
              </div>
              <div className="font-mono text-[14px] font-bold leading-tight">
                {idx.price >= 10000
                  ? idx.price.toLocaleString("en-US", {
                      maximumFractionDigits: 0,
                    })
                  : idx.price.toFixed(2)}
              </div>
              <div
                className="font-mono text-[11px] font-medium mt-0.5"
                style={{
                  color: isUp
                    ? "var(--pos-green-bright)"
                    : "var(--neg-red-bright)",
                }}
              >
                {isUp ? "+" : ""}
                {idx.changePercent.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
      {futures.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar px-5 mt-2">
          <span className="font-mono text-[9px] font-medium text-text-faint tracking-[0.5px] uppercase shrink-0">
            Futures
          </span>
          {futures.map((f) => {
            const isUp = f.changePercent >= 0;
            return (
              <div
                key={f.symbol}
                className="shrink-0 flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 border"
                style={{
                  backgroundColor: isUp
                    ? "rgba(22, 199, 132, 0.04)"
                    : "rgba(234, 57, 67, 0.04)",
                  borderColor: isUp
                    ? "rgba(22, 199, 132, 0.12)"
                    : "rgba(234, 57, 67, 0.12)",
                }}
              >
                <span className="font-mono text-[10px] font-semibold text-text-muted">
                  {f.shortName}
                </span>
                <span className="font-mono text-[12px] font-bold">
                  {f.price >= 1000
                    ? f.price.toLocaleString("en-US", { maximumFractionDigits: 0 })
                    : f.price.toFixed(2)}
                </span>
                <span
                  className="font-mono text-[10px] font-medium"
                  style={{
                    color: isUp
                      ? "var(--pos-green-bright)"
                      : "var(--neg-red-bright)",
                  }}
                >
                  {isUp ? "+" : ""}
                  {f.changePercent.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
