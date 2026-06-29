import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getQuote, getAnalystRatings, getCompanyProfile } from "@/lib/ingestion/market-data";
import { getCompanyNews } from "@/lib/ingestion/news";
import { runResearchAgent } from "@/lib/ai/agent";
import { GEMINI_MODELS, geminiFetch } from "@/lib/ai/models";
import { withinDailyAIBudget, AI_BUDGET_MESSAGE } from "@/lib/ai/usage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

const SYSTEM_PROMPT = `You are Catalyst AI — an expert stock market analyst that produces institutional-grade research. You combine data from multiple sources (SEC filings, analyst consensus, technical analysis, news sentiment) into honest, clear analysis.

## Response Style
- Write like a senior equity analyst briefing a retail investor who is smart but not a professional
- Be HONEST about bull AND bear cases — never one-sided
- Use markdown formatting: headers, bold for key numbers, bullet points
- Include specific numbers, dates, and sources when available
- Always end with a clear actionable summary (not wishy-washy)

## Analysis Framework (when asked about a specific stock)
Structure your analysis like this:

### Current Snapshot
Key metrics: price, market cap, P/E or P/S, 52-week range, sector

### The Central Question
What is the one key tension or decision point for this stock right now?

### What's Working (Bull Case)
- 3-5 specific, data-backed bull points
- Include growth rates, margins, competitive advantages

### What's Concerning (Bear Case)
- 3-5 specific, data-backed bear points
- Include valuation concerns, execution risks, competitive threats

### Analyst Consensus
If analyst data is available, summarize: # of analysts, mean PT, implied upside/downside

### Verdict
Clear BUY / HOLD / REDUCE recommendation with conviction level and time horizon
- Short-term (1-3 months)
- Medium-term (6-12 months)
- Long-term (1-3 years)

## Ecosystem Analysis (when asked about ecosystem/partners)
When users ask about a company's ecosystem:
- Map the relationship network: suppliers, customers, partners, competitors, investors
- Identify the highest-signal relationships (equity stakes > named partnerships > standard ecosystem)
- Note competitive dynamics (coopetition, supply chain concentration)
- Suggest ecosystem plays: which partners benefit most from the parent company's growth?

## Comparative Analysis (when comparing stocks)
- Side-by-side metrics table
- Identify the best risk/reward setup
- Rank by investment archetype: Value Compounder, Growth at Reasonable Price, Momentum, Speculative

## Important Rules
- ALWAYS include: "This is AI-generated analysis, not personalized financial advice. Do your own research."
- Never fabricate specific price targets or numbers you don't have data for
- If data is limited, say so — don't fill gaps with speculation
- Distinguish between FACTS (from data) and OPINIONS (your analysis)
- Reference specific data points from the context when available`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, ticker, mode, history } = await request.json();
  if (!message) {
    return NextResponse.json({ error: "No message" }, { status: 400 });
  }

  if (!GEMINI_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  if (!(await withinDailyAIBudget())) {
    return NextResponse.json({ error: AI_BUDGET_MESSAGE }, { status: 429 });
  }

  const svc = createServiceClient();

  // Primary path: the agentic research bot — it dynamically calls tools
  // (quote, financials, news, insider trades, ecosystem, …) to ground its
  // answer. Falls through to the legacy context-dump below on hard failure.
  try {
    const agentResult = await runResearchAgent({
      message,
      ticker,
      history: Array.isArray(history) ? history : [],
      ctx: { supabase: svc },
    });
    if (agentResult) {
      return NextResponse.json({
        reply: agentResult.reply,
        toolsUsed: agentResult.toolsUsed,
      });
    }
  } catch (e) {
    console.log("[chat] agent failed, falling back:", e);
  }

  let context = "";

  if (ticker) {
    const symbol = ticker.toUpperCase();
    context = await buildStockContext(svc, symbol, mode);
  }

  // Check if user is asking about multiple tickers (comparison)
  const tickerPattern = /\b([A-Z]{1,5})\b/g;
  const STOP_WORDS = new Set(["THE", "AND", "FOR", "NOT", "BUT", "ARE", "HAS", "WAS", "THIS", "THAT", "WITH", "FROM", "HAVE", "WILL", "CAN", "ALL", "ANY", "HOW", "WHY", "BUY", "SELL"]);
  const rawMatches: string[] = (message as string).match(tickerPattern) || [];
  const mentionedTickers: string[] = [...new Set(
    rawMatches.filter((t) => t.length >= 2 && t.length <= 5 && !STOP_WORDS.has(t))
  )];

  if (!ticker && mentionedTickers.length > 0 && mentionedTickers.length <= 5) {
    for (const sym of mentionedTickers) {
      const miniCtx = await buildMiniContext(svc, sym);
      if (miniCtx) context += miniCtx;
    }
  }

  const prompt = context
    ? `${context}\n\nUser question: ${message}`
    : message;

  // Legacy single-shot fallback (used only if the agent path returned null).
  try {
    let reply = "";
    let lastStatus = 0;
    let lastErr = "";
    for (const model of GEMINI_MODELS) {
      const res = await geminiFetch(model, GEMINI_KEY, {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 4096,
        },
      });

      if (!res) {
        lastErr = `${model}: network error`;
        continue;
      }
      if (!res.ok) {
        lastStatus = res.status;
        lastErr = `${model}: ${res.status} ${(await res.text()).slice(0, 200)}`;
        console.error("[chat] Gemini error:", lastErr);
        continue;
      }
      const data = await res.json();
      reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (reply) break;
      lastErr = `${model}: empty response`;
    }

    if (!reply) {
      console.error("[chat] all models failed:", lastErr);
      const hint =
        lastStatus === 429
          ? "AI is rate-limited right now — try again in a minute."
          : "AI request failed — the AI service may be unavailable or the API key needs attention.";
      return NextResponse.json({ error: hint }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ error: "AI service unavailable" }, { status: 503 });
  }
}

async function buildStockContext(supabase: any, symbol: string, mode?: string): Promise<string> {
  const { data: tickerData } = await supabase
    .from("tickers")
    .select("id, symbol, company_name, sector, industry, exchange, cik")
    .eq("symbol", symbol)
    .single();

  if (!tickerData) return "";

  let context = `\n=== DATA CONTEXT for ${tickerData.symbol} (${tickerData.company_name}) ===`;
  context += `\nSector: ${tickerData.sector || "N/A"} | Industry: ${tickerData.industry || "N/A"} | Exchange: ${tickerData.exchange || "N/A"}`;

  // Fetch live quote
  const quote = await getQuote(symbol).catch(() => null);
  if (quote) {
    context += `\n\nLIVE QUOTE:`;
    context += `\n  Price: $${quote.price.toFixed(2)}`;
    context += `\n  Change: ${quote.change >= 0 ? "+" : ""}$${quote.change.toFixed(2)} (${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%)`;
    context += `\n  Day range: $${quote.low.toFixed(2)} - $${quote.high.toFixed(2)}`;
    context += `\n  Previous close: $${quote.previousClose.toFixed(2)}`;
  }

  // Fetch company profile
  const profile = await getCompanyProfile(symbol).catch(() => null);
  if (profile) {
    context += `\n\nCOMPANY PROFILE:`;
    context += `\n  Market Cap: $${(profile.marketCap / 1e9).toFixed(1)}B`;
    if (profile.pe > 0) context += `\n  P/E Ratio: ${profile.pe.toFixed(1)}`;
    if (profile.week52High > 0) context += `\n  52-Week Range: $${profile.week52Low.toFixed(2)} - $${profile.week52High.toFixed(2)}`;
    if (profile.description) context += `\n  Description: ${profile.description.slice(0, 300)}`;
  }

  // Fetch analyst ratings
  const analysts = await getAnalystRatings(symbol).catch(() => null);
  if (analysts) {
    context += `\n\nANALYST RATINGS (Finnhub):`;
    context += `\n  Strong Buy: ${analysts.strongBuy} | Buy: ${analysts.buy} | Hold: ${analysts.hold} | Sell: ${analysts.sell} | Strong Sell: ${analysts.strongSell}`;
    context += `\n  Period: ${analysts.period}`;
    const total = analysts.strongBuy + analysts.buy + analysts.hold + analysts.sell + analysts.strongSell;
    const bullish = analysts.strongBuy + analysts.buy;
    if (total > 0) context += `\n  Bullish: ${Math.round(bullish / total * 100)}% of ${total} analysts`;
  }

  // Get latest AI call from our system
  const { data: latestCall } = await supabase
    .from("calls")
    .select("call, conviction, why, ai_reasoning, horizon, entry_price, target_price, stop_price, price_at_call, created_at")
    .eq("ticker_id", tickerData.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latestCall) {
    context += `\n\nCATALYST AI SIGNAL:`;
    context += `\n  Call: ${latestCall.call} @ ${latestCall.conviction}% conviction`;
    context += `\n  Horizon: ${latestCall.horizon}`;
    if (latestCall.price_at_call) context += `\n  Price at call: $${latestCall.price_at_call}`;
    if (latestCall.entry_price) context += `\n  Entry: $${latestCall.entry_price} | Target: $${latestCall.target_price} | Stop: $${latestCall.stop_price}`;
    context += `\n  Why: ${latestCall.why}`;
    if (latestCall.ai_reasoning) context += `\n  Full analysis: ${latestCall.ai_reasoning.slice(0, 500)}`;
    context += `\n  Generated: ${latestCall.created_at}`;
  }

  // Get recent signals
  const { data: recentSignals } = await supabase
    .from("signals")
    .select("source, title, detail, sentiment, signal_date")
    .eq("ticker_id", tickerData.id)
    .order("signal_date", { ascending: false })
    .limit(15);

  if (recentSignals?.length) {
    context += `\n\nRECENT SIGNALS (${recentSignals.length}):`;
    for (const s of recentSignals) {
      context += `\n  [${s.source}] ${s.title} (${s.sentiment}) — ${s.signal_date}`;
      if (s.detail) context += `\n    ${s.detail.slice(0, 150)}`;
    }
  }

  // Get insider trades
  const { data: insiderTrades } = await supabase
    .from("insider_trades")
    .select("filer_name, filer_role, trade_type, shares, price_per_share, total_value, filing_date")
    .eq("ticker_symbol", symbol)
    .order("filing_date", { ascending: false })
    .limit(5);

  if (insiderTrades?.length) {
    context += `\n\nINSIDER TRADES (recent ${insiderTrades.length}):`;
    for (const t of insiderTrades) {
      const action = t.trade_type === "P" ? "BOUGHT" : "SOLD";
      context += `\n  ${t.filer_role} ${t.filer_name} ${action} ${t.shares?.toLocaleString()} shares @ $${t.price_per_share?.toFixed(2)} ($${((t.total_value || 0) / 1e6).toFixed(1)}M) — ${t.filing_date}`;
    }
  }

  // Get recent news
  if (mode !== "quick") {
    const news = await getCompanyNews(symbol, 5).catch(() => []);
    if (news.length > 0) {
      context += `\n\nRECENT NEWS (${news.length} articles):`;
      for (const n of news.slice(0, 8)) {
        context += `\n  [${n.sentiment.toUpperCase()}] ${n.title} — ${n.source} (${n.publishedAt.split("T")[0]})`;
      }
    }
  }

  return context;
}

async function buildMiniContext(supabase: any, symbol: string): Promise<string> {
  const { data: tickerData } = await supabase
    .from("tickers")
    .select("id, symbol, company_name, sector")
    .eq("symbol", symbol)
    .single();

  if (!tickerData) return "";

  let ctx = `\n\n--- ${tickerData.symbol} (${tickerData.company_name}) ---`;
  ctx += `\nSector: ${tickerData.sector || "N/A"}`;

  const { data: latestCall } = await supabase
    .from("calls")
    .select("call, conviction, why, price_at_call")
    .eq("ticker_id", tickerData.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latestCall) {
    ctx += `\n  Signal: ${latestCall.call} @ ${latestCall.conviction}% conviction`;
    if (latestCall.price_at_call) ctx += ` (price: $${latestCall.price_at_call})`;
    ctx += `\n  Why: ${latestCall.why}`;
  }

  return ctx;
}
