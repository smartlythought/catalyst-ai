// Central source of truth for Gemini model IDs.
//
// IMPORTANT: Google retires models on a schedule. gemini-2.0-flash and
// gemini-2.0-flash-lite were SHUT DOWN on 2026-06-01 and now return 404 —
// never use them. As of mid-2026 the supported Flash models are:
//   - gemini-2.5-flash  (stable, best price/performance, low latency)
//   - gemini-3.5-flash  (newer, most capable)
// Both support JSON response mime type and function calling.
//
// Routes should iterate this list so a transient failure on the primary
// model falls back to the next one.
export const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash"] as const;

export const GEMINI_PRIMARY_MODEL = GEMINI_MODELS[0];

/** Build a generateContent URL for a given model. */
export function geminiUrl(model: string, key: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

/**
 * POST to a Gemini model with one automatic retry on a transient 503
 * ("model is experiencing high demand"). Returns the Response (ok or not),
 * or null on a network error. Callers handle non-ok statuses (e.g. 429).
 */
export async function geminiFetch(
  model: string,
  key: string,
  body: unknown,
  timeoutMs = 25_000
): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(geminiUrl(model, key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => null);

    if (!res) return null;
    // 503 = transient overload; brief backoff then one retry.
    if (res.status === 503 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    return res;
  }
  return null;
}
