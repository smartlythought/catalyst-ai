// Intraday Momentum Radar — a cheap, NO-AI scan that catches stocks igniting
// RIGHT NOW (unusual volume, gaps, breakouts), so a same-day mover like AMBA
// surfaces within the hour instead of only in the next morning's picks.
//
// Pure signal math over the free Yahoo quote — no Gemini, so it can run as
// often as we like (on demand from Admin, or a midday cron) at zero AI cost.
import { yahooBatchQuotes } from "@/lib/ingestion/yahoo";
import { buildScanUniverse } from "@/lib/ingestion/universe";
import { getHeldSymbols } from "@/lib/trading/alpaca";
import { computeUnusualSignals } from "@/lib/ingestion/signals";

// Quality bar — no penny/small-caps on the radar (matches the short-term picks
// preference). Held names are always allowed through.
const MIN_CAP = 1_000_000_000;
const MAX_HITS = 40;
const MIN_HEAT = 30; // below this a name isn't meaningfully "in play"

export interface RadarHit {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  volumeRatio: number;
  gapPct: number;
  heat: number;
  chips: string[];
}

export interface RadarResult {
  hits: RadarHit[];
  scanned: number;
  at: string; // ISO timestamp of the scan
}

// Short in-memory cache so rapid page reloads don't re-hit Yahoo. Yahoo is
// free, so the TTL is only about politeness/latency, not cost.
let cache: { at: number; result: RadarResult } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function scanRadar(force = false): Promise<RadarResult> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.result;

  const held = await getHeldSymbols().catch(() => new Set<string>());
  const { symbols } = await buildScanUniverse([...held]);
  const quotes = await yahooBatchQuotes(symbols);

  const hits: RadarHit[] = [];
  for (const [sym, q] of quotes) {
    if (!(q.price > 0)) continue;
    const isHeld = held.has(sym);
    // Real stocks only — no leveraged/inverse/single-stock ETFs or ETNs, which
    // always show violent moves and would flood the radar with noise.
    if (q.quoteType && q.quoteType !== "EQUITY") continue;
    // Strict quality floor: require a KNOWN market cap ≥ $1B (unless held). This
    // drops penny/nano names with missing cap data (e.g. rights/when-issued
    // tickers) that would otherwise slip through on an unknown cap.
    if (!isHeld && !(q.marketCap >= MIN_CAP)) continue;

    const sig = computeUnusualSignals({
      price: q.price,
      changePct: q.changePercent,
      volume: q.volume,
      avgVolume3M: q.avgVolume3M,
      week52High: q.week52High,
      week52Low: q.week52Low,
      extendedChangePct: q.extendedChangePct,
    });

    // Only surface names actually "in play" — a real flag or strong heat.
    if (!sig.label && sig.heat < MIN_HEAT) continue;

    hits.push({
      symbol: sym,
      name: q.name,
      price: q.price,
      changePct: q.changePercent,
      volumeRatio: sig.volumeRatio,
      gapPct: sig.gapPct,
      heat: sig.heat,
      chips: sig.chips,
    });
  }

  hits.sort((a, b) => b.heat - a.heat);
  const result: RadarResult = {
    hits: hits.slice(0, MAX_HITS),
    scanned: quotes.size,
    at: new Date().toISOString(),
  };
  cache = { at: Date.now(), result };
  return result;
}
