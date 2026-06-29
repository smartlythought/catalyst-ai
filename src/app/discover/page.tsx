"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TabBar } from "@/components/tab-bar";
import { MarketIndices } from "@/components/market-indices";
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
  updatedAt?: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DiscoverPage() {
  const router = useRouter();
  const [pulse, setPulse] = useState<PulseData | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [majorEarnings, setMajorEarnings] = useState<Earning[]>([]);
  const [tab, setTab] = useState<"gainers" | "losers" | "active">("gainers");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exploreTicker, setExploreTicker] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  function loadData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    Promise.all([
      fetch("/api/market/pulse").then((r) => r.json()),
      fetch("/api/market/earnings").then((r) => r.json()),
    ])
      .then(([p, e]) => {
        setPulse(p);
        setEarnings(e.earnings || []);
        setMajorEarnings(e.major || []);
        setLastUpdated(p.updatedAt || new Date().toISOString());
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(), 60000);
    return () => clearInterval(interval);
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
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
            Discover
          </h1>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="font-mono text-[10px] text-text-faint">
                {timeAgo(lastUpdated)}
              </span>
            )}
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className={`w-[28px] h-[28px] rounded-full border border-border-1 bg-surface-1 flex items-center justify-center ${refreshing ? "animate-spin" : ""}`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M14 8A6 6 0 1 1 8 2" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M14 2V6H10" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        <p className="text-[13px] text-text-muted mt-1">
          Market overview and trends
        </p>
      </header>

      <MarketIndices />

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

      {/* Daily Top 10 Picks */}
      <div className="px-5 mb-5">
        <Link
          href="/picks"
          className="block bg-surface-1 border border-accent-brand/20 rounded-[18px] p-4 active:opacity-90 transition-opacity"
          style={{
            background:
              "linear-gradient(135deg, rgba(232, 116, 59, 0.08), rgba(232, 116, 59, 0.02))",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-[40px] h-[40px] rounded-full bg-accent-brand/10 border border-accent-brand/20 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 2L12.5 7.5L18 8.5L14 12.5L15 18L10 15.5L5 18L6 12.5L2 8.5L7.5 7.5L10 2Z"
                  stroke="var(--accent-brand)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-bold text-accent-brand">
                Daily Top 10 Picks
              </div>
              <div className="text-[12px] text-text-muted mt-0.5">
                AI-recommended buy &amp; sell calls with entry, target, and stop
                loss
              </div>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="shrink-0"
            >
              <path
                d="M6 4L10 8L6 12"
                stroke="var(--accent-brand)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </Link>
      </div>

      {/* Exec Events */}
      <div className="px-5 mb-5">
        <Link
          href="/events"
          className="block bg-surface-1 border border-border-1 rounded-[18px] p-4 active:opacity-90 transition-opacity hover:border-accent-brand/30"
        >
          <div className="flex items-center gap-3">
            <div className="w-[40px] h-[40px] rounded-full bg-surface-2 border border-border-1 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect
                  x="3"
                  y="4"
                  width="14"
                  height="13"
                  rx="2"
                  stroke="var(--text-muted)"
                  strokeWidth="1.5"
                />
                <path
                  d="M3 8H17"
                  stroke="var(--text-muted)"
                  strokeWidth="1.5"
                />
                <path
                  d="M7 2V5"
                  stroke="var(--text-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M13 2V5"
                  stroke="var(--text-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle cx="10" cy="13" r="1.5" fill="var(--text-muted)" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-bold">Exec Events</div>
              <div className="text-[12px] text-text-muted mt-0.5">
                Track earnings calls, conferences, and executive events
              </div>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="shrink-0"
            >
              <path
                d="M6 4L10 8L6 12"
                stroke="var(--text-faint)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </Link>
      </div>

      {/* Upcoming IPOs */}
      <div className="px-5 mb-5">
        <Link
          href="/ipo"
          className="block bg-surface-1 border border-border-1 rounded-[18px] p-4 active:opacity-90 transition-opacity hover:border-accent-brand/30"
        >
          <div className="flex items-center gap-3">
            <div className="w-[40px] h-[40px] rounded-full bg-surface-2 border border-border-1 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 3V17M10 3L6 7M10 3L14 7" stroke="var(--pos-green-bright)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="3" y="14" width="14" height="3" rx="1" stroke="var(--pos-green-bright)" strokeWidth="1.5"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-bold" style={{ color: "var(--pos-green-bright)" }}>
                Upcoming IPOs
              </div>
              <div className="text-[12px] text-text-muted mt-0.5">
                AI-analyzed new listings with buy/avoid recommendations
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path d="M6 4L10 8L6 12" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </Link>
      </div>

      {/* High-Yield Picks */}
      <div className="px-5 mb-5">
        <Link
          href="/penny"
          className="block bg-surface-1 border border-border-1 rounded-[18px] p-4 active:opacity-90 transition-opacity hover:border-accent-brand/30"
        >
          <div className="flex items-center gap-3">
            <div className="w-[40px] h-[40px] rounded-full bg-surface-2 border border-border-1 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="7" stroke="#F59E0B" strokeWidth="1.5"/>
                <path d="M10 6V14M8 8H12M8 12H12" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-bold" style={{ color: "#F59E0B" }}>
                High-Yield Picks
              </div>
              <div className="text-[12px] text-text-muted mt-0.5">
                Small-cap stocks under $20 with strong growth potential
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path d="M6 4L10 8L6 12" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </Link>
      </div>

      {/* Sector Heatmap */}
      {pulse?.sectors && pulse.sectors.length > 0 && (() => {
        const maxAbsChange = Math.max(
          ...pulse.sectors.map((s) => Math.abs(s.change)),
          0.01
        );
        return (
          <div className="px-5 mb-5">
            <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
              Sector Performance
            </h2>
            <div className="grid grid-cols-3 gap-1.5">
              {pulse.sectors.map((s) => {
                const barPct = Math.min((Math.abs(s.change) / maxAbsChange) * 100, 100);
                const isPositive = s.change >= 0;
                return (
                  <div
                    key={s.sector}
                    className="rounded-[10px] p-2.5"
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
                        isPositive
                          ? "rgba(22, 199, 132, 0.2)"
                          : "rgba(234, 57, 67, 0.2)"
                      }`,
                    }}
                  >
                    <div className="text-[10px] text-text-muted truncate mb-0.5">
                      {s.sector.replace("_", " ")}
                    </div>
                    <div
                      className="font-mono text-[13px] font-bold mb-1.5"
                      style={{
                        color: isPositive
                          ? "var(--pos-green-bright)"
                          : "var(--neg-red-bright)",
                      }}
                    >
                      {isPositive ? "+" : ""}
                      {s.change.toFixed(2)}%
                    </div>
                    {/* Mini bar chart */}
                    <div className="h-[4px] rounded-full overflow-hidden"
                      style={{ backgroundColor: isPositive ? "rgba(22, 199, 132, 0.12)" : "rgba(234, 57, 67, 0.12)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${barPct}%`,
                          backgroundColor: isPositive
                            ? "var(--pos-green)"
                            : "var(--neg-red)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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

      {/* Major Companies earnings — dedicated section for mega/large caps */}
      {majorEarnings.length > 0 && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-accent-brand uppercase tracking-[1px] mb-3">
            Major Companies · Upcoming Earnings
          </h2>
          <div className="bg-surface-1 border border-accent-brand/20 rounded-[18px] overflow-hidden">
            {majorEarnings.slice(0, 12).map((e, i) => (
              <Link
                key={`major-${e.symbol}-${e.date}`}
                href={`/stock/${e.symbol}`}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i < Math.min(majorEarnings.length, 12) - 1
                    ? "border-b border-border-hairline"
                    : ""
                }`}
              >
                <div className="w-[36px] h-[36px] rounded-[10px] bg-accent-brand/10 border border-accent-brand/20 flex flex-col items-center justify-center">
                  <div className="text-[9px] text-accent-brand font-mono leading-none">
                    {new Date(e.date + "T00:00:00").toLocaleDateString("en", {
                      month: "short",
                    })}
                  </div>
                  <div className="text-[14px] font-bold leading-none text-accent-brand">
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

      {/* Earnings Calendar */}
      {earnings.length > 0 && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            All Upcoming Earnings
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

      {/* Explore Any Stock Ecosystem */}
      <div className="px-5 mb-5">
        <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
          Explore Any Stock
        </h2>
        <p className="text-[12px] text-text-muted mb-3">
          Enter any ticker to generate an AI-powered ecosystem map
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = exploreTicker.trim().toUpperCase();
            if (t) router.push(`/ecosystem/${t}`);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={exploreTicker}
            onChange={(e) => setExploreTicker(e.target.value.toUpperCase())}
            placeholder="e.g. CRWD, SNOW, PLTR"
            maxLength={5}
            className="flex-1 bg-surface-1 border border-border-1 rounded-[12px] px-4 py-2.5 font-mono text-[14px] placeholder:text-text-faint outline-none focus:border-accent-brand/50 transition-colors uppercase tracking-wide"
          />
          <button
            type="submit"
            disabled={!exploreTicker.trim()}
            className="bg-accent-brand text-white font-medium text-[13px] px-5 py-2.5 rounded-[12px] disabled:opacity-40 transition-opacity"
          >
            Explore
          </button>
        </form>
      </div>

      <Disclaimer />
      <TabBar />
    </div>
  );
}
