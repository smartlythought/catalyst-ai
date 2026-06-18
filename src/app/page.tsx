import Link from "next/link";
import { SignalsFeed } from "@/components/signals-feed";
import { TabBar } from "@/components/tab-bar";
import { Disclaimer } from "@/components/disclaimer";
import { getActiveCalls } from "@/lib/supabase/queries";
import { getBatchQuotes } from "@/lib/ingestion/market-data";
import { MOCK_SIGNALS, getTodayDate } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let signals = await getActiveCalls().catch(() => []);

  if (signals.length > 0) {
    const tickers = [...new Set(signals.map((s) => s.ticker))];
    const quotes = await getBatchQuotes(tickers).catch(() => new Map());
    for (const s of signals) {
      const q = quotes.get(s.ticker);
      if (q) {
        s.price = q.price;
        s.change = q.change;
        s.changePercent = q.changePercent;
      }
    }
  } else {
    signals = MOCK_SIGNALS;
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

        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
            Today&apos;s calls
          </h1>
          <Link
            href="/discover"
            className="text-[12px] font-medium text-accent-brand px-3 py-1.5 rounded-full bg-accent-brand/10 border border-accent-brand/20"
          >
            Discover
          </Link>
        </div>

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
      </header>

      <SignalsFeed signals={signals} />

      <Disclaimer />

      <TabBar />
    </div>
  );
}
