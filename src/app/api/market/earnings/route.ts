import { NextRequest, NextResponse } from "next/server";

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const FMP_KEY = process.env.FMP_API_KEY || "";
const FMP_STABLE = "https://financialmodelingprep.com/stable";

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
        const earnings = (data.earningsCalendar || [])
          .filter((e: any) => e.symbol && e.date)
          .slice(0, 50)
          .map((e: any) => ({
            symbol: e.symbol,
            date: e.date,
            time: e.hour === 0 ? "bmo" : "amc",
            epsEstimate: e.epsEstimate,
            epsActual: e.epsActual,
            revenueEstimate: e.revenueEstimate,
            revenueActual: e.revenueActual,
          }));

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
        const earnings = (data || [])
          .filter((e: any) => e.symbol && e.date)
          .slice(0, 50)
          .map((e: any) => ({
            symbol: e.symbol,
            date: e.date,
            time: e.time || "bmo",
            epsEstimate: e.epsEstimated,
            revenueEstimate: e.revenueEstimated,
          }));

        return NextResponse.json({ earnings });
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
