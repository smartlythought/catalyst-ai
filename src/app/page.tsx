import Link from "next/link";
import { SignalsFeed } from "@/components/signals-feed";
import { MarketIndices } from "@/components/market-indices";
import { TabBar } from "@/components/tab-bar";
import { Disclaimer } from "@/components/disclaimer";
import { createServiceClient } from "@/lib/supabase/server";
import { getTodayDate } from "@/lib/mock-data";
import type { Signal } from "@/lib/types";

export const dynamic = "force-dynamic";

function getTradingDateET(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const hour = et.getHours();
  if (day === 0) et.setDate(et.getDate() - 2);
  else if (day === 6) et.setDate(et.getDate() - 1);
  else if (hour < 4) et.setDate(et.getDate() - (day === 1 ? 3 : 1));
  return et.toISOString().split("T")[0];
}

export default async function HomePage() {
  const tradingDate = getTradingDateET();

  let row: { picks: any; generated_at: string } | null = null;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("daily_picks")
      .select("picks, generated_at")
      .eq("generated_date", tradingDate)
      .single();
    row = data;
  } catch {}

  let signals: Signal[] = [];

  if (row?.picks && Array.isArray(row.picks)) {
    signals = row.picks.map((p: any, i: number) => ({
      id: `pick-${tradingDate}-${i}`,
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
        sentiment: p.action === "SELL" ? "negative" as const : "positive" as const,
      })),
      sparkline: [],
      timestamp: row.generated_at || new Date().toISOString(),
    }));
  }

  const buyCount = signals.filter((s) => s.call === "BUY").length;
  const reduceCount = signals.filter((s) => s.call === "REDUCE").length;
  const watchCount = signals.filter((s) => s.call === "WATCH").length;

  return (
    <div className="min-h-dvh pb-24">
      <header className="safe-top px-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] text-text-muted font-medium">
            {getTodayDate()}
          </span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border-1">
            <span className="w-[6px] h-[6px] rounded-full bg-pos-green animate-live-pulse" />
            <span className="font-mono text-[10px] font-semibold tracking-[1px] uppercase text-pos-green">
              Live
            </span>
          </div>
        </div>
      </header>

      <MarketIndices />

      <div className="px-5">
        {/* Search bar */}
        <Link
          href="/search"
          className="flex items-center gap-2.5 h-[44px] rounded-[14px] border border-border-1 bg-surface-1 px-4 mb-4"
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <circle cx="8" cy="8" r="5.5" stroke="var(--text-faint)" strokeWidth="1.5" />
            <path d="M12 12L16 16" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-[14px] text-text-faint">
            Search any stock...
          </span>
        </Link>

        {/* Discover hero */}
        <div
          className="rounded-[20px] p-4 mb-5 border border-accent-brand/25 overflow-hidden relative"
          style={{
            background: "linear-gradient(135deg, rgba(232,116,59,0.12) 0%, rgba(232,116,59,0.03) 100%)",
          }}
        >
          <div className="absolute top-0 right-0 w-[120px] h-[120px] rounded-full opacity-[0.07]"
            style={{ background: "radial-gradient(circle, var(--accent-brand), transparent 70%)", transform: "translate(30%, -30%)" }}
          />
          <Link href="/discover" className="flex items-center gap-3 mb-3 active:opacity-80 transition-opacity">
            <div className="w-[42px] h-[42px] rounded-full bg-accent-brand/15 border border-accent-brand/25 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="8" stroke="var(--accent-brand)" strokeWidth="1.5"/>
                <path d="M14.5 7.5L12.2 12.2L7.5 14.5L9.8 9.8L14.5 7.5Z" stroke="var(--accent-brand)" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[17px] font-extrabold text-accent-brand tracking-[-0.3px]">
                Discover
              </div>
              <div className="text-[12px] text-text-muted">
                Market movers, sectors, earnings &amp; AI picks
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path d="M6 4L10 8L6 12" stroke="var(--accent-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <div className="flex gap-2">
            <Link
              href="/picks"
              className="flex-1 bg-surface-1/60 backdrop-blur-sm border border-border-1/50 rounded-[12px] px-3 py-2 text-center active:opacity-80 transition-opacity"
            >
              <div className="text-[9px] text-text-faint font-mono uppercase tracking-[0.5px] mb-0.5">Top 10</div>
              <div className="text-[13px] font-bold text-accent-brand">Daily Picks</div>
            </Link>
            <Link
              href="/events"
              className="flex-1 bg-surface-1/60 backdrop-blur-sm border border-border-1/50 rounded-[12px] px-3 py-2 text-center active:opacity-80 transition-opacity"
            >
              <div className="text-[9px] text-text-faint font-mono uppercase tracking-[0.5px] mb-0.5">Calendar</div>
              <div className="text-[13px] font-bold">Earnings</div>
            </Link>
            <Link
              href="/ipo"
              className="flex-1 bg-surface-1/60 backdrop-blur-sm border border-border-1/50 rounded-[12px] px-3 py-2 text-center active:opacity-80 transition-opacity"
            >
              <div className="text-[9px] text-text-faint font-mono uppercase tracking-[0.5px] mb-0.5">New</div>
              <div className="text-[13px] font-bold text-pos-green">IPOs</div>
            </Link>
          </div>
        </div>

        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
          Today&apos;s calls
        </h1>

        {/* Stats strip */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[22px] font-bold text-pos-green">
              {buyCount}
            </span>
            <span className="text-[12px] text-text-muted font-medium">BUY</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[22px] font-bold text-neg-red">
              {reduceCount}
            </span>
            <span className="text-[12px] text-text-muted font-medium">REDUCE</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[22px] font-bold text-neutral-watch">
              {watchCount}
            </span>
            <span className="text-[12px] text-text-muted font-medium">WATCH</span>
          </div>
          <div className="ml-auto text-[12px] text-text-faint font-mono">
            {signals.length} stocks
          </div>
        </div>
      </div>

      <SignalsFeed signals={signals} />

      <Disclaimer />

      <TabBar />
    </div>
  );
}
