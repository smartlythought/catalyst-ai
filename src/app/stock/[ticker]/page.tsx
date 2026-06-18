"use client";

import { use } from "react";
import Link from "next/link";
import { MOCK_SIGNALS } from "@/lib/mock-data";
import { callColor, formatPercent, formatMarketCap } from "@/lib/utils";
import { TabBar } from "@/components/tab-bar";

const mockChartData = Array.from({ length: 30 }, (_, i) => ({
  date: `Jun ${i + 1}`,
  price: 165 + Math.random() * 12,
}));

const mockStats = {
  marketCap: 2.12e12,
  pe: 64.3,
  week52Range: "$118.50 – $195.95",
  avgVolume: "42.8M",
};

const mockEvents = [
  {
    date: "Jun 15",
    type: "INSIDER",
    title: "Director buys $2.4M in shares",
    detail: "Mark Stevens purchased 14,000 shares at $171.50 avg",
    sentiment: "positive" as const,
  },
  {
    date: "Jun 12",
    type: "UPGRADE",
    title: "KeyBanc upgrades to Overweight",
    detail: "Price target raised from $180 → $220",
    sentiment: "positive" as const,
  },
  {
    date: "Jun 10",
    type: "OPTIONS",
    title: "$12M in June 200C sweeps",
    detail: "Block trades across multiple exchanges",
    sentiment: "positive" as const,
  },
  {
    date: "Jun 5",
    type: "8-K",
    title: "Blackwell production update",
    detail: "Filed 8-K confirming expanded capacity",
    sentiment: "positive" as const,
  },
  {
    date: "May 28",
    type: "EARNINGS",
    title: "Q1 FY25 beat",
    detail: "Revenue $26B vs $24.7B expected, +262% YoY",
    sentiment: "positive" as const,
  },
];

const mockInsiders = [
  { name: "Mark Stevens", role: "Director", date: "Jun 15", action: "BUY" as const, amount: 2400000 },
  { name: "Tench Coxe", role: "Director", date: "May 22", action: "BUY" as const, amount: 1800000 },
  { name: "Colette Kress", role: "CFO", date: "Apr 10", action: "SELL" as const, amount: 5200000 },
];

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
  UPCOMING: "var(--accent-brand)",
};

export default function StockDeepDivePage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = use(params);
  const signal = MOCK_SIGNALS.find(
    (s) => s.ticker.toLowerCase() === ticker.toLowerCase()
  );

  const price = signal?.price ?? 172.35;
  const change = signal?.change ?? 4.82;
  const changePercent = signal?.changePercent ?? 2.88;
  const company = signal?.company ?? ticker;
  const exchange = signal?.exchange ?? "NASDAQ";
  const color = signal ? callColor(signal.call) : "var(--pos-green)";
  const changeColor = changePercent >= 0 ? "var(--pos-green-bright)" : "var(--neg-red-bright)";

  const chartMin = Math.min(...mockChartData.map((d) => d.price));
  const chartMax = Math.max(...mockChartData.map((d) => d.price));
  const chartRange = chartMax - chartMin || 1;
  const chartW = 340;
  const chartH = 160;

  const chartPoints = mockChartData
    .map((d, i) => {
      const x = (i / (mockChartData.length - 1)) * chartW;
      const y = chartH - ((d.price - chartMin) / chartRange) * (chartH - 20) - 10;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${chartH} ${chartPoints} ${chartW},${chartH}`;

  return (
    <div className="min-h-dvh pb-24">
      {/* Header */}
      <header className="safe-top px-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <Link
            href={signal ? `/signal/${signal.id}` : "/"}
            className="text-[14px] text-accent-brand font-medium flex items-center gap-1"
          >
            <span className="text-[18px]">&lsaquo;</span> Call
          </Link>
          <span className="text-[12px] text-text-faint font-mono uppercase tracking-[1px]">
            {exchange}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[30px] font-extrabold leading-none">{ticker}</h1>
            <p className="text-[14px] text-text-muted mt-0.5">{company}</p>
          </div>
          <div className="text-right">
            <div className="font-mono text-[22px] font-bold">${price.toFixed(2)}</div>
            <div className="font-mono text-[14px] font-medium" style={{ color: changeColor }}>
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)} ({formatPercent(changePercent)})
            </div>
          </div>
        </div>
      </header>

      {/* Price chart */}
      <div className="px-5 mb-5">
        <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4">
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={areaPoints} fill="url(#areaGrad)" />
            <polyline
              points={chartPoints}
              stroke={color}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            {/* Reference lines (BUY only) */}
            {signal?.entry && signal?.target && signal?.stop && (
              <>
                {[
                  { val: signal.target, color: "var(--pos-green)", label: "Target" },
                  { val: signal.entry, color: "var(--text-muted)", label: "Entry" },
                  { val: signal.stop, color: "var(--neg-red)", label: "Stop" },
                ].map((ref) => {
                  const y =
                    chartH - ((ref.val - chartMin) / chartRange) * (chartH - 20) - 10;
                  return (
                    <g key={ref.label}>
                      <line
                        x1="0"
                        y1={y}
                        x2={chartW}
                        y2={y}
                        stroke={ref.color}
                        strokeWidth="1"
                        strokeDasharray="4 3"
                        opacity="0.6"
                      />
                      <text
                        x={chartW - 2}
                        y={y - 4}
                        fill={ref.color}
                        fontSize="9"
                        textAnchor="end"
                        fontFamily="IBM Plex Mono"
                      >
                        {ref.label} ${ref.val}
                      </text>
                    </g>
                  );
                })}
              </>
            )}
          </svg>

          {/* Range chips */}
          <div className="flex items-center gap-2 mt-3">
            {["1W", "1M", "3M", "1Y"].map((range) => (
              <button
                key={range}
                className={`font-mono text-[11px] font-medium px-3 py-1 rounded-md ${
                  range === "1M"
                    ? "bg-accent-brand/15 text-accent-brand"
                    : "text-text-muted"
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Key stats */}
      <div className="px-5 mb-5">
        <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
          Key stats
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Mkt cap", value: formatMarketCap(mockStats.marketCap) },
            { label: "P/E", value: mockStats.pe.toFixed(1) },
            { label: "52-wk range", value: mockStats.week52Range },
            { label: "Avg volume", value: mockStats.avgVolume },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-surface-1 border border-border-1 rounded-[14px] p-3"
            >
              <div className="text-[11px] text-text-muted mb-1">{stat.label}</div>
              <div className="font-mono text-[15px] font-semibold">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Catalyst timeline */}
      <div className="px-5 mb-5">
        <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
          Catalyst timeline
        </h2>
        <div className="flex flex-col">
          {mockEvents.map((event, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className="w-[8px] h-[8px] rounded-full mt-1.5"
                  style={{
                    backgroundColor:
                      eventDotColors[event.type] || "var(--neutral-watch)",
                  }}
                />
                {i < mockEvents.length - 1 && (
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

      {/* Stakeholder movements */}
      <div className="px-5 mb-5">
        <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
          Stakeholder movements
        </h2>
        <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
          {mockInsiders.map((insider, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3.5 ${
                i < mockInsiders.length - 1
                  ? "border-b border-border-hairline"
                  : ""
              }`}
            >
              <div className="w-[36px] h-[36px] rounded-full bg-surface-2 border border-border-1 flex items-center justify-center text-[13px] font-bold text-text-muted">
                {insider.name
                  .split(" ")
                  .map((n) => n[0])
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
                <div className="font-mono text-[12px] text-text-secondary">
                  ${(insider.amount / 1e6).toFixed(1)}M
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analyst consensus */}
      <div className="px-5 mb-5">
        <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
          Analyst consensus
        </h2>
        <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4">
          {/* Segmented bar */}
          <div className="flex h-[8px] rounded-full overflow-hidden mb-3">
            <div className="bg-pos-green" style={{ width: "68%" }} />
            <div className="bg-neutral-watch" style={{ width: "24%" }} />
            <div className="bg-neg-red" style={{ width: "8%" }} />
          </div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-center">
              <div className="font-mono text-[16px] font-bold text-pos-green">
                34
              </div>
              <div className="text-[10px] text-text-muted">Buy</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-[16px] font-bold text-neutral-watch">
                12
              </div>
              <div className="text-[10px] text-text-muted">Hold</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-[16px] font-bold text-neg-red">
                4
              </div>
              <div className="text-[10px] text-text-muted">Sell</div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border-hairline">
            <span className="text-[12px] text-text-muted">Avg price target</span>
            <span className="font-mono text-[16px] font-bold text-accent-brand">
              $205.00
            </span>
          </div>
        </div>
      </div>

      <TabBar />
    </div>
  );
}
