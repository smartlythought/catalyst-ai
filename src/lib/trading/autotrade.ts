import { GEMINI_MODELS, geminiFetch } from "@/lib/ai/models";
import {
  ALPACA_ENABLED,
  ALPACA_IS_PAPER,
  getAccount,
  getHeldSymbols,
  placeBracketBuy,
  type OrderResult,
} from "@/lib/trading/alpaca";

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const POSITION_PCT = parseFloat(process.env.ALPACA_POSITION_PCT || "0.05"); // 5% per trade
const MAX_TRADES = parseInt(process.env.ALPACA_MAX_TRADES || "2", 10);
const MIN_CONVICTION = parseInt(process.env.ALPACA_MIN_CONVICTION || "85", 10);

// Minimal shape we need from a daily pick.
export interface TradablePick {
  symbol: string;
  companyName?: string;
  action: "BUY" | "SELL";
  timeframe: "short-term" | "long-term";
  conviction: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  currentPrice?: number;
  rationale?: string;
}

export interface AutoTradeResult {
  ran: boolean;
  paper: boolean;
  reason?: string;
  candidates: string[];
  selected: string[];
  orders: OrderResult[];
}

/**
 * Final research pass: from the high-conviction shortlist, have the AI pick the
 * single best `MAX_TRADES` short-term BUYs to execute now. Falls back to the
 * top-N by conviction if the model is unavailable.
 */
async function finalResearchSelect(
  shortlist: TradablePick[]
): Promise<TradablePick[]> {
  const byConviction = [...shortlist].sort((a, b) => b.conviction - a.conviction);
  if (shortlist.length <= MAX_TRADES || !GEMINI_KEY) {
    return byConviction.slice(0, MAX_TRADES);
  }
  try {
    const lines = shortlist
      .map(
        (p) =>
          `${p.symbol} conv${p.conviction} entry$${p.entryPrice} tgt$${p.targetPrice} stop$${p.stopLoss} | ${p.rationale || ""}`
      )
      .join("\n");
    const prompt = `You are doing FINAL pre-trade research. From these high-conviction SHORT-TERM BUY candidates, choose the ${MAX_TRADES} best to BUY right now for a 1–4 week trade. Weigh risk/reward, conviction, and how clean the setup is.

CANDIDATES:
${lines}

Return ONLY a JSON object: {"symbols":["X","Y"]} with exactly ${MAX_TRADES} tickers from the list.`;
    for (const model of GEMINI_MODELS) {
      const res = await geminiFetch(model, GEMINI_KEY, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
          maxOutputTokens: 256,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      if (!res?.ok) continue;
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      const parsed = JSON.parse(text);
      const syms: string[] = Array.isArray(parsed?.symbols) ? parsed.symbols : [];
      const picked = syms
        .map((s) => shortlist.find((p) => p.symbol.toUpperCase() === String(s).toUpperCase()))
        .filter((p): p is TradablePick => !!p)
        .slice(0, MAX_TRADES);
      if (picked.length) return picked;
    }
  } catch {
    // fall through to conviction ranking
  }
  return byConviction.slice(0, MAX_TRADES);
}

/**
 * Turn today's picks into automatic PAPER bracket orders:
 *   short-term + BUY + conviction > MIN_CONVICTION → final AI research →
 *   top MAX_TRADES → size by buying power → place bracket (target/stop).
 * Skips symbols already held. Never throws.
 */
export async function autoTradePicks(
  picks: TradablePick[]
): Promise<AutoTradeResult> {
  const base: AutoTradeResult = {
    ran: false,
    paper: ALPACA_IS_PAPER,
    candidates: [],
    selected: [],
    orders: [],
  };
  if (!ALPACA_ENABLED) return { ...base, reason: "Alpaca not configured" };

  try {
    const shortlist = picks.filter(
      (p) =>
        p.timeframe === "short-term" &&
        p.action === "BUY" &&
        p.conviction > MIN_CONVICTION &&
        p.entryPrice > 0 &&
        p.targetPrice > 0 &&
        p.stopLoss > 0
    );
    base.candidates = shortlist.map((p) => p.symbol);
    if (shortlist.length === 0) {
      return { ...base, reason: `No short-term BUYs over ${MIN_CONVICTION}% conviction` };
    }

    const [account, held, selected] = await Promise.all([
      getAccount(),
      getHeldSymbols(),
      finalResearchSelect(shortlist),
    ]);
    base.selected = selected.map((p) => p.symbol);

    if (!account || account.buyingPower <= 0) {
      return { ...base, reason: "No account / buying power" };
    }

    const orders: OrderResult[] = [];
    for (const p of selected) {
      if (held.has(p.symbol.toUpperCase())) {
        orders.push({ symbol: p.symbol, ok: false, qty: 0, error: "already held" });
        continue;
      }
      const price = p.currentPrice && p.currentPrice > 0 ? p.currentPrice : p.entryPrice;
      const notional = account.buyingPower * POSITION_PCT;
      const qty = Math.floor(notional / price);
      if (qty < 1) {
        orders.push({ symbol: p.symbol, ok: false, qty: 0, error: "size < 1 share" });
        continue;
      }
      orders.push(
        await placeBracketBuy({
          symbol: p.symbol,
          qty,
          takeProfit: p.targetPrice,
          stopLoss: p.stopLoss,
        })
      );
    }

    return { ...base, ran: true, orders };
  } catch (e) {
    return { ...base, reason: `auto-trade error: ${String(e).slice(0, 140)}` };
  }
}
