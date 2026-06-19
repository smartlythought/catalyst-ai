const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GROQ_KEY = process.env.GROQ_API_KEY || "";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

interface SignalInput {
  ticker: string;
  company: string;
  currentPrice: number;
  signals: {
    source: string;
    title: string;
    detail: string;
    sentiment: string;
  }[];
  analystConsensus?: { buy: number; hold: number; sell: number; avgTarget: number };
  recentPriceAction?: { high: number; low: number; change5d: number };
}

interface AICallResult {
  call: "BUY" | "REDUCE" | "WATCH";
  conviction: number;
  horizon: string;
  entryPrice: number | null;
  targetPrice: number | null;
  stopPrice: number | null;
  riskReward: string | null;
  why: string;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are Catalyst, an AI stock analyst for the US market. You analyze convergent signals — insider trades (Form 4), SEC filings, analyst actions, earnings, options flow, news, and technicals — to generate actionable calls.

Your output must be valid JSON with this exact structure:
{
  "call": "BUY" | "REDUCE" | "WATCH",
  "conviction": <integer 0-100>,
  "horizon": "<time frame, e.g. '2-4 weeks', '1-3 months', 'Earnings Jul 15'>",
  "entryPrice": <number or null>,
  "targetPrice": <number or null>,
  "stopPrice": <number or null>,
  "riskReward": "<ratio like '1:3.5' or null>",
  "why": "<one sentence explaining the call>",
  "reasoning": "<2-3 paragraph detailed analysis>"
}

Rules:
- BUY: Strong bullish signal convergence. Must include entryPrice, targetPrice, stopPrice.
- REDUCE: Bearish signals or deteriorating fundamentals. No price levels needed.
- WATCH: Mixed or insufficient signals, or a pending catalyst. No price levels needed.
- Conviction = signal strength × signal count × signal quality. >85 = very high, 70-85 = high, <70 = moderate.
- Entry should be at/near current price or a nearby support.
- Target should reflect realistic upside based on analyst targets and technicals.
- Stop should be placed at a logical support/risk level — risk:reward >= 1:2.5.
- "why" must be one clear sentence a retail investor can understand.
- Be conservative. When in doubt, WATCH.`;

export async function generateCall(input: SignalInput): Promise<AICallResult> {
  const prompt = buildPrompt(input);

  try {
    return await callGemini(prompt);
  } catch {
    try {
      return await callGroq(prompt);
    } catch (e) {
      throw new Error(`AI inference failed on both Gemini and Groq: ${e}`);
    }
  }
}

function buildPrompt(input: SignalInput): string {
  let prompt = `Analyze ${input.ticker} (${input.company}) at $${input.currentPrice}.\n\n`;
  prompt += `SIGNALS:\n`;
  for (const s of input.signals) {
    prompt += `- [${s.source}] ${s.title}: ${s.detail} (${s.sentiment})\n`;
  }
  if (input.analystConsensus) {
    const ac = input.analystConsensus;
    prompt += `\nANALYST CONSENSUS: ${ac.buy} Buy / ${ac.hold} Hold / ${ac.sell} Sell.`;
    if (ac.avgTarget > 0) {
      prompt += ` Avg Price Target: $${ac.avgTarget.toFixed(2)}`;
    }
    prompt += `\n`;
  }
  if (input.recentPriceAction) {
    const rpa = input.recentPriceAction;
    prompt += `\nPRICE ACTION: 5d high $${rpa.high}, low $${rpa.low}, change ${rpa.change5d}%\n`;
  }
  prompt += `\nGenerate the call JSON:`;
  return prompt;
}

async function callGemini(prompt: string): Promise<AICallResult> {
  if (!GEMINI_KEY) throw new Error("No Gemini API key");

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");

  return JSON.parse(text);
}

async function callGroq(prompt: string): Promise<AICallResult> {
  if (!GROQ_KEY) throw new Error("No Groq API key");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty Groq response");

  return JSON.parse(text);
}

/**
 * Generate weekly picks summary
 */
export async function generateWeeklyPicks(
  callsWithData: {
    ticker: string;
    call: string;
    conviction: number;
    why: string;
    changePercent: number;
  }[]
): Promise<{
  shortTerm: string[];
  longTerm: string[];
  summary: string;
}> {
  const prompt = `Given these active BUY calls, select the top 5 short-term (1-4 weeks) and top 5 long-term (1-6 months) picks. Rank by conviction and signal quality.

ACTIVE CALLS:
${callsWithData.map((c) => `${c.ticker}: ${c.call} @ ${c.conviction}% conviction. ${c.why}`).join("\n")}

Return JSON:
{
  "shortTerm": ["TICKER1", "TICKER2", ...],
  "longTerm": ["TICKER1", "TICKER2", ...],
  "summary": "One paragraph market summary"
}`;

  try {
    const result = await callGemini(prompt);
    return result as unknown as { shortTerm: string[]; longTerm: string[]; summary: string };
  } catch {
    const result = await callGroq(prompt);
    return result as unknown as { shortTerm: string[]; longTerm: string[]; summary: string };
  }
}
