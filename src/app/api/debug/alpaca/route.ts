import { NextResponse } from "next/server";
import { ALPACA_ENABLED, ALPACA_IS_PAPER, getAccount } from "@/lib/trading/alpaca";

export const dynamic = "force-dynamic";
// Redeploy bump: pick up ALPACA_API_KEY / ALPACA_API_SECRET env vars.

/**
 * Diagnostic for the Alpaca connection. Confirms keys are present, whether
 * we're on paper or live, and the account buying power — WITHOUT exposing the
 * keys. Visit /api/debug/alpaca after adding ALPACA_API_KEY / ALPACA_API_SECRET.
 */
export async function GET() {
  if (!ALPACA_ENABLED) {
    return NextResponse.json({
      configured: false,
      message: "ALPACA_API_KEY / ALPACA_API_SECRET not set in this environment.",
    });
  }

  const account = await getAccount();
  return NextResponse.json({
    configured: true,
    mode: ALPACA_IS_PAPER ? "paper" : "LIVE",
    connected: !!account,
    buyingPower: account?.buyingPower ?? null,
    cash: account?.cash ?? null,
    equity: account?.equity ?? null,
    note: account
      ? "Connected. Auto-trade will place paper bracket orders on the next Daily Picks generation."
      : "Keys present but the account call failed — double-check the Key/Secret and that they're PAPER keys.",
  });
}

// deploy: pick up ALPACA keys (set 1757Z)
