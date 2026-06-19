import { NextResponse } from "next/server";

export const revalidate = 3600;

interface Pick {
  symbol: string;
  companyName: string;
  action: "BUY" | "SELL";
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  timeframe: "short-term" | "long-term";
  conviction: number;
  rationale: string;
  catalysts: string[];
  currentPrice?: number;
}

export async function GET() {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

  if (!GEMINI_KEY) {
    return NextResponse.json(
      { error: "Gemini API key not configured" },
      { status: 500 }
    );
  }

  try {
    /* ── Step 1: Ask Gemini for top 10 picks ── */
    const today = new Date().toISOString().split("T")[0];

    const prompt = `You are an expert stock analyst. Today is ${today}. Analyze current market conditions for major US stocks and provide exactly 10 actionable stock recommendations (mix of BUY and SELL).

For each pick, consider:
- Technical indicators (RSI, MACD, moving averages, volume trends)
- Fundamental factors (earnings, revenue growth, valuation metrics)
- Sector momentum and macro environment
- Recent catalysts (earnings reports, product launches, regulatory changes)

Return a JSON array of exactly 10 objects. Each object must have:
- "symbol": stock ticker (e.g. "AAPL")
- "companyName": full company name
- "action": "BUY" or "SELL"
- "entryPrice": recommended entry price (realistic current market price)
- "targetPrice": price target (for BUY: higher than entry; for SELL: lower than entry)
- "stopLoss": stop loss price (for BUY: below entry; for SELL: above entry)
- "timeframe": "short-term" (1-4 weeks) or "long-term" (1-6 months)
- "conviction": integer 0-100 representing confidence level
- "rationale": 1-2 sentence explanation
- "catalysts": array of 2-3 short catalyst strings

Include a mix of:
- 6-8 BUY recommendations and 2-4 SELL recommendations
- 4-6 short-term and 4-6 long-term picks
- Large cap, mid cap diversity
- Different sectors

Return ONLY the JSON array, no markdown or extra text.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", errText);
      return NextResponse.json(
        { error: "Failed to generate picks" },
        { status: 502 }
      );
    }

    const geminiData = await geminiRes.json();
    const rawText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

    let picks: Pick[];
    try {
      picks = JSON.parse(rawText);
    } catch {
      console.error("Failed to parse Gemini response:", rawText.slice(0, 500));
      return NextResponse.json(
        { error: "Invalid AI response format" },
        { status: 502 }
      );
    }

    if (!Array.isArray(picks) || picks.length === 0) {
      return NextResponse.json(
        { error: "No picks generated" },
        { status: 502 }
      );
    }

    /* ── Step 2: Fetch live quotes from Finnhub ── */
    if (FINNHUB_KEY) {
      const quotePromises = picks.map(async (pick) => {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${pick.symbol}&token=${FINNHUB_KEY}`,
            { next: { revalidate: 300 } }
          );
          if (res.ok) {
            const q = await res.json();
            if (q.c && q.c > 0) {
              pick.currentPrice = q.c;
            }
          }
        } catch {
          // Finnhub failure is non-critical; skip
        }
      });

      await Promise.allSettled(quotePromises);
    }

    return NextResponse.json({
      picks,
      generatedAt: new Date().toISOString(),
      disclaimer:
        "AI-generated recommendations for informational purposes only. Not financial advice.",
    });
  } catch (err) {
    console.error("Picks generation error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
