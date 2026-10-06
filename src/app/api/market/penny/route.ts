import { NextResponse } from "next/server";
import { aiConfigured, generateJSON, lastLLMError } from "@/lib/ai/llm";
import { withinDailyAIBudget, AI_BUDGET_MESSAGE } from "@/lib/ai/usage";
import { USER_AI_ENABLED, USER_AI_DISABLED_MESSAGE } from "@/lib/ai/config";
import { saveAISnapshot, getTodayAISnapshotWithTime } from "@/lib/ai/history";
import { getMarketContextText } from "@/lib/ingestion/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
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

  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  // Serve today's cached snapshot if we already generated it — high-yield only
  // needs to run once per day, not on every page view (saves Gemini quota).
  const snap = await getTodayAISnapshotWithTime("penny");
  const cached = snap?.payload;
  if (Array.isArray(cached) && cached.length > 0) {
    return NextResponse.json({
      picks: cached,
      generatedAt: snap!.createdAt, // when it was actually generated, not now
      cached: true,
      disclaimer:
        "High-risk, high-reward. Small-cap stocks are volatile. Not financial advice.",
    });
  }

  if (!(await withinDailyAIBudget())) {
    return NextResponse.json({ error: AI_BUDGET_MESSAGE, picks: [] }, { status: 429 });
  }

  const today = new Date().toISOString().split("T")[0];
  const macro = await getMarketContextText();

  const prompt = `You are a US stock market analyst specializing in small-cap and micro-cap stocks with high growth potential. Today is ${today}.

${macro}Identify 10 US-listed stocks priced under $20 that have strong fundamentals and high growth potential. Focus on:
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

  const parsed = await generateJSON<PennyPick[]>({
    prompt,
    temperature: 0.35,
    maxTokens: 8192,
    timeoutMs: 120_000,
  });
  const picks: PennyPick[] = Array.isArray(parsed) ? parsed : [];

  if (!picks.length) {
    return NextResponse.json(
      { error: "Failed to generate", debug: lastLLMError, picks: [] },
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

  await saveAISnapshot("penny", picks);

  return NextResponse.json({
    picks,
    generatedAt: new Date().toISOString(),
    disclaimer:
      "High-risk, high-reward. Small-cap stocks are volatile. Not financial advice.",
  });
}
