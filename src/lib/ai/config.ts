// Master switch for USER-TRIGGERED AI features — the AI Chat agent, portfolio
// advice, high-yield (penny) generation, and on-demand ecosystem AI. These are
// the heavy, spammable Gemini consumers, so they're DISABLED by default to
// conserve API quota while billing/quota is being sorted out.
//
// The automated Daily Picks (Today's Calls / short & long term) are NOT gated
// by this — they run once per trading day and are the core product.
//
// Uses NEXT_PUBLIC_ so the same flag works in both server routes and client
// components. To re-enable: set NEXT_PUBLIC_USER_AI_ENABLED="true" in Vercel
// and redeploy.
export const USER_AI_ENABLED =
  process.env.NEXT_PUBLIC_USER_AI_ENABLED === "true";

export const USER_AI_DISABLED_MESSAGE =
  "AI chat & on-demand analysis are paused to conserve API quota. Daily Picks and market data are still live.";
