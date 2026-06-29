// Master switch for USER-TRIGGERED AI features — the AI Chat agent, portfolio
// advice, high-yield (penny) generation, and on-demand ecosystem AI. These are
// the heavy, spammable Gemini consumers, so they're DISABLED by default to
// conserve API quota while billing/quota is being sorted out.
//
// The automated Daily Picks (Today's Calls / short & long term) are NOT gated
// by this — they run once per trading day and are the core product.
//
// Uses NEXT_PUBLIC_ so the same flag works in both server routes and client
// components. ENABLED by default now that paid Gemini billing is active — set
// NEXT_PUBLIC_USER_AI_ENABLED="false" in Vercel to pause it again (e.g. if
// costs spike).
export const USER_AI_ENABLED =
  process.env.NEXT_PUBLIC_USER_AI_ENABLED !== "false";

export const USER_AI_DISABLED_MESSAGE =
  "AI chat & on-demand analysis are paused to conserve API quota. Daily Picks and market data are still live.";
