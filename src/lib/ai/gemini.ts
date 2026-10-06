// Single-stock signal calls + weekly summary. Provider-agnostic via llm.ts
// (file name kept for import stability).
import { generateJSON, lastLLMError } from "@/lib/ai/llm";

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
  const result = await generateJSON<AICallResult>({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input),
    temperature: 0.3,
    maxTokens: 2048,
    timeoutMs: 60_000,
  });
  if (!result) throw new Error(`AI inference failed: ${lastLLMError}`);
  return result;
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

  const result = await generateJSON<{ shortTerm: string[]; longTerm: string[]; summary: string }>({
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.3,
    maxTokens: 2048,
    timeoutMs: 60_000,
  });
  if (!result) throw new Error(`AI inference failed: ${lastLLMError}`);
  return result;
}
