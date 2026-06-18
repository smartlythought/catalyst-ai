import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const SYSTEM_PROMPT = `You are Catalyst AI, an intelligent stock market assistant. You help users understand market signals, stock analysis, and investment concepts.

Rules:
- Be concise and direct. Retail investors want clarity, not walls of text.
- When discussing specific stocks, reference the data provided in context.
- Always include a disclaimer that you are NOT a financial advisor.
- Never recommend specific buy/sell actions without noting this is AI-generated analysis, not personalized advice.
- Use plain language. Explain jargon when you use it.
- Format responses with markdown for readability.
- Keep responses under 300 words unless the user asks for detail.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, ticker } = await request.json();
  if (!message) {
    return NextResponse.json({ error: "No message" }, { status: 400 });
  }

  let context = "";
  if (ticker) {
    const svc = createServiceClient();
    const { data: tickerData } = await svc
      .from("tickers")
      .select("id, symbol, company_name, sector, industry")
      .eq("symbol", ticker.toUpperCase())
      .single();

    if (tickerData) {
      const { data: latestCall } = await svc
        .from("calls")
        .select("call, conviction, why, ai_reasoning, horizon, entry_price, target_price, stop_price")
        .eq("ticker_id", tickerData.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const { data: recentSignals } = await svc
        .from("signals")
        .select("source, title, detail, sentiment, signal_date")
        .eq("ticker_id", tickerData.id)
        .order("signal_date", { ascending: false })
        .limit(10);

      context = `\nCONTEXT for ${tickerData.symbol} (${tickerData.company_name}):`;
      context += `\nSector: ${tickerData.sector || "N/A"} | Industry: ${tickerData.industry || "N/A"}`;

      if (latestCall) {
        context += `\n\nLatest AI Call: ${latestCall.call} @ ${latestCall.conviction}% conviction`;
        context += `\nHorizon: ${latestCall.horizon}`;
        if (latestCall.entry_price) context += `\nEntry: $${latestCall.entry_price} | Target: $${latestCall.target_price} | Stop: $${latestCall.stop_price}`;
        context += `\nWhy: ${latestCall.why}`;
        context += `\nFull analysis: ${latestCall.ai_reasoning}`;
      }

      if (recentSignals?.length) {
        context += `\n\nRecent signals:`;
        for (const s of recentSignals) {
          context += `\n- [${s.source}] ${s.title} (${s.sentiment}) — ${s.signal_date}`;
        }
      }
    }
  }

  const prompt = context
    ? `${context}\n\nUser question: ${message}`
    : message;

  if (!GEMINI_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, topP: 0.9 },
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }

    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't generate a response.";

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ error: "AI service unavailable" }, { status: 503 });
  }
}
