import { NextResponse } from "next/server";
import { GEMINI_MODELS } from "@/lib/ai/models";
import { withinDailyAIBudget, AI_BUDGET_MESSAGE } from "@/lib/ai/usage";
import { USER_AI_ENABLED, USER_AI_DISABLED_MESSAGE } from "@/lib/ai/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  if (!USER_AI_ENABLED) {
    return NextResponse.json(
      { error: USER_AI_DISABLED_MESSAGE, picks: [] },
      { status: 503 }
    );
  }

  if (!GEMINI_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  if (!(await withinDailyAIBudget())) {
    return NextResponse.json({ error: AI_BUDGET_MESSAGE, picks: [] }, { status: 429 });
  }

  const today = new Date().toISOString().split("T")[0];

  const prompt = `You are a US stock market analyst specializing in small-cap and micro-cap stocks with high growth potential. Today is ${today}.

Identify 10 US-listed stocks priced under $20 that have strong fundamentals and high growth potential. Focus on:
- Strong revenue growth (>20% YoY)
- Improving margins or path to profitability
- Innovative products/technology in growing markets
- Recent catalysts (FDA approvals, contract wins, earnings beats)
- Reasonable valuation for growth stage
- Good management team

Return a JSON array of 10 objects. Each must have:
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

  const models = GEMINI_MODELS;
  let picks: PennyPick[] = [];
  let lastErr = "";

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
              maxOutputTokens: 8192,
              // Disable 2.5-flash "thinking" to keep latency under the timeout.
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal: AbortSignal.timeout(28000),
        }
      );

      if (!res.ok) { lastErr = `${model}:${res.status}`; continue; }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) { lastErr = `${model}:empty`; continue; }

      picks = JSON.parse(text);
      if (Array.isArray(picks) && picks.length > 0) break;
      lastErr = `${model}:not-array`;
    } catch (e) {
      lastErr = `${model}:${String(e).slice(0, 80)}`;
      continue;
    }
  }

  if (!picks.length) {
    return NextResponse.json(
      { error: "Failed to generate", debug: lastErr, picks: [] },
      { status: 502 }
    );
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
