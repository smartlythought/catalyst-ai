import { NextResponse } from "next/server";

export const revalidate = 3600;

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";

interface PennyPick {
  symbol: string;
  companyName: string;
  price: number;
  sector: string;
  marketCap: string;
  catalyst: string;
  potential: string;
  risk: string;
  rating: "high" | "medium" | "speculative";
  conviction: number;
  currentPrice?: number;
  changePercent?: number;
}

export async function GET() {
  if (!GEMINI_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  const today = new Date().toISOString().split("T")[0];

  const prompt = `You are a US stock market analyst specializing in small-cap and micro-cap stocks with high growth potential. Today is ${today}.

Identify 15 US-listed stocks priced under $20 that have strong fundamentals and high growth potential. Focus on:
- Strong revenue growth (>20% YoY)
- Improving margins or path to profitability
- Innovative products/technology in growing markets
- Recent catalysts (FDA approvals, contract wins, earnings beats)
- Reasonable valuation for growth stage
- Good management team

Return a JSON array of 15 objects. Each must have:
- "symbol": US stock ticker (NYSE/NASDAQ listed, actively traded)
- "companyName": full company name
- "price": approximate current price (must be under $20)
- "sector": industry sector
- "marketCap": approximate market cap (e.g. "$500M", "$1.2B")
- "catalyst": one sentence about the key growth catalyst
- "potential": one sentence about upside potential
- "risk": one sentence about the main risk
- "rating": "high" (strong fundamentals + catalyst), "medium" (good but some concerns), or "speculative" (high risk/reward)
- "conviction": integer 40-95

Mix of stocks from different sectors. Only include real, actively traded US stocks.
Return ONLY the JSON array.`;

  const models = ["gemini-2.5-flash", "gemini-2.0-flash"];
  let picks: PennyPick[] = [];

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
              temperature: 0.5,
            },
          }),
        }
      );

      if (!res.ok) continue;
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      picks = JSON.parse(text);
      if (Array.isArray(picks) && picks.length > 0) break;
    } catch {
      continue;
    }
  }

  if (!picks.length) {
    return NextResponse.json({ error: "Failed to generate" }, { status: 502 });
  }

  if (FINNHUB_KEY) {
    await Promise.allSettled(
      picks.map(async (pick) => {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${pick.symbol}&token=${FINNHUB_KEY}`,
            { next: { revalidate: 300 } }
          );
          if (res.ok) {
            const q = await res.json();
            if (q.c > 0) {
              pick.currentPrice = q.c;
              pick.changePercent = q.dp || 0;
            }
          }
        } catch {}
      })
    );
  }

  return NextResponse.json({
    picks,
    generatedAt: new Date().toISOString(),
    disclaimer:
      "High-risk, high-reward. Small-cap stocks are volatile. Not financial advice.",
  });
}
