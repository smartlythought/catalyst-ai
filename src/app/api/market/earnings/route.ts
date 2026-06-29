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

// Well-known large/mega-caps for the dedicated "Major Companies" section.
const MAJOR_TICKERS = new Set([
  "AAPL","MSFT","NVDA","GOOGL","GOOG","AMZN","META","TSLA","AVGO","AMD",
  "JPM","V","MA","BAC","WFC","GS","UNH","JNJ","LLY","PFE","MRK","ABBV",
  "XOM","CVX","WMT","COST","HD","PG","KO","PEP","MCD","NKE","DIS","NFLX",
  "ORCL","CRM","ADBE","INTC","QCOM","CSCO","TXN","IBM","NOW","PLTR","UBER",
  "BA","CAT","GE","HON","RTX","T","VZ","TMUS","C","MS","BLK","INTU","AMAT",
]);

function majorEarnings(list: EarningsEntry[], from: string): EarningsEntry[] {
  return list
    .filter((e) => e.symbol && e.date && e.date >= from && MAJOR_TICKERS.has(e.symbol))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 15);
}

function widePlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
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
  // Fetch a wider window than the near-term list so the "Major Companies"
  // section can surface the next mega-cap reports even if they're weeks out.
  const wideTo = widePlus(60);

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
        const earnings = prepEarnings(mapped, from, to);
        const major = majorEarnings(mapped, from);
        if (earnings.length > 0 || major.length > 0) {
          return NextResponse.json({ earnings, major });
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
        return NextResponse.json({
          earnings: prepEarnings(mapped, from, to),
          major: majorEarnings(mapped, from),
        });
      }
    } catch {}
  }

  return NextResponse.json({ earnings: [], major: [] });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function nextWeekStr() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}
