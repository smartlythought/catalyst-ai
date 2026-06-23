"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { MOCK_SIGNALS } from "@/lib/mock-data";
import { callColor, formatPercent } from "@/lib/utils";
import { Sparkline } from "@/components/sparkline";
import { ConvictionMeter } from "@/components/conviction-meter";
import { TabBar } from "@/components/tab-bar";
import { Disclaimer } from "@/components/disclaimer";
import type { Signal } from "@/lib/types";

const signalTypeColors: Record<string, string> = {
  INSIDER_BUY: "var(--pos-green)",
  INSIDER_SELL: "var(--neg-red)",
  UPGRADE: "var(--accent-brand)",
  DOWNGRADE: "var(--neg-red)",
  EARNINGS: "var(--pos-green)",
  GUIDANCE: "var(--pos-green)",
  OPTIONS_FLOW: "#E8A838",
  SEC_FILING: "#53BDEB",
  NEWS: "var(--neutral-watch)",
  TECHNICAL: "var(--accent-brand)",
};

export default function SignalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [livePrice, setLivePrice] = useState<{ price: number; change: number; changePercent: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const pickMatch = id.match(/^pick-(.+)-(\d+)$/);
      if (pickMatch) {
        const index = parseInt(pickMatch[2]);
        try {
          const res = await fetch("/api/picks/daily");
          const data = await res.json();
          const picks = data.picks;
          if (Array.isArray(picks) && picks[index]) {
            const p = picks[index];
            setSignal({
              id,
              ticker: p.symbol,
              company: p.companyName,
              exchange: "NASDAQ",
              price: p.currentPrice || p.entryPrice,
              change: 0,
              changePercent: 0,
              call: p.action === "SELL" ? "REDUCE" : "BUY",
              conviction: p.conviction,
              horizon: p.timeframe === "short-term" ? "1–4 weeks" : "1–6 months",
              entry: p.entryPrice,
              target: p.targetPrice,
              stop: p.stopLoss,
              riskReward: p.entryPrice && p.targetPrice && p.stopLoss
                ? `1:${(Math.abs(p.targetPrice - p.entryPrice) / Math.abs(p.entryPrice - p.stopLoss)).toFixed(1)}`
                : undefined,
              why: p.rationale,
              tags: (p.catalysts || []).slice(0, 3),
              signals: (p.catalysts || []).map((c: string) => ({
                type: "NEWS" as const,
                title: c,
                detail: "",
                sentiment: p.action === "SELL" ? ("negative" as const) : ("positive" as const),
              })),
              sparkline: [],
              timestamp: data.generatedAt || new Date().toISOString(),
            });
            fetch(`/api/stock/${p.symbol}?range=1D`)
              .then((r) => r.json())
              .then((stock) => {
                if (stock.quote?.price) {
                  setLivePrice({
                    price: stock.quote.price,
                    change: stock.quote.change || 0,
                    changePercent: stock.quote.changePercent || 0,
                  });
                }
              })
              .catch(() => {});
            setLoading(false);
            return;
          }
        } catch {}
        setSignal(null);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/signals`);
        const data = await res.json();
        const found = data.signals?.find((s: Signal) => s.id === id);
        setSignal(found || MOCK_SIGNALS.find((s) => s.id === id) || null);
      } catch {
        setSignal(MOCK_SIGNALS.find((s) => s.id === id) || null);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-text-muted">Signal not found</p>
      </div>
    );
  }

  const color = callColor(signal.call);
  const changeColor =
    signal.changePercent >= 0
      ? "var(--pos-green-bright)"
      : "var(--neg-red-bright)";

  const heroGradient =
    signal.call === "BUY"
      ? "var(--hero-buy-bg)"
      : signal.call === "REDUCE"
        ? "var(--hero-reduce-bg)"
        : "var(--hero-watch-bg)";

  const heroBorder =
    signal.call === "BUY"
      ? "var(--hero-buy-border)"
      : signal.call === "REDUCE"
        ? "var(--hero-reduce-border)"
        : "var(--hero-watch-border)";

  return (
    <div className="min-h-dvh pb-24">
      {/* Header */}
      <header className="safe-top px-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <Link
            href="/"
            className="text-[14px] text-accent-brand font-medium flex items-center gap-1"
          >
            <span className="text-[18px]">&lsaquo;</span> Calls
          </Link>
          <span className="text-[12px] text-text-faint font-mono uppercase tracking-[1px]">
            {signal.exchange}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[34px] font-extrabold leading-none">
              {signal.ticker}
            </h1>
            <p className="text-[14px] text-text-muted mt-0.5">
              {signal.company}
            </p>
          </div>
          <div className="text-right">
            {livePrice ? (
              <>
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[8px] font-bold tracking-[0.5px] uppercase text-pos-green bg-pos-green/15 px-1.5 py-0.5 rounded animate-pulse">
                    Live
                  </span>
                  <span className="font-mono text-[22px] font-bold">
                    ${livePrice.price.toFixed(2)}
                  </span>
                </div>
                <div className="font-mono text-[14px] font-medium" style={{ color: livePrice.changePercent >= 0 ? "var(--pos-green-bright)" : "var(--neg-red-bright)" }}>
                  {livePrice.change >= 0 ? "+" : ""}
                  {livePrice.change.toFixed(2)} ({formatPercent(livePrice.changePercent)})
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-[22px] font-bold">
                  ${signal.price.toFixed(2)}
                </div>
                <div className="font-mono text-[14px] font-medium" style={{ color: changeColor }}>
                  {signal.change >= 0 ? "+" : ""}
                  {signal.change.toFixed(2)} ({formatPercent(signal.changePercent)})
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Live price vs entry alert */}
      {livePrice && signal.entry && Math.abs(livePrice.price - signal.entry) / signal.entry > 0.02 && (
        <div className="px-5 mb-3">
          <div className="rounded-[14px] px-4 py-3 border flex items-center justify-between"
            style={{
              background: livePrice.price < signal.entry ? "rgba(234,57,67,0.08)" : "rgba(22,199,132,0.08)",
              borderColor: livePrice.price < signal.entry ? "rgba(234,57,67,0.2)" : "rgba(22,199,132,0.2)",
            }}
          >
            <div>
              <div className="text-[11px] text-text-muted font-medium">Live vs Entry</div>
              <div className="font-mono text-[13px] font-bold" style={{ color: livePrice.price < signal.entry ? "var(--neg-red-bright)" : "var(--pos-green-bright)" }}>
                {livePrice.price < signal.entry ? "" : "+"}
                {(((livePrice.price - signal.entry) / signal.entry) * 100).toFixed(2)}% from entry
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-text-faint">Entry</div>
              <div className="font-mono text-[14px] font-semibold">${signal.entry.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Hero container */}
      <div className="px-5 mb-4">
        <div
          className="rounded-[18px] p-4"
          style={{
            background: heroGradient,
            border: `1px solid ${heroBorder}`,
          }}
        >
          {/* Verdict row */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[26px] font-extrabold" style={{ color }}>
              {signal.call}
            </span>
            <div className="w-px h-8 bg-border-hairline" />
            <div className="flex-1">
              <div className="text-[12px] text-text-muted">{signal.horizon}</div>
              <div className="text-[13px] font-semibold" style={{ color }}>
                Conviction {signal.conviction}%
              </div>
            </div>
            <Sparkline data={signal.sparkline} color={color} width={48} height={20} />
          </div>

          {signal.entry && signal.target && signal.stop ? (
            <>
              <div className="flex gap-2 mb-3">
                <div className="flex-1 bg-surface-2 rounded-[13px] p-3">
                  <div className="text-[10px] font-mono text-text-faint uppercase tracking-[1px] mb-1">
                    Entry
                  </div>
                  <div className="font-mono text-[18px] font-bold text-text-primary">
                    ${signal.entry.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-text-muted">buy zone</div>
                </div>
                <div className="flex-1 bg-surface-2 rounded-[13px] p-3">
                  <div className="text-[10px] font-mono text-text-faint uppercase tracking-[1px] mb-1">
                    Target
                  </div>
                  <div className="font-mono text-[18px] font-bold text-pos-green-bright">
                    ${signal.target.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-pos-green">
                    +{(((signal.target - signal.entry) / signal.entry) * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="flex-1 bg-surface-2 rounded-[13px] p-3">
                  <div className="text-[10px] font-mono text-text-faint uppercase tracking-[1px] mb-1">
                    Stop
                  </div>
                  <div className="font-mono text-[18px] font-bold text-neg-red-bright">
                    ${signal.stop.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-neg-red">
                    -{(((signal.entry - signal.stop) / signal.entry) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              {signal.riskReward && (
                <div className="flex items-center justify-between pt-3 border-t border-border-hairline">
                  <span className="text-[12px] text-text-muted">Risk : Reward</span>
                  <span className="font-mono text-[14px] font-bold text-accent-brand">
                    {signal.riskReward}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="text-[13px] text-text-muted italic">
              {signal.call === "WATCH"
                ? "Monitoring — no actionable levels yet"
                : "Consider reducing or exiting position"}
            </div>
          )}
        </div>
      </div>

      {/* Why this call */}
      <div className="px-5 mb-4">
        <h3 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-2">
          Why this call
        </h3>
        <p className="text-[14px] text-text-secondary leading-relaxed">
          {signal.why}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {signal.tags.map((tag) => (
            <span
              key={tag}
              className="font-mono text-[10px] font-medium tracking-[0.5px] uppercase text-text-faint px-2 py-0.5 rounded-md bg-chip-bg border border-chip-border"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Signal breakdown */}
      <div className="px-5 mb-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full py-3 border-t border-border-hairline"
        >
          <span className="text-[14px] font-semibold">Signal breakdown</span>
          <span className="text-[13px] text-accent-brand font-medium">
            {expanded ? "Hide" : "Show"}
          </span>
        </button>
        {expanded && (
          <div className="flex flex-col gap-3 pb-3">
            {signal.signals.map((s, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className="w-[8px] h-[8px] rounded-full mt-1.5"
                    style={{
                      backgroundColor: signalTypeColors[s.type] || "var(--neutral-watch)",
                    }}
                  />
                  {i < signal.signals.length - 1 && (
                    <div className="w-px flex-1 bg-border-hairline mt-1" />
                  )}
                </div>
                <div className="flex-1 pb-2">
                  <div className="text-[14px] font-semibold">{s.title}</div>
                  <div className="text-[13px] text-text-muted leading-relaxed mt-0.5">
                    {s.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full stock view link */}
      <div className="px-5 mb-4">
        <Link
          href={`/stock/${signal.ticker}`}
          className="flex items-center justify-between py-3 border-t border-b border-border-hairline"
        >
          <span className="text-[14px] font-semibold">Full stock view</span>
          <span className="text-[14px] text-text-faint">&rsaquo;</span>
        </Link>
      </div>

      {/* Actions */}
      <div className="px-5 flex gap-3">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `${signal.call} ${signal.ticker} @ $${signal.price.toFixed(2)} | Conviction ${signal.conviction}% | ${signal.why}`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-[52px] rounded-[14px] bg-accent-brand text-white font-bold text-[15px] shadow-[0_8px_22px_rgba(232,116,59,0.28)] flex items-center justify-center"
        >
          Send to WhatsApp
        </a>
        <button className="w-[52px] h-[52px] rounded-[14px] border border-border-1 bg-surface-1 flex items-center justify-center text-[22px] text-text-muted">
          +
        </button>
      </div>

      <Disclaimer />

      <TabBar />
    </div>
  );
}
