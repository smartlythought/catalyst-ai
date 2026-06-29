import { NextResponse } from "next/server";
import { geminiUrl } from "@/lib/ai/models";
import { yahooBatchQuotes } from "@/lib/ingestion/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const FMP_KEY = process.env.FMP_API_KEY || "";

/**
 * Diagnostic for the picks/penny 502s. Always returns 200 with timings + errors
 * for each dependency, so the real culprit is visible (WebFetch can't read a
 * 502 body). Visit /api/debug/picks.
 */
export async function GET() {
  const out: Record<string, unknown> = {};

  // 1. Yahoo batch — does it work from Vercel's datacenter IPs, or get blocked?
  try {
    const t = Date.now();
    const q = await yahooBatchQuotes(["AAPL", "MSFT", "MU", "KRMN", "NVTS"]);
    out.yahoo = { ms: Date.now() - t, count: q.size, symbols: [...q.keys()] };
  } catch (e) {
    out.yahoo = { error: String(e).slice(0, 200) };
  }

  // 2. FMP batch-quote — the fallback for snapshots.
  try {
    const t = Date.now();
    const res = await fetch(
      `https://financialmodelingprep.com/stable/batch-quote?symbols=AAPL,MSFT,MU&apikey=${FMP_KEY}`,
      { cache: "no-store" }
    );
    const body = res.ok ? await res.json() : null;
    out.fmpBatch = {
      ms: Date.now() - t,
      status: res.status,
      count: Array.isArray(body) ? body.length : null,
    };
  } catch (e) {
    out.fmpBatch = { error: String(e).slice(0, 200) };
  }

  // 3. Gemini JSON-mode call timing — picks/penny use responseMimeType json.
  try {
    const t = Date.now();
    const res = await fetch(geminiUrl("gemini-2.5-flash", GEMINI_KEY), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: 'Return a JSON array of 3 objects, each {"symbol":"X","note":"short"}.',
              },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 512 },
      }),
      signal: AbortSignal.timeout(35000),
    });
    const g: Record<string, unknown> = { ms: Date.now() - t, status: res.status, ok: res.ok };
    if (res.ok) {
      const d = await res.json();
      g.textLen = (d.candidates?.[0]?.content?.parts?.[0]?.text || "").length;
    } else {
      g.body = (await res.text()).slice(0, 200);
    }
    out.geminiJson = g;
  } catch (e) {
    out.geminiJson = { error: String(e).slice(0, 200) };
  }

  return NextResponse.json(out);
}
