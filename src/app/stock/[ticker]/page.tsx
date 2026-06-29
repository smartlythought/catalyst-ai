"use client";

import { use, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { callColor, formatPercent, formatMarketCap } from "@/lib/utils";
import { TabBar } from "@/components/tab-bar";
import { Disclaimer } from "@/components/disclaimer";
import { FinancialsChart } from "@/components/financials-chart";
import { useRealtimePrice } from "@/hooks/use-realtime-price";
import { USER_AI_ENABLED } from "@/lib/ai/config";

interface NewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: "positive" | "negative" | "neutral";
}

interface EcosystemEdge {
  targetTicker: string;
  relationship: string;
  description: string;
  tier?: string;
  category?: string;
}

const eventDotColors: Record<string, string> = {
  INSIDER: "var(--pos-green)",
  UPGRADE: "#53BDEB",
  DOWNGRADE: "var(--neg-red)",
  "8-K": "#53BDEB",
  OPTIONS: "#E8A838",
  EARNINGS: "var(--pos-green)",
  GUIDANCE: "var(--pos-green)",
  TECHNICAL: "var(--accent-brand)",
  NEWS: "var(--neutral-watch)",
};

const REL_COLORS: Record<string, { bg: string; text: string }> = {
  supplier: { bg: "rgba(59, 130, 246, 0.12)", text: "#3B82F6" },
  customer: { bg: "rgba(22, 199, 132, 0.12)", text: "var(--pos-green-bright)" },
  partner: { bg: "rgba(232, 116, 59, 0.12)", text: "var(--accent-brand)" },
  competitor: { bg: "rgba(234, 57, 67, 0.12)", text: "var(--neg-red-bright)" },
  investor: { bg: "rgba(168, 85, 247, 0.12)", text: "#A855F7" },
  subsidiary: { bg: "rgba(148, 163, 184, 0.12)", text: "var(--text-muted)" },
};

const TIER_COLORS: Record<string, string> = {
  S: "#E8743B",
  A: "#16C784",
  B: "#3B82F6",
  C: "var(--text-faint)",
};

interface StockData {
  symbol: string;
  quote: any;
  profile: any;
  analysts: any;
  priceTarget: { targetHigh: number; targetLow: number; targetMean: number; targetMedian: number } | null;
  prices: { date: string; close: number; volume: number }[];
  insiderTrades: any[];
  filings: any[];
}

export default function StockDeepDivePage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = use(params);
  const [data, setData] = useState<StockData | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("1M");
  const [onWatchlist, setOnWatchlist] = useState(false);
  const [crosshair, setCrosshair] = useState<{ idx: number; x: number; y: number } | null>(null);
  const [ecosystem, setEcosystem] = useState<EcosystemEdge[]>([]);
  const [ecoLoading, setEcoLoading] = useState(false);
  const [ecoLoaded, setEcoLoaded] = useState(false);
  const chartRef = useRef<SVGSVGElement>(null);
  const livePrice = useRealtimePrice(ticker.toUpperCase());

  useEffect(() => {
    fetch(`/api/stock/${ticker}?range=${range}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`/api/news/${ticker}?days=5`)
      .then((r) => r.json())
      .then((d) => setNews(d.news || []))
      .catch(() => {});
  }, [ticker, range]);

  // Auto-load ecosystem once per ticker — no manual button needed.
  useEffect(() => {
    let cancelled = false;
    setEcoLoaded(false);
    setEcosystem([]);
    setEcoLoading(true);
    fetch(`/api/ecosystem/${ticker}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setEcosystem(d.edges || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setEcoLoading(false);
          setEcoLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  async function toggleWatchlist() {
    const method = onWatchlist ? "DELETE" : "POST";
    setOnWatchlist(!onWatchlist);
    await fetch("/api/watchlist", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: ticker.toUpperCase() }),
    }).catch(() => setOnWatchlist(onWatchlist));
  }

  const basePrice = data?.quote?.price ?? 0;
  const price = livePrice?.price ?? basePrice;
  const change = livePrice ? price - (basePrice - (data?.quote?.change ?? 0)) : (data?.quote?.change ?? 0);
  const changePercent = basePrice > 0 && livePrice ? (change / (basePrice - (data?.quote?.change ?? 0))) * 100 : (data?.quote?.changePercent ?? 0);
  const company = data?.profile?.name ?? ticker.toUpperCase();
  const exchange = data?.profile?.exchange ?? "NASDAQ";
  const changeColor =
    changePercent >= 0 ? "var(--pos-green-bright)" : "var(--neg-red-bright)";
  const color = changePercent >= 0 ? "var(--pos-green)" : "var(--neg-red)";

  const chartData = (data?.prices || []).slice().reverse();
  const chartW = 340;
  const chartH = 160;
  const chartMin = chartData.length
    ? Math.min(...chartData.map((d) => d.close))
    : 0;
  const chartMax = chartData.length
    ? Math.max(...chartData.map((d) => d.close))
    : 1;
  const chartRange = chartMax - chartMin || 1;

  const chartPad = { top: 10, bottom: 10, left: 48, right: 8 };
  const plotW = chartW - chartPad.left - chartPad.right;
  const plotH = chartH - chartPad.top - chartPad.bottom;

  const chartPointsArr = chartData.map((d, i) => {
    const x = chartPad.left + (i / Math.max(chartData.length - 1, 1)) * plotW;
    const y = chartPad.top + plotH - ((d.close - chartMin) / chartRange) * plotH;
    return { x, y };
  });

  const chartPoints = chartPointsArr.map((p) => `${p.x},${p.y}`).join(" ");

  const areaPoints =
    chartData.length > 0
      ? `${chartPad.left},${chartH - chartPad.bottom} ${chartPoints} ${chartPad.left + plotW},${chartH - chartPad.bottom}`
      : "";

  // Grid lines at 25%, 50%, 75%
  const gridLines = [0.25, 0.5, 0.75].map((pct) => {
    const val = chartMin + chartRange * (1 - pct);
    const y = chartPad.top + plotH * pct;
    return { y, val };
  });

  const handleChartInteraction = (clientX: number) => {
    if (!chartRef.current || chartData.length < 2) return;
    const rect = chartRef.current.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * chartW;
    const plotX = svgX - chartPad.left;
    const ratio = Math.max(0, Math.min(1, plotX / plotW));
    const idx = Math.round(ratio * (chartData.length - 1));
    const pt = chartPointsArr[idx];
    if (pt) setCrosshair({ idx, x: pt.x, y: pt.y });
  };

  const clearCrosshair = () => setCrosshair(null);

  const events = [
    ...(data?.insiderTrades || []).slice(0, 3).map((t: any) => ({
      date: t.filingDate,
      type: "INSIDER",
      title: `${t.filerRole || "Insider"} ${t.filerName} ${t.transactionType === "P" ? "buys" : "sells"}`,
      detail: `${t.shares?.toLocaleString()} shares at $${t.pricePerShare?.toFixed(2)}`,
      sentiment: t.transactionType === "P" ? "positive" : "negative",
    })),
    ...(data?.filings || []).slice(0, 3).map((f: any) => ({
      date: f.filingDate,
      type: "8-K",
      title: f.description || "8-K Filing",
      detail: `Filed ${f.filingDate}`,
      sentiment: "neutral",
    })),
  ].sort((a, b) => (b.date > a.date ? 1 : -1));

  const insiders = (data?.insiderTrades || []).slice(0, 5).map((t: any) => ({
    name: t.filerName,
    role: t.filerRole || "Insider",
    date: t.filingDate || t.transactionDate,
    action: t.transactionType === "P" ? "BUY" : "SELL",
    amount: t.totalValue || t.shares * (t.pricePerShare || 0),
  }));

  const analysts = data?.analysts;
  const buyCount = analysts ? analysts.buy + analysts.strongBuy : 0;
  const holdCount = analysts?.hold ?? 0;
  const sellCount = analysts ? analysts.sell + analysts.strongSell : 0;
  const analystTotal = buyCount + holdCount + sellCount || 1;

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
          <div className="flex items-center gap-3">
            <button
              onClick={toggleWatchlist}
              className={`text-[12px] font-medium px-3 py-1 rounded-full border ${
                onWatchlist
                  ? "bg-accent-brand/15 border-accent-brand/30 text-accent-brand"
                  : "bg-surface-2 border-border-1 text-text-muted"
              }`}
            >
              {onWatchlist ? "Watching" : "+ Watch"}
            </button>
            <span className="text-[12px] text-text-faint font-mono uppercase tracking-[1px]">
              {exchange}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[30px] font-extrabold leading-none">
              {ticker.toUpperCase()}
            </h1>
            <p className="text-[14px] text-text-muted mt-0.5">{company}</p>
          </div>
          {price > 0 && (
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                {livePrice && (
                  <span className="text-[8px] font-bold tracking-[0.5px] uppercase text-pos-green bg-pos-green/15 px-1.5 py-0.5 rounded animate-pulse">
                    Live
                  </span>
                )}
                <span className="font-mono text-[22px] font-bold">
                  ${price.toFixed(2)}
                </span>
              </div>
              <div
                className="font-mono text-[14px] font-medium"
                style={{ color: changeColor }}
              >
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)} ({formatPercent(changePercent)})
              </div>
            </div>
          )}
        </div>
        {/* Market session indicator */}
        {price > 0 && (() => {
          const now = new Date();
          const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
          const day = et.getDay();
          const h = et.getHours();
          const m = et.getMinutes();
          const t = h * 60 + m;
          const isWeekend = day === 0 || day === 6;
          const session = isWeekend ? "closed" : t < 570 ? "pre-market" : t < 960 ? "market-hours" : "after-hours";
          const sessionLabel = session === "pre-market" ? "Pre-Market" : session === "after-hours" ? "After Hours" : session === "closed" ? "Market Closed" : "Market Open";
          const sessionColor = session === "market-hours" ? "var(--pos-green)" : session === "closed" ? "var(--text-faint)" : "#E8A838";
          return (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: sessionColor, boxShadow: session === "market-hours" ? "0 0 4px var(--pos-green)" : "none" }} />
              <span className="text-[11px] font-medium" style={{ color: sessionColor }}>{sessionLabel}</span>
              <span className="text-[11px] text-text-faint ml-1">
                {et.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" })} ET
              </span>
            </div>
          );
        })()}
      </header>

      {/* Price chart */}
      {chartData.length <= 1 && price > 0 && (
        <div className="px-5 mb-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4 text-center">
            <div className="text-[13px] text-text-muted mb-1">
              Chart data not yet available
            </div>
            <div className="text-[11px] text-text-faint">
              Historical pricing may be limited for newer IPOs or less-traded stocks
            </div>
          </div>
        </div>
      )}
      {chartData.length > 1 && (
        <div className="px-5 mb-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4">
            {/* Crosshair tooltip */}
            {crosshair && chartData[crosshair.idx] && (
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="font-mono text-[12px] text-text-muted">
                  {chartData[crosshair.idx].date}
                </span>
                <span className="font-mono text-[14px] font-bold" style={{ color }}>
                  ${chartData[crosshair.idx].close.toFixed(2)}
                </span>
              </div>
            )}
            <svg
              ref={chartRef}
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full touch-none"
              preserveAspectRatio="xMidYMid meet"
              onMouseMove={(e) => handleChartInteraction(e.clientX)}
              onMouseLeave={clearCrosshair}
              onTouchMove={(e) => {
                e.preventDefault();
                handleChartInteraction(e.touches[0].clientX);
              }}
              onTouchEnd={clearCrosshair}
            >
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Horizontal grid lines */}
              {gridLines.map((gl, i) => (
                <g key={i}>
                  <line
                    x1={chartPad.left}
                    y1={gl.y}
                    x2={chartPad.left + plotW}
                    y2={gl.y}
                    stroke="var(--border-hairline)"
                    strokeWidth="0.8"
                    strokeDasharray="4 3"
                  />
                  <text
                    x={chartPad.left - 6}
                    y={gl.y + 3}
                    textAnchor="end"
                    fill="var(--text-faint)"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    ${gl.val.toFixed(gl.val >= 100 ? 0 : 2)}
                  </text>
                </g>
              ))}

              {/* Y-axis labels: min and max */}
              <text
                x={chartPad.left - 6}
                y={chartPad.top + 3}
                textAnchor="end"
                fill="var(--text-faint)"
                fontSize="8"
                fontFamily="monospace"
              >
                ${chartMax.toFixed(chartMax >= 100 ? 0 : 2)}
              </text>
              <text
                x={chartPad.left - 6}
                y={chartH - chartPad.bottom + 3}
                textAnchor="end"
                fill="var(--text-faint)"
                fontSize="8"
                fontFamily="monospace"
              >
                ${chartMin.toFixed(chartMin >= 100 ? 0 : 2)}
              </text>

              {/* Area fill */}
              <polygon points={areaPoints} fill="url(#areaGrad)" />

              {/* Price line */}
              <polyline
                points={chartPoints}
                stroke={color}
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Current price dot at end of line */}
              {chartPointsArr.length > 0 && (
                <>
                  <circle
                    cx={chartPointsArr[chartPointsArr.length - 1].x}
                    cy={chartPointsArr[chartPointsArr.length - 1].y}
                    r="4"
                    fill={color}
                    opacity="0.25"
                  />
                  <circle
                    cx={chartPointsArr[chartPointsArr.length - 1].x}
                    cy={chartPointsArr[chartPointsArr.length - 1].y}
                    r="2.5"
                    fill={color}
                  />
                </>
              )}

              {/* Crosshair */}
              {crosshair && (
                <>
                  <line
                    x1={crosshair.x}
                    y1={chartPad.top}
                    x2={crosshair.x}
                    y2={chartH - chartPad.bottom}
                    stroke="var(--text-faint)"
                    strokeWidth="0.8"
                    strokeDasharray="3 2"
                  />
                  <line
                    x1={chartPad.left}
                    y1={crosshair.y}
                    x2={chartPad.left + plotW}
                    y2={crosshair.y}
                    stroke="var(--text-faint)"
                    strokeWidth="0.8"
                    strokeDasharray="3 2"
                  />
                  <circle
                    cx={crosshair.x}
                    cy={crosshair.y}
                    r="4"
                    fill="var(--bg-app)"
                    stroke={color}
                    strokeWidth="2"
                  />
                </>
              )}
            </svg>
            <div className="flex items-center gap-2 mt-3">
              {["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y"].map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`font-mono text-[11px] font-medium px-3 py-1 rounded-md ${
                    range === r
                      ? "bg-accent-brand/15 text-accent-brand"
                      : "text-text-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Key stats */}
      {data?.profile && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            Key stats
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: "Mkt cap",
                value: data.profile.marketCap
                  ? formatMarketCap(data.profile.marketCap)
                  : "—",
              },
              {
                label: "P/E",
                value: data.profile.pe ? data.profile.pe.toFixed(1) : "—",
              },
              {
                label: "52-wk range",
                value:
                  data.profile.week52Low && data.profile.week52High
                    ? `$${data.profile.week52Low.toFixed(0)} – $${data.profile.week52High.toFixed(0)}`
                    : "—",
              },
              {
                label: "Avg volume",
                value: data.profile.avgVolume
                  ? `${(data.profile.avgVolume / 1e6).toFixed(1)}M`
                  : "—",
              },
              {
                label: "Open",
                value: data.quote?.open ? `$${data.quote.open.toFixed(2)}` : "—",
              },
              {
                label: "Day range",
                value:
                  data.quote?.low && data.quote?.high
                    ? `$${data.quote.low.toFixed(2)} – $${data.quote.high.toFixed(2)}`
                    : "—",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-surface-1 border border-border-1 rounded-[14px] p-3"
              >
                <div className="text-[11px] text-text-muted mb-1">
                  {stat.label}
                </div>
                <div className="font-mono text-[15px] font-semibold">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analyst price target gauge */}
      {data?.priceTarget && data.priceTarget.targetMean > 0 && price > 0 && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            Analyst price target
          </h2>
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[11px] text-text-muted">Low</div>
                <div className="font-mono text-[14px] font-semibold text-neg-red">
                  ${data.priceTarget.targetLow.toFixed(0)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[11px] text-text-muted">Average</div>
                <div className="font-mono text-[20px] font-bold text-accent-brand">
                  ${data.priceTarget.targetMean.toFixed(0)}
                </div>
                <div className="text-[11px] font-mono" style={{ color: data.priceTarget.targetMean > price ? "var(--pos-green-bright)" : "var(--neg-red-bright)" }}>
                  {data.priceTarget.targetMean > price ? "+" : ""}
                  {(((data.priceTarget.targetMean - price) / price) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-text-muted">High</div>
                <div className="font-mono text-[14px] font-semibold text-pos-green">
                  ${data.priceTarget.targetHigh.toFixed(0)}
                </div>
              </div>
            </div>
            {/* Visual gauge bar */}
            {(() => {
              const low = data.priceTarget.targetLow;
              const high = data.priceTarget.targetHigh;
              const gaugeRange = high - low || 1;
              const currentPct = Math.max(0, Math.min(100, ((price - low) / gaugeRange) * 100));
              const meanPct = Math.max(0, Math.min(100, ((data.priceTarget.targetMean - low) / gaugeRange) * 100));
              return (
                <div className="relative h-[8px] rounded-full bg-surface-2 overflow-visible">
                  <div
                    className="absolute h-full rounded-full"
                    style={{
                      width: `${meanPct}%`,
                      background: "linear-gradient(90deg, var(--neg-red), var(--neutral-watch), var(--pos-green))",
                      opacity: 0.3,
                    }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-[12px] h-[12px] rounded-full bg-accent-brand border-2 border-bg-app"
                    style={{ left: `calc(${currentPct}% - 6px)` }}
                    title={`Current: $${price.toFixed(2)}`}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-[3px] h-[14px] rounded bg-text-muted"
                    style={{ left: `calc(${meanPct}% - 1.5px)` }}
                    title={`Target: $${data.priceTarget.targetMean.toFixed(0)}`}
                  />
                </div>
              );
            })()}
            <div className="flex justify-between mt-2">
              <span className="text-[9px] text-text-faint font-mono">Current: ${price.toFixed(0)}</span>
              <span className="text-[9px] text-text-faint font-mono">Target: ${data.priceTarget.targetMean.toFixed(0)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Catalyst timeline */}
      {events.length > 0 && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            Catalyst timeline
          </h2>
          <div className="flex flex-col">
            {events.map((event, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className="w-[8px] h-[8px] rounded-full mt-1.5"
                    style={{
                      backgroundColor:
                        eventDotColors[event.type] || "var(--neutral-watch)",
                    }}
                  />
                  {i < events.length - 1 && (
                    <div className="w-px flex-1 bg-border-hairline mt-1" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-[10px] text-text-faint">
                      {event.date}
                    </span>
                    <span className="font-mono text-[9px] font-medium tracking-[0.5px] uppercase text-text-faint px-1.5 py-0.5 rounded bg-chip-bg border border-chip-border">
                      {event.type}
                    </span>
                  </div>
                  <div className="text-[14px] font-semibold">{event.title}</div>
                  <div className="text-[13px] text-text-muted mt-0.5">
                    {event.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stakeholder movements */}
      {insiders.length > 0 && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            Stakeholder movements
          </h2>
          <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
            {insiders.map((insider: any, i: number) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  i < insiders.length - 1
                    ? "border-b border-border-hairline"
                    : ""
                }`}
              >
                <div className="w-[36px] h-[36px] rounded-full bg-surface-2 border border-border-1 flex items-center justify-center text-[13px] font-bold text-text-muted">
                  {insider.name
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")}
                </div>
                <div className="flex-1">
                  <div className="text-[14px] font-semibold">{insider.name}</div>
                  <div className="text-[12px] text-text-muted">
                    {insider.role} &middot; {insider.date}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="font-mono text-[13px] font-bold"
                    style={{
                      color:
                        insider.action === "BUY"
                          ? "var(--pos-green)"
                          : "var(--neg-red)",
                    }}
                  >
                    {insider.action}
                  </div>
                  {insider.amount > 0 && (
                    <div className="font-mono text-[12px] text-text-secondary">
                      ${insider.amount >= 1e6
                        ? `${(insider.amount / 1e6).toFixed(1)}M`
                        : `${(insider.amount / 1e3).toFixed(0)}K`}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analyst consensus */}
      {analysts && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            Analyst consensus
          </h2>
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4">
            <div className="flex h-[8px] rounded-full overflow-hidden mb-3">
              <div
                className="bg-pos-green"
                style={{
                  width: `${(buyCount / analystTotal) * 100}%`,
                }}
              />
              <div
                className="bg-neutral-watch"
                style={{
                  width: `${(holdCount / analystTotal) * 100}%`,
                }}
              />
              <div
                className="bg-neg-red"
                style={{
                  width: `${(sellCount / analystTotal) * 100}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-center">
                <div className="font-mono text-[16px] font-bold text-pos-green">
                  {buyCount}
                </div>
                <div className="text-[10px] text-text-muted">Buy</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[16px] font-bold text-neutral-watch">
                  {holdCount}
                </div>
                <div className="text-[10px] text-text-muted">Hold</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[16px] font-bold text-neg-red">
                  {sellCount}
                </div>
                <div className="text-[10px] text-text-muted">Sell</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5-Year Financials */}
      <FinancialsChart ticker={ticker.toUpperCase()} />

      {/* Volume chart */}
      {chartData.length > 1 && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            Volume
          </h2>
          <div className="bg-surface-1 border border-border-1 rounded-[14px] p-3">
            <svg viewBox={`0 0 ${chartW} 50`} className="w-full" preserveAspectRatio="xMidYMid meet">
              {(() => {
                const volumes = chartData.map((d) => d.volume || 0);
                const maxVol = Math.max(...volumes) || 1;
                const barW = Math.max(1, plotW / volumes.length - 1);
                return volumes.map((v, i) => {
                  const x = chartPad.left + (i / Math.max(volumes.length - 1, 1)) * plotW - barW / 2;
                  const h = (v / maxVol) * 36;
                  return (
                    <rect
                      key={i}
                      x={x}
                      y={44 - h}
                      width={barW}
                      height={h}
                      rx="1"
                      fill={color}
                      opacity={crosshair?.idx === i ? 0.8 : 0.3}
                    />
                  );
                });
              })()}
            </svg>
          </div>
        </div>
      )}

      {/* Ecosystem */}
      <div className="px-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px]">
            Ecosystem
          </h2>
          <Link
            href={`/ecosystem/${ticker.toUpperCase()}`}
            className="text-[11px] text-accent-brand font-medium"
          >
            Full map &rsaquo;
          </Link>
        </div>
        {ecoLoading && (
          <div className="bg-surface-1 border border-border-1 rounded-[14px] p-6 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-[13px] text-text-muted">Analyzing ecosystem...</span>
          </div>
        )}
        {ecoLoaded && ecosystem.length > 0 && (
          <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
            {ecosystem.slice(0, 6).map((edge, i) => {
              const relStyle = REL_COLORS[edge.relationship] || REL_COLORS.partner;
              const tierColor = TIER_COLORS[edge.tier || "C"] || TIER_COLORS.C;
              return (
                <Link
                  key={edge.targetTicker}
                  href={`/stock/${edge.targetTicker}`}
                  className={`flex items-center gap-3 px-4 py-3 ${i < Math.min(ecosystem.length, 6) - 1 ? "border-b border-border-hairline" : ""}`}
                >
                  <div className="w-[36px] h-[36px] rounded-[10px] bg-surface-2 border border-border-1 flex items-center justify-center font-mono text-[11px] font-bold text-text-muted">
                    {edge.targetTicker}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="font-mono text-[9px] font-medium tracking-[0.5px] uppercase px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: relStyle.bg, color: relStyle.text }}
                      >
                        {edge.relationship}
                      </span>
                      {edge.tier && (
                        <span
                          className="font-mono text-[9px] font-bold"
                          style={{ color: tierColor }}
                        >
                          {edge.tier}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-text-muted truncate">{edge.description}</p>
                  </div>
                  <span className="text-[14px] text-text-faint shrink-0">&rsaquo;</span>
                </Link>
              );
            })}
          </div>
        )}
        {ecoLoaded && ecosystem.length === 0 && (
          <div className="bg-surface-1 border border-border-1 rounded-[14px] p-4 text-center text-[13px] text-text-muted">
            No ecosystem data available
          </div>
        )}
      </div>

      {/* News feed */}
      {news.length > 0 && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            Latest news
          </h2>
          <div className="flex flex-col gap-2">
            {news.slice(0, 6).map((item, i) => (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-surface-1 border border-border-1 rounded-[14px] p-3.5 block"
              >
                <div className="flex items-start gap-2 mb-1">
                  <span
                    className="w-[6px] h-[6px] rounded-full mt-1.5 flex-shrink-0"
                    style={{
                      backgroundColor:
                        item.sentiment === "positive"
                          ? "var(--pos-green)"
                          : item.sentiment === "negative"
                            ? "var(--neg-red)"
                            : "var(--neutral-watch)",
                    }}
                  />
                  <span className="text-[14px] font-semibold leading-tight line-clamp-2">
                    {item.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-[14px]">
                  <span className="text-[11px] text-text-faint">
                    {item.source}
                  </span>
                  <span className="text-[11px] text-text-faint">
                    {new Date(item.publishedAt).toLocaleDateString()}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-5 mb-5 flex gap-2">
        {USER_AI_ENABLED && (
          <Link
            href={`/chat?ticker=${ticker.toUpperCase()}`}
            className="flex-1 h-[48px] rounded-[14px] bg-accent-brand text-white font-bold text-[14px] flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path
                d="M4 4H16V13H8L4 16V4Z"
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            Ask AI
          </Link>
        )}
        <Link
          href={`/ecosystem/${ticker.toUpperCase()}`}
          className="h-[48px] px-4 rounded-[14px] border border-border-1 bg-surface-1 font-bold text-[13px] text-text-secondary flex items-center justify-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="4" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="16" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 6.5V10M10 10L5 13.5M10 10L15 13.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          Ecosystem
        </Link>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Check out ${ticker.toUpperCase()} at $${price.toFixed(2)} on Catalyst`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="h-[48px] px-4 rounded-[14px] border border-border-1 bg-surface-1 font-bold text-[13px] text-text-secondary flex items-center justify-center"
        >
          Share
        </a>
      </div>

      <Disclaimer />

      {/* Empty state */}
      {!data?.quote && !loading && (
        <div className="px-5 py-12 text-center">
          <p className="text-text-muted text-[14px]">
            No market data available for {ticker.toUpperCase()}.
          </p>
          <p className="text-text-faint text-[12px] mt-1">
            Data populates after the daily ingestion runs.
          </p>
        </div>
      )}

      <TabBar />
    </div>
  );
}
