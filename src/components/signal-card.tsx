"use client";

import type { Signal } from "@/lib/types";
import { cn, formatPercent, callColor } from "@/lib/utils";
import { Sparkline } from "./sparkline";
import { ConvictionMeter } from "./conviction-meter";
import { CallPill } from "./call-pill";
import Link from "next/link";

interface SignalCardProps {
  signal: Signal;
}

export function SignalCard({ signal }: SignalCardProps) {
  const changeColor =
    signal.changePercent >= 0 ? "var(--pos-green-bright)" : "var(--neg-red-bright)";
  const color = callColor(signal.call);

  return (
    <Link href={`/signal/${signal.id}`}>
      <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4 flex flex-col gap-3 active:opacity-90 transition-opacity">
        {/* Row 1: Ticker, price, sparkline, call pill */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[18px] font-extrabold">{signal.ticker}</span>
              <span className="text-[13px] text-text-muted truncate">
                {signal.company}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="font-mono text-[14px] font-medium">
                ${signal.price.toFixed(2)}
              </div>
              <div
                className="font-mono text-[12px] font-medium"
                style={{ color: changeColor }}
              >
                {formatPercent(signal.changePercent)}
              </div>
            </div>
            <Sparkline data={signal.sparkline} color={changeColor} />
            <CallPill call={signal.call} />
          </div>
        </div>

        {/* Row 2: Conviction meter */}
        <ConvictionMeter
          value={signal.conviction}
          color={color}
          label={signal.horizon}
        />

        {/* Row 2b: Trade levels inline — no click-through needed */}
        {signal.entry != null && signal.target != null && signal.stop != null && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface-2 rounded-[10px] px-2.5 py-1.5 text-center">
              <div className="text-[8px] text-text-faint font-mono uppercase tracking-[0.5px]">
                Entry
              </div>
              <div className="font-mono text-[13px] font-bold">
                ${signal.entry.toFixed(2)}
              </div>
            </div>
            <div className="bg-surface-2 rounded-[10px] px-2.5 py-1.5 text-center">
              <div className="text-[8px] text-text-faint font-mono uppercase tracking-[0.5px]">
                Target
              </div>
              <div className="font-mono text-[13px] font-bold text-pos-green-bright">
                ${signal.target.toFixed(2)}
              </div>
            </div>
            <div className="bg-surface-2 rounded-[10px] px-2.5 py-1.5 text-center">
              <div className="text-[8px] text-text-faint font-mono uppercase tracking-[0.5px]">
                Stop
              </div>
              <div className="font-mono text-[13px] font-bold text-neg-red-bright">
                ${signal.stop.toFixed(2)}
              </div>
            </div>
          </div>
        )}

        {/* Row 3: Tag chips */}
        <div className="flex flex-wrap gap-1.5">
          {signal.tags.map((tag) => (
            <span
              key={tag}
              className="font-mono text-[10px] font-medium tracking-[0.5px] uppercase text-text-faint px-2 py-0.5 rounded-md bg-chip-bg border border-chip-border"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Row 4: Deep fundamentals (from the two-pass deep-dive) */}
        {signal.fundamentals && (
          <FundamentalChips f={signal.fundamentals} price={signal.price} />
        )}
      </div>
    </Link>
  );
}

function consensusLabel(key?: string): string | null {
  if (!key) return null;
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function FundamentalChips({
  f,
  price,
}: {
  f: NonNullable<Signal["fundamentals"]>;
  price: number;
}) {
  const chips: string[] = [];
  const consensus = consensusLabel(f.analystConsensus);
  if (consensus) chips.push(consensus);
  if (f.priceTarget && price > 0) {
    const up = ((f.priceTarget - price) / price) * 100;
    chips.push(`PT $${f.priceTarget.toFixed(0)} (${up >= 0 ? "+" : ""}${up.toFixed(0)}%)`);
  }
  if (f.peg) chips.push(`PEG ${f.peg.toFixed(2)}`);
  if (f.roe) chips.push(`ROE ${(f.roe * 100).toFixed(0)}%`);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span
          key={c}
          className="font-mono text-[10px] font-medium tracking-[0.3px] text-text-secondary px-2 py-0.5 rounded-md bg-accent-brand/10 border border-accent-brand/20"
        >
          {c}
        </span>
      ))}
    </div>
  );
}
