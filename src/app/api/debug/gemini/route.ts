import { NextResponse } from "next/server";
import { GEMINI_MODELS, geminiUrl } from "@/lib/ai/models";

export const dynamic = "force-dynamic";

/**
 * Diagnostic: pings each supported Gemini model with a trivial prompt and
 * reports the raw status, so we can tell whether the production key is
 * invalid (400/403), rate-limited/quota'd (429), or hitting a retired model
 * (404). Visit /api/debug/gemini in the browser.
 *
 * Does NOT leak the API key — only reports whether it is present.
 */
export async function GET() {
  const key = process.env.GEMINI_API_KEY || "";
  if (!key) {
    return NextResponse.json({
      keyPresent: false,
      message: "GEMINI_API_KEY is not set in this environment.",
    });
  }

  const results = await Promise.all(
    GEMINI_MODELS.map(async (model) => {
      try {
        const res = await fetch(geminiUrl(model, key), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Reply with the single word: ok" }] }],
            generationConfig: { maxOutputTokens: 10 },
          }),
          signal: AbortSignal.timeout(15000),
        });
        const ok = res.ok;
        let detail = "";
        if (!ok) {
          // Trim and strip any echoed key just in case.
          detail = (await res.text()).slice(0, 300).replaceAll(key, "***");
        }
        return { model, ok, status: res.status, detail };
      } catch (e) {
        return { model, ok: false, status: 0, detail: String(e).slice(0, 200) };
      }
    })
  );

  const anyOk = results.some((r) => r.ok);
  return NextResponse.json({
    keyPresent: true,
    keyLength: key.length,
    anyModelWorking: anyOk,
    verdict: anyOk
      ? "At least one model works — AI features should function."
      : "No model responded. See per-model status: 400/403 = key invalid or restricted, 429 = quota/rate limit, 404 = model unavailable.",
    models: results,
  });
}
