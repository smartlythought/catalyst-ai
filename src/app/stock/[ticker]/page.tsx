"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { callColor, formatPercent, formatMarketCap } from "@/lib/utils";
import { TabBar } from "@/components/tab-bar";
import { Disclaimer } from "@/components/disclaimer";

interface NewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: "positive" | "negative" | "neutral";
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

interface StockData {
  symbol: string;
  quote: any;
  profile: any;
  analysts: any;
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

  useEffect(() => {
    fetch(`/api/stock/${ticker}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`/api/news/${ticker}?days=5`)
      .then((r) => r.json())
      .then((d) => setNews(d.news || []))
      .catch(() => {});
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

  const price = data?.quote?.price ?? 0;
  const change = data?.quote?.change ?? 0;
  const changePercent = data?.quote?.changePercent ?? 0;
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

  const chartPoints = chartData
    .map((d, i) => {
      const x = (i / Math.max(chartData.length - 1, 1)) * chartW;
      const y =
        chartH - ((d.close - chartMin) / chartRange) * (chartH - 20) - 10;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints =
    chartData.length > 0
      ? `0,${chartH} ${chartPoints} ${chartW},${chartH}`
      : "";

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
              <div className="font-mono text-[22px] font-bold">
                ${price.toFixed(2)}
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
      </header>

      {/* Price chart */}
      {chartData.length > 1 && (
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
            </svg>
            <div className="flex items-center gap-2 mt-3">
              {["1W", "1M", "3M", "1Y"].map((r) => (
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
      <div className="px-5 mb-5 flex gap-3">
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
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Check out ${ticker.toUpperCase()} at $${price.toFixed(2)} on Catalyst`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="h-[48px] px-5 rounded-[14px] border border-border-1 bg-surface-1 font-bold text-[14px] text-text-secondary flex items-center justify-center"
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
