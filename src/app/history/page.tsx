"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TabBar } from "@/components/tab-bar";

interface DayHistory {
  date: string;
  picks?: any[];
  penny?: any[];
  ipo?: any[];
  createdAt?: string;
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function HistoryPage() {
  const [days, setDays] = useState<DayHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => {
        setDays(d.days || []);
        if (d.days?.[0]) setOpen(d.days[0].date);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-3">
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">AI History</h1>
        <p className="text-[13px] text-text-muted mt-1">
          A saved record of each day&apos;s AI analysis — picks, high-yield, and
          IPOs — for tracking and back-testing.
        </p>
      </header>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && days.length === 0 && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center text-[13px] text-text-muted">
            No history yet. Snapshots are saved automatically each day AI
            analysis runs (Daily Picks, High-yield, IPOs).
          </div>
        </div>
      )}

      <div className="px-5 flex flex-col gap-3">
        {days.map((d) => {
          const isOpen = open === d.date;
          const picks = d.picks || [];
          const shortN = picks.filter((p) => p.timeframe === "short-term").length;
          const longN = picks.filter((p) => p.timeframe === "long-term").length;
          return (
            <div key={d.date} className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : d.date)}
                className="w-full flex items-center justify-between px-4 py-3.5"
              >
                <div className="text-left">
                  <div className="text-[15px] font-bold">{fmtDate(d.date)}</div>
                  <div className="text-[11px] text-text-faint font-mono mt-0.5">
                    {picks.length} picks ({shortN}S/{longN}L)
                    {d.penny ? ` · ${d.penny.length} high-yield` : ""}
                    {d.ipo ? ` · ${d.ipo.length} IPOs` : ""}
                  </div>
                </div>
                <span className="text-[13px] text-accent-brand">{isOpen ? "Hide" : "View"}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 flex flex-col gap-4 border-t border-border-hairline pt-3">
                  {picks.length > 0 && (
                    <div>
                      <div className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-2">
                        Daily Picks
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {picks.map((p, i) => (
                          <Link
                            key={`${p.symbol}-${i}`}
                            href={`/stock/${p.symbol}`}
                            className="flex items-center gap-2 text-[12px]"
                          >
                            <span
                              className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{
                                color: p.action === "SELL" ? "var(--neg-red-bright)" : "var(--pos-green-bright)",
                                backgroundColor: p.action === "SELL" ? "rgba(234,57,67,0.12)" : "rgba(22,199,132,0.12)",
                              }}
                            >
                              {p.action}
                            </span>
                            <span className="font-mono font-bold w-[52px]">{p.symbol}</span>
                            <span className="text-text-faint font-mono">
                              ${p.entryPrice?.toFixed?.(2)} → ${p.targetPrice?.toFixed?.(2)} (SL ${p.stopLoss?.toFixed?.(2)})
                            </span>
                            <span className="ml-auto text-[9px] font-mono text-text-faint uppercase">
                              {p.timeframe === "short-term" ? "S" : "L"}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {d.ipo && d.ipo.length > 0 && (
                    <div>
                      <div className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-2">
                        IPOs
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {d.ipo.slice(0, 12).map((ipo, i) => (
                          <span key={`${ipo.symbol}-${i}`} className="text-[11px] font-mono px-2 py-0.5 rounded bg-chip-bg border border-chip-border">
                            {ipo.symbol} · {ipo.aiRating || "—"}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {d.penny && d.penny.length > 0 && (
                    <div>
                      <div className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-2">
                        High-Yield
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {d.penny.slice(0, 12).map((p, i) => (
                          <span key={`${p.symbol}-${i}`} className="text-[11px] font-mono px-2 py-0.5 rounded bg-chip-bg border border-chip-border">
                            {p.symbol}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <TabBar />
    </div>
  );
}
