import { NextRequest, NextResponse } from "next/server";
import { GEMINI_MODELS, geminiFetch } from "@/lib/ai/models";

interface HoldingInput {
  ticker: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

interface AdviceItem {
  ticker: string;
  action: "HOLD" | "ADD" | "TRIM" | "EXIT";
  reason: string;
  urgency: "low" | "medium" | "high";
}

interface AdviceResponse {
  advice: AdviceItem[];
  summary: string;
}

export async function POST(request: NextRequest) {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_KEY) {
    return NextResponse.json(
      { error: "Gemini API key not configured" },
      { status: 500 }
    );
  }

  let holdings: HoldingInput[];
  try {
    const body = await request.json();
    holdings = body.holdings;
    if (!Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json(
        { error: "No holdings provided" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const totalValue = holdings.reduce(
    (sum, h) => sum + h.shares * h.currentPrice,
    0
  );

  const holdingsSummary = holdings
    .map((h) => {
      const weight = totalValue > 0
        ? ((h.shares * h.currentPrice) / totalValue * 100).toFixed(1)
        : "0";
      return `- ${h.ticker}: ${h.shares} shares, avg cost $${h.avgCost.toFixed(2)}, current $${h.currentPrice.toFixed(2)}, P&L ${h.pnl >= 0 ? "+" : ""}$${h.pnl.toFixed(2)} (${h.pnlPercent >= 0 ? "+" : ""}${h.pnlPercent.toFixed(1)}%), portfolio weight ${weight}%`;
    })
    .join("\n");

  const today = new Date().toISOString().split("T")[0];

  const prompt = `You are Catalyst, an AI portfolio advisor for US equities. Today is ${today}. Analyze this portfolio and provide actionable advice.

PORTFOLIO (Total value: $${totalValue.toFixed(2)}):
${holdingsSummary}

Analyze considering:
1. Current market sentiment and macro conditions
2. Individual stock positions — identify biggest winners and losers
3. Portfolio concentration risk — flag if any single position is >30% of portfolio
4. Risk management — positions with large unrealized losses or gains

For each holding, recommend one action:
- HOLD: Position is well-sized and thesis intact
- ADD: Good entry point to increase position
- TRIM: Take some profits or reduce overweight position
- EXIT: Close position due to deteriorating outlook or excessive risk

Return JSON with this exact structure:
{
  "advice": [
    {
      "ticker": "AAPL",
      "action": "HOLD" | "ADD" | "TRIM" | "EXIT",
      "reason": "Brief 1-2 sentence explanation",
      "urgency": "low" | "medium" | "high"
    }
  ],
  "summary": "2-3 sentence portfolio overview with key observations and overall recommendation"
}

Rules:
- Include advice for EVERY holding in the portfolio
- Be specific and actionable — avoid generic advice
- Flag concentration risk if any position is >30%
- Consider tax implications for positions with large gains
- Be conservative — when in doubt, HOLD
- urgency: high = act within days, medium = act within 1-2 weeks, low = no rush`;

  try {
    // Try each supported model in turn so a transient failure or a retired
    // model doesn't take the whole feature down.
    let rawText = "";
    let lastStatus = 0;
    let lastErr = "";
    for (const model of GEMINI_MODELS) {
      const geminiRes = await geminiFetch(model, GEMINI_KEY, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.4,
        },
      });

      if (!geminiRes) {
        lastErr = `${model}: network error`;
        continue;
      }
      if (!geminiRes.ok) {
        lastStatus = geminiRes.status;
        lastErr = `${model}: ${geminiRes.status} ${(await geminiRes.text()).slice(0, 200)}`;
        console.error("[portfolio/advice] Gemini error:", lastErr);
        continue;
      }
      const geminiData = await geminiRes.json();
      rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (rawText) break;
      lastErr = `${model}: empty response`;
    }

    if (!rawText) {
      // 429 = rate limited/quota; surface a clearer hint to the client.
      const hint =
        lastStatus === 429
          ? "AI is rate-limited right now — try again in a minute."
          : "AI couldn't generate advice. Check the AI service status.";
      console.error("[portfolio/advice] all models failed:", lastErr);
      return NextResponse.json({ error: hint }, { status: 502 });
    }

    let result: AdviceResponse;
    try {
      result = JSON.parse(rawText);
    } catch {
      console.error(
        "Failed to parse Gemini response:",
        rawText.slice(0, 500)
      );
      return NextResponse.json(
        { error: "Invalid AI response format" },
        { status: 502 }
      );
    }

    if (!result.advice || !Array.isArray(result.advice)) {
      return NextResponse.json(
        { error: "Malformed AI response" },
        { status: 502 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Portfolio advice error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
