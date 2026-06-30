export interface Fundamentals {
  analystConsensus?: string;
  peg?: number;
  priceTarget?: number;
  roe?: number;
  revGrowth?: number;
}

export function consensusLabel(key?: string): string | null {
  if (!key) return null;
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Compact chips for the deep-dive fundamentals (analyst consensus, price
 * target + implied upside, PEG, ROE, revenue growth). Shared across pick cards,
 * the home feed, the stock detail page, and history. Renders nothing if empty.
 */
export function FundamentalChips({
  f,
  price,
  size = "sm",
}: {
  f: Fundamentals;
  price: number;
  size?: "sm" | "xs";
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
  if (f.revGrowth) chips.push(`Rev ${f.revGrowth >= 0 ? "+" : ""}${(f.revGrowth * 100).toFixed(0)}%`);
  if (chips.length === 0) return null;

  const text = size === "xs" ? "text-[9px]" : "text-[10px]";
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span
          key={c}
          className={`font-mono ${text} font-medium tracking-[0.3px] text-text-secondary px-2 py-0.5 rounded-md bg-accent-brand/10 border border-accent-brand/20`}
        >
          {c}
        </span>
      ))}
    </div>
  );
}
