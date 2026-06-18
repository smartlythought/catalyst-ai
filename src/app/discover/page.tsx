"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TabBar } from "@/components/tab-bar";
import { Disclaimer } from "@/components/disclaimer";

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

interface SectorData {
  sector: string;
  change: number;
}

interface Earning {
  symbol: string;
  date: string;
  time: string;
  epsEstimate: number | null;
  revenueEstimate: number | null;
}

interface PulseData {
  callStats: {
    total: number;
    buy: number;
    reduce: number;
    watch: number;
    avgConviction: number;
    highConviction: number;
  };
  sectors: SectorData[];
  gainers: MarketItem[];
  losers: MarketItem[];
  mostActive: MarketItem[];
}

export default function DiscoverPage() {
  const [pulse, setPulse] = useState<PulseData | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [tab, setTab] = useState<"gainers" | "losers" | "active">("gainers");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/market/pulse").then((r) => r.json()),
      fetch("/api/market/earnings").then((r) => r.json()),
    ])
      .then(([p, e]) => {
        setPulse(p);
        setEarnings(e.earnings || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const movers =
    tab === "gainers"
      ? pulse?.gainers
      : tab === "losers"
        ? pulse?.losers
        : pulse?.mostActive;

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-4">
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
          Discover
        </h1>
        <p className="text-[13px] text-text-muted mt-1">
          Market overview and trends
        </p>
      </header>

      {/* AI Call Stats */}
      {pulse?.callStats && pulse.callStats.total > 0 && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            Catalyst AI Pulse
          </h2>
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-center">
                <div className="font-mono text-[20px] font-bold text-pos-green">
                  {pulse.callStats.buy}
                </div>
                <div className="text-[10px] text-text-muted">BUY</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[20px] font-bold text-neg-red">
                  {pulse.callStats.reduce}
                </div>
                <div className="text-[10px] text-text-muted">REDUCE</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[20px] font-bold text-neutral-watch">
                  {pulse.callStats.watch}
                </div>
                <div className="text-[10px] text-text-muted">WATCH</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[20px] font-bold text-accent-brand">
                  {pulse.callStats.avgConviction}%
                </div>
                <div className="text-[10px] text-text-muted">Avg Conv.</div>
              </div>
            </div>
            <div className="text-[11px] text-text-faint text-center">
              {pulse.callStats.highConviction} high-conviction calls active
            </div>
          </div>
        </div>
      )}

      {/* Sector Heatmap */}
      {pulse?.sectors && pulse.sectors.length > 0 && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            Sector Performance
          </h2>
          <div className="grid grid-cols-3 gap-1.5">
            {pulse.sectors.map((s) => (
              <div
                key={s.sector}
                className="rounded-[10px] p-2.5 text-center"
                style={{
                  backgroundColor:
                    s.change >= 1
                      ? "rgba(22, 199, 132, 0.15)"
                      : s.change >= 0
                        ? "rgba(22, 199, 132, 0.07)"
                        : s.change >= -1
                          ? "rgba(234, 57, 67, 0.07)"
                          : "rgba(234, 57, 67, 0.15)",
                  border: `1px solid ${
                    s.change >= 0
                      ? "rgba(22, 199, 132, 0.2)"
                      : "rgba(234, 57, 67, 0.2)"
                  }`,
                }}
              >
                <div className="text-[10px] text-text-muted truncate mb-0.5">
                  {s.sector.replace("_", " ")}
                </div>
                <div
                  className="font-mono text-[13px] font-bold"
                  style={{
                    color:
                      s.change >= 0
                        ? "var(--pos-green-bright)"
                        : "var(--neg-red-bright)",
                  }}
                >
                  {s.change >= 0 ? "+" : ""}
                  {s.change.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Market Movers */}
      <div className="px-5 mb-5">
        <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
          Market Movers
        </h2>
        <div className="flex gap-1 mb-3">
          {(
            [
              { key: "gainers", label: "Gainers" },
              { key: "losers", label: "Losers" },
              { key: "active", label: "Most Active" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`font-mono text-[11px] font-medium px-3 py-1.5 rounded-[8px] ${
                tab === t.key
                  ? "bg-accent-brand/15 text-accent-brand"
                  : "text-text-muted bg-surface-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
          {(movers || []).map((item, i) => (
            <Link
              key={item.symbol}
              href={`/stock/${item.symbol}`}
              className={`flex items-center gap-3 px-4 py-3 ${
                i < (movers?.length || 0) - 1
                  ? "border-b border-border-hairline"
                  : ""
              }`}
            >
              <div className="w-[36px] h-[36px] rounded-full bg-surface-2 border border-border-1 flex items-center justify-center font-mono text-[11px] font-bold text-text-muted">
                {item.symbol.slice(0, 4)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[14px] font-bold">
                  {item.symbol}
                </div>
                <div className="text-[11px] text-text-muted truncate">
                  {item.name}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[14px] font-bold">
                  ${item.price.toFixed(2)}
                </div>
                <div
                  className="font-mono text-[12px] font-medium"
                  style={{
                    color:
                      item.changePercent >= 0
                        ? "var(--pos-green-bright)"
                        : "var(--neg-red-bright)",
                  }}
                >
                  {item.changePercent >= 0 ? "+" : ""}
                  {item.changePercent.toFixed(2)}%
                </div>
              </div>
            </Link>
          ))}
          {(!movers || movers.length === 0) && (
            <div className="py-8 text-center text-text-muted text-[13px]">
              Market data loading...
            </div>
          )}
        </div>
      </div>

      {/* Earnings Calendar */}
      {earnings.length > 0 && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            Upcoming Earnings
          </h2>
          <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
            {earnings.slice(0, 10).map((e, i) => (
              <Link
                key={`${e.symbol}-${e.date}`}
                href={`/stock/${e.symbol}`}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i < Math.min(earnings.length, 10) - 1
                    ? "border-b border-border-hairline"
                    : ""
                }`}
              >
                <div className="w-[36px] h-[36px] rounded-[10px] bg-surface-2 border border-border-1 flex flex-col items-center justify-center">
                  <div className="text-[9px] text-text-faint font-mono leading-none">
                    {new Date(e.date + "T00:00:00").toLocaleDateString("en", {
                      month: "short",
                    })}
                  </div>
                  <div className="text-[14px] font-bold leading-none">
                    {new Date(e.date + "T00:00:00").getDate()}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="font-mono text-[14px] font-bold">
                    {e.symbol}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {e.time === "bmo"
                      ? "Before market open"
                      : e.time === "amc"
                        ? "After market close"
                        : e.time || "TBD"}
                  </div>
                </div>
                {e.epsEstimate != null && (
                  <div className="text-right">
                    <div className="text-[10px] text-text-faint">EPS Est.</div>
                    <div className="font-mono text-[13px] font-bold">
                      ${e.epsEstimate.toFixed(2)}
                    </div>
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Mega Cap Ecosystems */}
      <div className="px-5 mb-5">
        <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
          Mega Cap Ecosystems
        </h2>
        <p className="text-[12px] text-text-muted mb-3">
          Explore company networks — suppliers, customers, partners, and competitors
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { ticker: "NVDA", name: "NVIDIA", count: "50+", color: "#76B900" },
            { ticker: "SPCX", name: "SpaceX", count: "20+", color: "#005288" },
            { ticker: "AAPL", name: "Apple", count: "10+", color: "#A2AAAD" },
            { ticker: "MSFT", name: "Microsoft", count: "10+", color: "#00A4EF" },
            { ticker: "AMZN", name: "Amazon", count: "10+", color: "#FF9900" },
            { ticker: "META", name: "Meta", count: "8+", color: "#0668E1" },
            { ticker: "TSLA", name: "Tesla", count: "10+", color: "#CC0000" },
            { ticker: "GOOGL", name: "Alphabet", count: "10+", color: "#4285F4" },
          ].map((eco) => (
            <Link
              key={eco.ticker}
              href={`/ecosystem/${eco.ticker}`}
              className="bg-surface-1 border border-border-1 rounded-[14px] p-3 hover:border-accent-brand/30 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className="w-[8px] h-[8px] rounded-full"
                  style={{ backgroundColor: eco.color }}
                />
                <span className="font-mono text-[14px] font-bold">{eco.ticker}</span>
              </div>
              <div className="text-[12px] text-text-muted">{eco.name}</div>
              <div className="font-mono text-[10px] text-text-faint mt-1">
                {eco.count} companies
              </div>
            </Link>
          ))}
        </div>
      </div>

      <Disclaimer />
      <TabBar />
    </div>
  );
}
