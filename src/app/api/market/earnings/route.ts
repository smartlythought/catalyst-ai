import { NextRequest, NextResponse } from "next/server";

const FMP_KEY = process.env.FMP_API_KEY || "";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || todayStr();
  const to = searchParams.get("to") || nextWeekStr();

  if (!FMP_KEY) {
    return NextResponse.json({ earnings: [] });
  }

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/earning_calendar?from=${from}&to=${to}&apikey=${FMP_KEY}`
    );
    if (!res.ok) return NextResponse.json({ earnings: [] });

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
  } catch {
    return NextResponse.json({ earnings: [] });
  }
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function nextWeekStr() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}
