// Unusual-activity ("pre-spike") signals.
//
// Sudden spikes (e.g. ABVX +35% on a trial readout) are rarely predictable in
// direction, but the EARLY move is almost always accompanied by detectable
// tells: unusual volume vs the stock's own average, an overnight/pre-market
// gap, or a breakout near the 52-week high on heavy volume. We compute these
// (all from the free Yahoo quote we already pull) so the AI can weight
// "something is in play here" when picking short-term momentum/catalyst trades.

export interface StockSignalInput {
  price: number;
  changePct: number; // session change (session-aware: pre/post or regular)
  volume: number;
  avgVolume3M: number; // 3-month average daily volume
  week52High: number;
  week52Low: number;
  extendedChangePct: number; // pre/post-market gap vs prev close (0 if regular)
}

export interface UnusualSignals {
  volumeRatio: number; // today's volume ÷ 3-month avg (0 if unknown)
  gapPct: number; // extended-hours gap %
  pctBelowHigh: number; // % below the 52-week high (0 = at the high)
  isVolumeSurge: boolean; // ratio >= threshold — accumulation / distribution
  isGap: boolean; // meaningful overnight/pre-market gap
  isNearHigh: boolean; // within a few % of the 52-week high and rising
  isBreakout: boolean; // near-high AND on unusually heavy volume
  heat: number; // 0-100 composite "in play" score for ranking
  label: string; // compact flags for the AI prompt, e.g. "Vol:2.4x Gap:+6% Breakout"
  chips: string[]; // human-readable flags for UI display
}

// Tunable thresholds — deliberately conservative so flags mean something.
const VOL_SURGE = 1.8; // 1.8× the 3-month average = unusual
const GAP_PCT = 4; // ±4% overnight/pre-market move
const NEAR_HIGH_PCT = 3; // within 3% of the 52-week high

export function computeUnusualSignals(s: StockSignalInput): UnusualSignals {
  const volumeRatio = s.avgVolume3M > 0 ? s.volume / s.avgVolume3M : 0;
  const gapPct = s.extendedChangePct || 0;
  const pctBelowHigh =
    s.week52High > 0 ? ((s.week52High - s.price) / s.week52High) * 100 : 100;

  const isVolumeSurge = volumeRatio >= VOL_SURGE;
  const isGap = Math.abs(gapPct) >= GAP_PCT;
  const isNearHigh = pctBelowHigh >= 0 && pctBelowHigh <= NEAR_HIGH_PCT && s.changePct >= 0;
  const isBreakout = isNearHigh && volumeRatio >= 1.5;

  // Composite "heat" — how much this name is in play right now. Used to make
  // sure unusual-activity stocks bubble into the (capped) analysis prompt.
  const volComp = Math.min(volumeRatio / 4, 1) * 35;
  const gapComp = Math.min(Math.abs(gapPct) / 10, 1) * 25;
  const moveComp = Math.min(Math.abs(s.changePct) / 10, 1) * 25;
  const highComp = isBreakout ? 15 : isNearHigh ? 8 : 0;
  const heat = Math.round(Math.min(volComp + gapComp + moveComp + highComp, 100));

  const label: string[] = [];
  const chips: string[] = [];
  if (volumeRatio >= 1.5) {
    label.push(`Vol:${volumeRatio.toFixed(1)}x`);
    if (isVolumeSurge) chips.push(`${volumeRatio.toFixed(1)}× volume`);
  }
  if (isGap) {
    label.push(`Gap:${gapPct >= 0 ? "+" : ""}${gapPct.toFixed(1)}%`);
    chips.push(`Gap ${gapPct >= 0 ? "+" : ""}${gapPct.toFixed(1)}%`);
  }
  if (isBreakout) {
    label.push("Breakout");
    chips.push("Breakout");
  } else if (isNearHigh) {
    label.push("NearHigh");
    chips.push("Near 52w high");
  }

  return {
    volumeRatio,
    gapPct,
    pctBelowHigh,
    isVolumeSurge,
    isGap,
    isNearHigh,
    isBreakout,
    heat,
    label: label.join(" "),
    chips,
  };
}
