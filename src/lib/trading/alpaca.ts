// Alpaca trading client. PAPER by default — live trading only if
// ALPACA_BASE_URL is explicitly set to the live endpoint. All functions
// no-op / return safe defaults when keys are absent, so nothing breaks.
const KEY = process.env.ALPACA_API_KEY || "";
const SECRET = process.env.ALPACA_API_SECRET || "";
// Default to the PAPER endpoint. Set ALPACA_BASE_URL to the live URL only when
// you deliberately want real-money trading.
const BASE =
  process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";

export const ALPACA_ENABLED = Boolean(KEY && SECRET);
export const ALPACA_IS_PAPER = BASE.includes("paper-api");

function headers() {
  return {
    "APCA-API-KEY-ID": KEY,
    "APCA-API-SECRET-KEY": SECRET,
    "Content-Type": "application/json",
  };
}

export interface AlpacaAccount {
  buyingPower: number;
  cash: number;
  equity: number;
}

export async function getAccount(): Promise<AlpacaAccount | null> {
  if (!ALPACA_ENABLED) return null;
  try {
    const res = await fetch(`${BASE}/v2/account`, { headers: headers() });
    if (!res.ok) return null;
    const a = await res.json();
    return {
      buyingPower: parseFloat(a.buying_power) || 0,
      cash: parseFloat(a.cash) || 0,
      equity: parseFloat(a.equity) || 0,
    };
  } catch {
    return null;
  }
}

/** Symbols with an open position (so we don't double-buy). */
export async function getHeldSymbols(): Promise<Set<string>> {
  if (!ALPACA_ENABLED) return new Set();
  try {
    const res = await fetch(`${BASE}/v2/positions`, { headers: headers() });
    if (!res.ok) return new Set();
    const arr = await res.json();
    return new Set(
      (Array.isArray(arr) ? arr : []).map((p: any) =>
        String(p.symbol).toUpperCase()
      )
    );
  } catch {
    return new Set();
  }
}

export interface BracketOrderInput {
  symbol: string;
  qty: number;
  takeProfit: number; // limit price
  stopLoss: number; // stop price
}

export interface OrderResult {
  symbol: string;
  ok: boolean;
  qty: number;
  orderId?: string;
  error?: string;
}

/**
 * Place a market BUY with a bracket (take-profit + stop-loss) — maps directly
 * to a pick's target / stop. TIF "day" so a pre-market order queues for the
 * open. Returns a structured result; never throws.
 */
export async function placeBracketBuy(
  o: BracketOrderInput
): Promise<OrderResult> {
  if (!ALPACA_ENABLED) {
    return { symbol: o.symbol, ok: false, qty: o.qty, error: "Alpaca not configured" };
  }
  try {
    const res = await fetch(`${BASE}/v2/orders`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        symbol: o.symbol,
        qty: o.qty,
        side: "buy",
        type: "market",
        time_in_force: "day",
        order_class: "bracket",
        take_profit: { limit_price: Number(o.takeProfit.toFixed(2)) },
        stop_loss: { stop_price: Number(o.stopLoss.toFixed(2)) },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        symbol: o.symbol,
        ok: false,
        qty: o.qty,
        error: `${res.status}: ${(data?.message || JSON.stringify(data)).slice(0, 160)}`,
      };
    }
    return { symbol: o.symbol, ok: true, qty: o.qty, orderId: data.id };
  } catch (e) {
    return { symbol: o.symbol, ok: false, qty: o.qty, error: String(e).slice(0, 160) };
  }
}
