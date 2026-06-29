import { NextResponse } from "next/server";

export const revalidate = 3600;

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";

interface IPO {
  name: string;
  symbol: string;
  date: string;
  exchange: string;
  priceRange: string;
  shares: string;
  status: "upcoming" | "filed" | "priced" | "withdrawn";
  industry: string;
  aiAnalysis?: string;
  aiRating?: "strong" | "moderate" | "weak" | "avoid";
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function futureStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

async function fetchFinnhubIPOs(): Promise<IPO[]> {
  if (!FINNHUB_KEY) return [];

  try {
    const from = todayStr();
    const to = futureStr(90);
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/ipo?from=${from}&to=${to}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) return [];
    const data = await res.json();

    return (data.ipoCalendar || [])
      .filter((ipo: any) => ipo.name && ipo.date)
      .map((ipo: any) => ({
        name: ipo.name,
        symbol: ipo.symbol || "TBD",
        date: ipo.date,
        exchange: ipo.exchange || "—",
        priceRange: ipo.price
          ? typeof ipo.price === "string"
            ? ipo.price
            : `$${ipo.price}`
          : ipo.priceRangeLow && ipo.priceRangeHigh
            ? `$${ipo.priceRangeLow} – $${ipo.priceRangeHigh}`
            : "TBD",
        shares: ipo.numberOfShares
          ? `${(ipo.numberOfShares / 1e6).toFixed(1)}M`
          : "—",
        status: ipo.status || "upcoming",
        industry: ipo.industry || "—",
      }));
  } catch {
    return [];
  }
}

/** Midpoint of a "$11.25 – $13.25" / "$12" style price range, or 0. */
function priceMidpoint(range: string): number {
  const nums = (range.match(/[\d.]+/g) || []).map(Number).filter((n) => n > 0);
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Deterministic, rule-based IPO scoring — no AI/Gemini calls. Strength is
 * inferred from the offer price (proxy for size/quality) and listing venue;
 * the insight is templated from the same signals. Keeps the page useful and
 * costs zero API quota.
 */
function scoreIPOs(ipos: IPO[]): IPO[] {
  const majorExchange = (ex: string) =>
    /nasdaq|nyse/i.test(ex || "");

  return ipos.map((ipo) => {
    const mid = priceMidpoint(ipo.priceRange);
    const major = majorExchange(ipo.exchange);

    let rating: IPO["aiRating"];
    if (mid >= 20 && major) rating = "strong";
    else if (mid >= 12) rating = "moderate";
    else if (mid > 0) rating = "weak";
    else rating = "moderate";

    const venue = major ? ipo.exchange : "a smaller venue";
    const sizeNote =
      mid >= 20
        ? "a higher offer price suggests an established, larger-cap debut"
        : mid >= 12
          ? "a mid-range offer price points to a moderate-size listing"
          : mid > 0
            ? "a low offer price suggests a smaller-cap, more speculative debut"
            : "pricing is still to be determined";

    const aiAnalysis = `Listing on ${venue}; ${sizeNote}. Rule-based read — do your own research before the open.`;

    return { ...ipo, aiRating: rating, aiAnalysis };
  });
}

export async function GET() {
  const ipos = await fetchFinnhubIPOs();
  const scored = scoreIPOs(ipos);

  const sorted = scored.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return NextResponse.json({
    ipos: sorted,
    total: sorted.length,
    generatedAt: new Date().toISOString(),
  });
}
