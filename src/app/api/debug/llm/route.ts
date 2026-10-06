import { NextResponse } from "next/server";
import { activeProviders, probeModel } from "@/lib/ai/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Provider diagnostics. Never returns key values — only lengths.
//   GET                 → which provider/models are active
//   GET ?test=1         → tiny JSON test on every configured model (latency)
//   GET ?bench=1        → realistic Daily-Picks-sized prompt on the first model
// Tests are rate-limited to one per minute so the endpoint can't be abused.
let lastRun = 0;

function fakeUniverse(n: number): string {
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    const px = (20 + ((i * 37) % 480)).toFixed(2);
    const chg = (((i * 13) % 11) - 5).toFixed(2);
    lines.push(
      `SYM${i} | $${px} | ${chg}% | PE:${(10 + (i % 40)).toFixed(1)} | MCap:$${5 + (i % 300)}B | 52wH:$${(Number(px) * 1.2).toFixed(2)} | Analyst:${(1.5 + (i % 3) * 0.5).toFixed(1)}`
    );
  }
  return lines.join("\n");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const providers = activeProviders();
  const config = {
    aiProvider: process.env.AI_PROVIDER || "(auto)",
    geminiFallback: process.env.AI_GEMINI_FALLBACK === "true",
    providers: providers.map((p) => ({ name: p.name, models: p.models, keyLength: p.key.length })),
  };

  const wantTest = url.searchParams.get("test") === "1";
  const wantBench = url.searchParams.get("bench") === "1";
  if (!wantTest && !wantBench) return NextResponse.json(config);

  if (Date.now() - lastRun < 60_000) {
    return NextResponse.json({ ...config, error: "Rate-limited: one test per minute." }, { status: 429 });
  }
  lastRun = Date.now();
  if (!providers.length) return NextResponse.json({ ...config, error: "No AI provider key set." });

  if (wantBench) {
    const p = providers[0];
    const model = url.searchParams.get("model") || p.models[0];
    const prompt = `Below are 200 stocks. Select exactly 10 for short-term trades.
${fakeUniverse(200)}

Return a JSON array of 10 objects with: "symbol", "action" (BUY/SELL), "entryPrice", "targetPrice", "stopLoss", "conviction" (50-95), "rationale" (2 sentences), "catalysts" (array of 2). Return ONLY the JSON array.`;
    const r = await probeModel(p.name, model, {
      prompt,
      json: true,
      temperature: 0.35,
      maxTokens: 8192,
      timeoutMs: 240_000,
    });
    return NextResponse.json({
      ...config,
      bench: {
        provider: p.name,
        model,
        ok: r.ok,
        seconds: +(r.ms / 1000).toFixed(1),
        picks: Array.isArray(r.json) ? r.json.length : 0,
        error: r.error,
        preview: r.preview,
      },
    });
  }

  const results = [];
  for (const p of providers) {
    for (const model of p.models) {
      const r = await probeModel(p.name, model, {
        prompt: 'Reply with this JSON exactly: {"ok": true}',
        json: true,
        temperature: 0,
        maxTokens: 64,
        timeoutMs: 60_000,
      });
      results.push({ provider: p.name, model, ok: r.ok, seconds: +(r.ms / 1000).toFixed(1), error: r.error });
    }
  }
  return NextResponse.json({ ...config, results });
}
