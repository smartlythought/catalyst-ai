"use client";

import { useState, useEffect } from "react";

interface AnnualFinancial {
  year: number;
  revenue: number;
  netIncome: number;
  eps: number;
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  freeCashFlow: number;
  revenueGrowth: number | null;
}

type MetricKey = "revenue" | "netIncome" | "eps" | "freeCashFlow" | "margins";

const METRIC_TABS: { key: MetricKey; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "netIncome", label: "Net Income" },
  { key: "eps", label: "EPS" },
  { key: "freeCashFlow", label: "FCF" },
  { key: "margins", label: "Margins" },
];

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(0) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toFixed(2);
}

export function FinancialsChart({ ticker }: { ticker: string }) {
  const [financials, setFinancials] = useState<AnnualFinancial[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (loaded) return;
    setLoading(true);
    fetch(`/api/stock/${ticker}/financials`)
      .then((r) => {
        if (!r.ok) throw new Error("No data");
        return r.json();
      })
      .then((d) => setFinancials(d.financials || []))
      .catch((e) => setError(e.message))
      .finally(() => {
        setLoading(false);
        setLoaded(true);
      });
  }

  if (!loaded && !loading) {
    return (
      <div className="px-5 mb-5">
        <button
          onClick={load}
          className="w-full bg-surface-1 border border-border-1 rounded-[18px] p-4 text-center active:opacity-80 transition-opacity"
        >
          <div className="text-[14px] font-bold text-accent-brand mb-1">
            Load 5-Year Financials
          </div>
          <div className="text-[11px] text-text-faint">
            Revenue, EPS, margins, cash flow
          </div>
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-5 mb-5">
        <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 animate-pulse">
          <div className="h-4 w-32 bg-surface-2 rounded mb-4" />
          <div className="h-[160px] bg-surface-2 rounded-[10px]" />
        </div>
      </div>
    );
  }

  if (error || financials.length === 0) {
    return (
      <div className="px-5 mb-5">
        <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4 text-center">
          <div className="text-[13px] text-text-muted">
            Financial data unavailable
          </div>
        </div>
      </div>
    );
  }

  const W = 320;
  const H = 140;
  const PAD_L = 50;
  const PAD_R = 10;
  const PAD_T = 10;
  const PAD_B = 24;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  let bars: { year: number; value: number; label: string }[];
  let isMargins = false;

  if (metric === "margins") {
    isMargins = true;
    bars = financials.map((f) => ({
      year: f.year,
      value: f.grossMargin,
      label: f.grossMargin.toFixed(1) + "%",
    }));
  } else {
    bars = financials.map((f) => ({
      year: f.year,
      value: f[metric],
      label: metric === "eps" ? "$" + f.eps.toFixed(2) : "$" + formatCompact(f[metric]),
    }));
  }

  const maxVal = Math.max(...bars.map((b) => Math.abs(b.value)), 1);
  const barW = Math.min(chartW / bars.length - 6, 40);
  const gap = (chartW - barW * bars.length) / (bars.length + 1);

  const marginLines = isMargins
    ? financials.map((f, i) => ({
        x: PAD_L + gap * (i + 1) + barW * i + barW / 2,
        grossY: PAD_T + chartH * (1 - f.grossMargin / maxVal),
        opY: PAD_T + chartH * (1 - Math.max(f.operatingMargin, 0) / maxVal),
        netY: PAD_T + chartH * (1 - Math.max(f.netMargin, 0) / maxVal),
      }))
    : [];

  return (
    <div className="px-5 mb-5">
      <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-2">
        Financials (Annual)
      </h2>

      <div className="flex gap-1 mb-3 overflow-x-auto no-scrollbar">
        {METRIC_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setMetric(t.key)}
            className={`font-mono text-[10px] font-medium px-2.5 py-1 rounded-[6px] whitespace-nowrap ${
              metric === t.key
                ? "bg-accent-brand/15 text-accent-brand"
                : "text-text-muted bg-surface-2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 280 }}>
          {/* Y axis labels */}
          {[0, 0.5, 1].map((frac) => {
            const val = maxVal * (1 - frac);
            const y = PAD_T + chartH * frac;
            return (
              <g key={frac}>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={y}
                  y2={y}
                  stroke="var(--border-hairline)"
                  strokeDasharray="3,3"
                />
                <text
                  x={PAD_L - 4}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--text-faint)"
                  fontSize="8"
                  fontFamily="monospace"
                >
                  {isMargins ? val.toFixed(0) + "%" : "$" + formatCompact(val)}
                </text>
              </g>
            );
          })}

          {/* Zero line if there are negatives */}
          {bars.some((b) => b.value < 0) && (
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={PAD_T + chartH}
              y2={PAD_T + chartH}
              stroke="var(--text-faint)"
              strokeWidth="0.5"
            />
          )}

          {!isMargins &&
            bars.map((b, i) => {
              const x = PAD_L + gap * (i + 1) + barW * i;
              const barH = (Math.abs(b.value) / maxVal) * chartH;
              const y = b.value >= 0 ? PAD_T + chartH - barH : PAD_T + chartH;
              const isNeg = b.value < 0;
              const prevVal = i > 0 ? bars[i - 1].value : null;
              const growing = prevVal !== null && b.value > prevVal;

              return (
                <g key={b.year}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(barH, 2)}
                    rx={3}
                    fill={
                      isNeg
                        ? "var(--neg-red)"
                        : growing
                          ? "var(--pos-green)"
                          : "var(--accent-brand)"
                    }
                    opacity={0.85}
                  />
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fill="var(--text-secondary)"
                    fontSize="7"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {b.label}
                  </text>
                  <text
                    x={x + barW / 2}
                    y={H - 4}
                    textAnchor="middle"
                    fill="var(--text-faint)"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {b.year}
                  </text>
                </g>
              );
            })}

          {/* Margins: line chart overlay */}
          {isMargins && marginLines.length > 1 && (
            <>
              {/* Gross margin bars */}
              {bars.map((b, i) => {
                const x = PAD_L + gap * (i + 1) + barW * i;
                const barH = (b.value / maxVal) * chartH;
                return (
                  <g key={b.year}>
                    <rect
                      x={x}
                      y={PAD_T + chartH - barH}
                      width={barW}
                      height={barH}
                      rx={3}
                      fill="var(--pos-green)"
                      opacity={0.3}
                    />
                    <text
                      x={x + barW / 2}
                      y={H - 4}
                      textAnchor="middle"
                      fill="var(--text-faint)"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      {b.year}
                    </text>
                  </g>
                );
              })}
              {/* Operating margin line */}
              <polyline
                points={marginLines.map((m) => `${m.x},${m.opY}`).join(" ")}
                fill="none"
                stroke="#3B82F6"
                strokeWidth="1.5"
              />
              {/* Net margin line */}
              <polyline
                points={marginLines.map((m) => `${m.x},${m.netY}`).join(" ")}
                fill="none"
                stroke="var(--accent-brand)"
                strokeWidth="1.5"
              />
              {/* Legend */}
              <circle cx={PAD_L + 4} cy={PAD_T + 2} r={3} fill="var(--pos-green)" opacity={0.5} />
              <text x={PAD_L + 10} y={PAD_T + 5} fontSize="7" fill="var(--text-faint)" fontFamily="monospace">Gross</text>
              <circle cx={PAD_L + 42} cy={PAD_T + 2} r={3} fill="#3B82F6" />
              <text x={PAD_L + 48} y={PAD_T + 5} fontSize="7" fill="var(--text-faint)" fontFamily="monospace">Op</text>
              <circle cx={PAD_L + 66} cy={PAD_T + 2} r={3} fill="var(--accent-brand)" />
              <text x={PAD_L + 72} y={PAD_T + 5} fontSize="7" fill="var(--text-faint)" fontFamily="monospace">Net</text>
            </>
          )}
        </svg>

        {/* Summary row */}
        {metric === "revenue" && financials.length >= 2 && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-hairline">
            <span className="text-[10px] text-text-faint font-mono">
              {financials[0].year}–{financials[financials.length - 1].year}
            </span>
            {financials[financials.length - 1].revenueGrowth !== null && (
              <span
                className="text-[11px] font-mono font-bold"
                style={{
                  color:
                    financials[financials.length - 1].revenueGrowth! >= 0
                      ? "var(--pos-green-bright)"
                      : "var(--neg-red-bright)",
                }}
              >
                {financials[financials.length - 1].revenueGrowth! >= 0 ? "+" : ""}
                {financials[financials.length - 1].revenueGrowth!.toFixed(1)}% YoY
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
