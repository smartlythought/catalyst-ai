import { NextResponse } from "next/server";
import { getAccount, ALPACA_IS_PAPER } from "@/lib/trading/alpaca";

export const dynamic = "force-dynamic";

/**
 * Alpaca connection diagnostic. Reads process.env at REQUEST time (not module
 * load) and reports which keys the running build can see — presence only, no
 * values. `build` marks which code version is live.
 */
export async function GET() {
  const build = "alpaca-debug-v3";
  const seen = {
    ALPACA_API_KEY: Boolean(process.env.ALPACA_API_KEY),
    ALPACA_API_SECRET: Boolean(process.env.ALPACA_API_SECRET),
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
    FRED_API_KEY: Boolean(process.env.FRED_API_KEY),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  };

  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    return NextResponse.json({
      build,
      configured: false,
      seen,
      message: "ALPACA_API_KEY / ALPACA_API_SECRET not visible to this build.",
    });
  }

  const account = await getAccount();
  return NextResponse.json({
    build,
    configured: true,
    seen,
    mode: ALPACA_IS_PAPER ? "paper" : "LIVE",
    connected: !!account,
    buyingPower: account?.buyingPower ?? null,
    cash: account?.cash ?? null,
    equity: account?.equity ?? null,
  });
}
