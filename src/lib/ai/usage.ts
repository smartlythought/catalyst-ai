import { createServiceClient } from "@/lib/supabase/server";

// Daily ceiling on on-demand AI requests. 0 (or unset → default) disables the
// app-side guard. This counts route invocations, not individual model calls
// (the agent may make several per request), so treat it as a coarse safety
// net — the precise hard cap is the Gemini API daily quota in Google Cloud.
const DAILY_LIMIT = parseInt(process.env.GEMINI_DAILY_CALL_LIMIT || "500", 10);

function todayET(): string {
  const now = new Date();
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  return et.toISOString().split("T")[0];
}

/**
 * Atomically record one AI request and report whether we're still within the
 * daily budget.
 *
 * FAIL-OPEN by design: any infrastructure problem (migration not yet applied,
 * RPC missing, DB unreachable) returns `true` so this guard can never take AI
 * features down on its own. The Google Cloud daily quota is the real hard stop;
 * this only protects against runaway/abuse loops spiking the bill.
 */
export async function withinDailyAIBudget(): Promise<boolean> {
  if (!Number.isFinite(DAILY_LIMIT) || DAILY_LIMIT <= 0) return true;
  try {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc("increment_ai_usage", {
      p_date: todayET(),
    });
    if (error) {
      console.log("[ai-budget] counter error (fail-open):", error.message);
      return true;
    }
    return typeof data === "number" ? data <= DAILY_LIMIT : true;
  } catch (e) {
    console.log("[ai-budget] guard exception (fail-open):", e);
    return true;
  }
}

/** Standard payload for a budget-exceeded response. */
export const AI_BUDGET_MESSAGE =
  "Daily AI limit reached for today — this resets tomorrow. (Cost guard.)";
