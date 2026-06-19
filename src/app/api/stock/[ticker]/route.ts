import { NextRequest, NextResponse } from "next/server";
import { getQuote, getCompanyProfile, getAnalystRatings, getPriceTarget, getHistoricalPrices } from "@/lib/ingestion/market-data";
import { getRecentForm4, getRecent8K } from "@/lib/ingestion/sec-edgar";

const CIK_MAP: Record<string, string> = {
  NVDA: "1045810",
  AAPL: "320193",
  MSFT: "789019",
  GOOGL: "1652044",
  META: "1326801",
  TSLA: "1318605",
  AMD: "2488",
  AMZN: "1018724",
  NFLX: "1065280",
  CRM: "1108524",
};

const RANGE_TO_DAYS: Record<string, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  "3Y": 1095,
  "5Y": 1825,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  const cik = CIK_MAP[symbol];

  const range = request.nextUrl.searchParams.get("range") || "1M";
  const days = RANGE_TO_DAYS[range] || 30;

  const [quote, profile, analysts, priceTarget, prices, form4s, filings8k] =
    await Promise.all([
      getQuote(symbol).catch(() => null),
      getCompanyProfile(symbol).catch(() => null),
      getAnalystRatings(symbol).catch(() => null),
      getPriceTarget(symbol).catch(() => null),
      getHistoricalPrices(symbol, days).catch(() => []),
      cik ? getRecentForm4(cik).catch(() => []) : Promise.resolve([]),
      cik ? getRecent8K(cik).catch(() => []) : Promise.resolve([]),
    ]);

  return NextResponse.json({
    symbol,
    quote,
    profile,
    analysts,
    priceTarget,
    prices,
    insiderTrades: form4s.slice(0, 10),
    filings: filings8k.slice(0, 5),
  });
}
