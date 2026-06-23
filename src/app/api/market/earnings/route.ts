import { NextRequest, NextResponse } from "next/server";

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
}

/**
 * Keep only entries within [from, to], sort SOONEST-FIRST, then cap. The
 * upstream feeds return results newest-first, so slicing before sorting drops
 * the nearest-term earnings (e.g. tomorrow's report) — exactly what we want to
 * show. Among entries on the same day, ones with analyst estimates (covered,
 * generally larger companies) rank ahead of obscure micro-caps.
 */
function prepEarnings(
  list: EarningsEntry[],
  from: string,
  to: string
): EarningsEntry[] {
  return list
    .filter((e) => e.symbol && e.date && e.date >= from && e.date <= to)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const aCovered = a.epsEstimate != null ? 0 : 1;
      const bCovered = b.epsEstimate != null ? 0 : 1;
      return aCovered - bCovered;
    })
    .slice(0, 60);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || todayStr();
  const to = searchParams.get("to") || nextWeekStr();

  // Try Finnhub earnings calendar first
  if (FINNHUB_KEY) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`
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
        const earnings = prepEarnings(mapped, from, to);
        if (earnings.length > 0) {
          return NextResponse.json({ earnings });
        }
      }
    } catch {}
  }

  // Fallback: FMP stable earnings calendar
  if (FMP_KEY) {
    try {
      const res = await fetch(
        `${FMP_STABLE}/earning-calendar?from=${from}&to=${to}&apikey=${FMP_KEY}`
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
        return NextResponse.json({ earnings: prepEarnings(mapped, from, to) });
      }
    } catch {}
  }

  return NextResponse.json({ earnings: [] });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function nextWeekStr() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}
