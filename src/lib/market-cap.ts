// Industry-standard market-cap categories (USD). Used to classify companies
// generically by size instead of relying on hardcoded ticker lists.
//   Mega-cap:  >= $200B
//   Large-cap: $10B – $200B
//   Mid-cap:   $2B – $10B
//   Small-cap: $300M – $2B
//   Micro-cap: < $300M  (excluded from our curated views as noise)
export type CapTier = "mega" | "large" | "mid" | "small" | "micro";

export const MEGA_CAP = 200_000_000_000;
export const LARGE_CAP = 10_000_000_000;
export const MID_CAP = 2_000_000_000;
export const SMALL_CAP = 300_000_000;

export function marketCapTier(mcap: number): CapTier {
  if (mcap >= MEGA_CAP) return "mega";
  if (mcap >= LARGE_CAP) return "large";
  if (mcap >= MID_CAP) return "mid";
  if (mcap >= SMALL_CAP) return "small";
  return "micro";
}

export const CAP_TIER_LABEL: Record<CapTier, string> = {
  mega: "Mega-cap",
  large: "Large-cap",
  mid: "Mid-cap",
  small: "Small-cap",
  micro: "Micro-cap",
};

/** Compact market-cap label, e.g. $2.5T / $250B / $850M. */
export function fmtCap(mcap: number): string {
  if (mcap >= 1e12) return `$${(mcap / 1e12).toFixed(1)}T`;
  if (mcap >= 1e9) return `$${(mcap / 1e9).toFixed(1)}B`;
  if (mcap >= 1e6) return `$${(mcap / 1e6).toFixed(0)}M`;
  return `$${mcap}`;
}
