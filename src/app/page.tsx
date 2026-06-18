import { SignalsFeed } from "@/components/signals-feed";
import { TabBar } from "@/components/tab-bar";
import { MOCK_SIGNALS, getTodayDate } from "@/lib/mock-data";

export default function HomePage() {
  const signals = MOCK_SIGNALS;
  const buyCount = signals.filter((s) => s.call === "BUY").length;
  const reduceCount = signals.filter((s) => s.call === "REDUCE").length;
  const watchCount = signals.filter((s) => s.call === "WATCH").length;

  return (
    <div className="min-h-dvh pb-24">
      {/* Header */}
      <header className="safe-top px-5 pb-4">
        <div className="flex items-center justify-between mb-1">
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
        </div>
      </header>

      {/* Signal cards */}
      <SignalsFeed signals={signals} />

      {/* Disclaimer */}
      <div className="px-5 pt-6 pb-4">
        <p className="text-[10px] text-text-faint font-mono tracking-[0.5px] uppercase text-center leading-relaxed">
          Catalyst is research, not financial advice. You make the call.
        </p>
      </div>

      <TabBar />
    </div>
  );
}
