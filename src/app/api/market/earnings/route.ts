import { NextRequest, NextResponse } from "next/server";
import { yahooBatchQuotes } from "@/lib/ingestion/yahoo";
import {
  marketCapTier,
  CAP_TIER_LABEL,
  LARGE_CAP,
  SMALL_CAP,
  fmtCap,
  type CapTier,
} from "@/lib/market-cap";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const FMP_KEY = process.env.FMP_API_KEY || "";
const FMP_STABLE = "https://financialmodelingprep.com/stable";

interface EarningsEntry {
  symbol: string;
  date: string;
  time: string;
  epsEstimate?: number | null;
  epsActual?: number | null;
  revenueEstimate?: number | null;
  revenueActual?: number | null;
  name?: string;
  marketCap?: number;
  capLabel?: string;
  tier?: CapTier;
  tierLabel?: string;
}

function widePlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function nextWeekStr() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split("T")[0];
}

/**
 * Enrich the raw calendar with market cap + company name from Yahoo (free,
 * batched), classify by INDUSTRY-STANDARD cap tier, and split into:
 *   - earnings: near-term [from,to], small-cap and up (>= $300M) — cuts the
 *     micro/nano noise without relying on any hardcoded ticker list
 *   - major:    large-cap and up (>= $10B) across the wider window
 * Both sorted soonest-first.
 */
async function buildEarnings(
  mapped: EarningsEntry[],
  from: string,
  to: string,
  wideTo: string
): Promise<{ earnings: EarningsEntry[]; major: EarningsEntry[] }> {
  // Dedupe symbols, drop dual-class ".X", soonest-first, bound the Yahoo load.
  const seen = new Set<string>();
  const candidates = mapped
    .filter((e) => e.symbol && e.date && !e.symbol.includes(".") && e.date >= from && e.date <= wideTo)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .filter((e) => (seen.has(e.symbol) ? false : (seen.add(e.symbol), true)))
    .slice(0, 300);

  const quotes = await yahooBatchQuotes(candidates.map((c) => c.symbol));

  const enriched: EarningsEntry[] = [];
  for (const e of candidates) {
    const q = quotes.get(e.symbol);
    const mcap = q?.marketCap || 0;
    if (mcap < SMALL_CAP) continue; // drop micro/nano-cap noise
    const tier = marketCapTier(mcap);
    enriched.push({
      ...e,
      name: q?.name || e.symbol,
      marketCap: mcap,
      capLabel: fmtCap(mcap),
      tier,
      tierLabel: CAP_TIER_LABEL[tier],
    });
  }

  const earnings = enriched
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 60);

  const major = enriched
    .filter((e) => (e.marketCap || 0) >= LARGE_CAP)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 20);

  return { earnings, major };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || todayStr();
  const to = searchParams.get("to") || nextWeekStr();
  const wideTo = widePlus(40); // wider window so major-company reports surface

  // Try Finnhub earnings calendar first
  if (FINNHUB_KEY) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${wideTo}&token=${FINNHUB_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        const mapped: EarningsEntry[] = (data.earningsCalendar || []).map(
          (e: any) => ({
            symbol: e.symbol,
            date: e.date,
            time: e.hour === 0 ? "bmo" : "amc",
            epsEstimate: e.epsEstimate,
            epsActual: e.epsActual,
            revenueEstimate: e.revenueEstimate,
            revenueActual: e.revenueActual,
          })
        );
        const result = await buildEarnings(mapped, from, to, wideTo);
        if (result.earnings.length > 0 || result.major.length > 0) {
          return NextResponse.json(result);
        }
      }
    } catch {}
  }

  // Fallback: FMP stable earnings calendar
  if (FMP_KEY) {
    try {
      const res = await fetch(
        `${FMP_STABLE}/earning-calendar?from=${from}&to=${wideTo}&apikey=${FMP_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        const mapped: EarningsEntry[] = (data || []).map((e: any) => ({
          symbol: e.symbol,
          date: e.date,
          time: e.time || "bmo",
          epsEstimate: e.epsEstimated,
          revenueEstimate: e.revenueEstimated,
        }));
        return NextResponse.json(await buildEarnings(mapped, from, to, wideTo));
      }
    } catch {}
  }

  return NextResponse.json({ earnings: [], major: [] });
}
