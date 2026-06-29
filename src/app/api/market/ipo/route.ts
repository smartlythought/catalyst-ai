import { NextResponse } from "next/server";
import { GEMINI_MODELS, geminiFetch } from "@/lib/ai/models";
import { withinDailyAIBudget } from "@/lib/ai/usage";
import { saveAISnapshot, getTodayAISnapshot } from "@/lib/ai/history";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

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

/**
 * Override the heuristic with real AI analysis where Gemini is available.
 * Best of both: richer AI read when we have quota, deterministic fallback so
 * the page is never blank. Cached hourly (revalidate=3600) → ~24 calls/day max.
 */
async function enrichWithAI(scored: IPO[]): Promise<IPO[]> {
  if (!GEMINI_KEY || scored.length === 0) return scored;
  if (!(await withinDailyAIBudget())) return scored;

  const top = scored.slice(0, 12);
  const prompt = `You are an IPO analyst. Assess each upcoming IPO below.

IPOs:
${top.map((ipo, i) => `${i + 1}. ${ipo.name} (${ipo.symbol}) - ${ipo.industry} - Price: ${ipo.priceRange} - Exchange: ${ipo.exchange} - Date: ${ipo.date}`).join("\n")}

Return ONLY a JSON array of objects, each:
- "symbol": ticker
- "analysis": one-sentence assessment (max 110 chars)
- "rating": "strong" | "moderate" | "weak" | "avoid"
Consider sector trends, size, pricing, and market conditions.`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await geminiFetch(model, GEMINI_KEY, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          // temperature 0 → deterministic: the same IPO data yields the same
          // rating every run, so the strength badge doesn't flip between views.
          temperature: 0,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      if (!res?.ok) continue;
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      const analyses: { symbol: string; analysis: string; rating: string }[] =
        JSON.parse(text);
      const bySymbol = new Map(analyses.map((a) => [a.symbol, a]));
      return scored.map((ipo) => {
        const a = bySymbol.get(ipo.symbol);
        if (!a) return ipo; // keep heuristic for any the model skipped
        return {
          ...ipo,
          aiAnalysis: a.analysis || ipo.aiAnalysis,
          aiRating: (["strong", "moderate", "weak", "avoid"].includes(a.rating)
            ? a.rating
            : ipo.aiRating) as IPO["aiRating"],
        };
      });
    } catch {
      continue;
    }
  }
  return scored; // AI unavailable → heuristic stands
}

export async function GET() {
  // Pin per day: if today's IPO snapshot exists, return it unchanged so ratings
  // stay stable all day across views (no flip-flopping). It regenerates only
  // once per day on the first request.
  const cached = await getTodayAISnapshot("ipo");
  if (Array.isArray(cached) && cached.length > 0) {
    return NextResponse.json({
      ipos: cached,
      total: cached.length,
      cached: true,
      generatedAt: new Date().toISOString(),
    });
  }

  const ipos = await fetchFinnhubIPOs();
  const scored = await enrichWithAI(scoreIPOs(ipos));

  const sorted = scored.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (sorted.length > 0) await saveAISnapshot("ipo", sorted);

  return NextResponse.json({
    ipos: sorted,
    total: sorted.length,
    generatedAt: new Date().toISOString(),
  });
}
