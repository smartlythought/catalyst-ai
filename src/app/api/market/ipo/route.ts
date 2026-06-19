import { NextResponse } from "next/server";

export const revalidate = 3600;

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

async function analyzeIPOs(ipos: IPO[]): Promise<IPO[]> {
  if (!GEMINI_KEY || ipos.length === 0) return ipos;

  const top = ipos.slice(0, 15);
  const prompt = `You are an IPO analyst. Analyze these upcoming IPOs and provide a brief assessment for each.

IPOs:
${top.map((ipo, i) => `${i + 1}. ${ipo.name} (${ipo.symbol}) - ${ipo.industry} - Price: ${ipo.priceRange} - Date: ${ipo.date}`).join("\n")}

For each IPO, return a JSON array of objects with:
- "symbol": the ticker symbol
- "analysis": one sentence assessment (max 100 chars) about the IPO's potential
- "rating": "strong" (high potential), "moderate" (decent), "weak" (risky), or "avoid"

Consider: industry trends, market conditions, company size, pricing, and sector momentum.
Return ONLY the JSON array.`;

  const models = ["gemini-2.5-flash", "gemini-2.0-flash"];

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.3,
            },
          }),
          next: { revalidate: 3600 },
        }
      );

      if (!res.ok) continue;
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      const analyses: { symbol: string; analysis: string; rating: string }[] =
        JSON.parse(text);

      const analysisMap = new Map(analyses.map((a) => [a.symbol, a]));

      return ipos.map((ipo) => {
        const a = analysisMap.get(ipo.symbol);
        if (a) {
          return {
            ...ipo,
            aiAnalysis: a.analysis,
            aiRating: (["strong", "moderate", "weak", "avoid"].includes(a.rating)
              ? a.rating
              : "moderate") as IPO["aiRating"],
          };
        }
        return ipo;
      });
    } catch {
      continue;
    }
  }

  return ipos;
}

export async function GET() {
  const ipos = await fetchFinnhubIPOs();
  const analyzed = await analyzeIPOs(ipos);

  const sorted = analyzed.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return NextResponse.json({
    ipos: sorted,
    total: sorted.length,
    generatedAt: new Date().toISOString(),
  });
}
