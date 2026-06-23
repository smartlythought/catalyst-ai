import {
  getQuote,
  getCompanyProfile,
  getAnalystRatings,
  getPriceTarget,
  getHistoricalPrices,
} from "@/lib/ingestion/market-data";
import { getCompanyNews } from "@/lib/ingestion/news";
import { getEcosystemMap } from "@/lib/ingestion/ecosystem";
import { GEMINI_MODELS, geminiFetch } from "@/lib/ai/models";

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const FMP_KEY = process.env.FMP_API_KEY || "";

// Primary model + fallback, mirroring the rest of the app.
const MODELS = GEMINI_MODELS;
const MAX_ITERATIONS = 5;
const TOOL_TIMEOUT_MS = 12_000;
const GEMINI_TIMEOUT_MS = 25_000;

const DISCLAIMER =
  "This is AI-generated analysis, not personalized financial advice. Do your own research.";

const SYSTEM_PROMPT = `You are Catalyst AI — an expert US equity research analyst. You answer questions by CALLING TOOLS to gather live data, then reasoning over what you find. Never invent numbers: if you need a price, financials, ratings, news, insider activity, or ecosystem data, call the matching tool first.

## How to work
- Decide which tools the question actually needs, then call them. You may call several tools (in one turn or across turns).
- For a single-stock deep dive, typically gather: quote, company profile, analyst ratings, and either financials or recent news depending on the question.
- For comparisons, gather the same core data for each ticker before concluding.
- Only call tools for tickers relevant to the question. Don't over-fetch.
- If a tool returns no data, say so honestly rather than guessing.

## Response style
- Write like a senior analyst briefing a smart retail investor. Markdown: headers, **bold** key numbers, bullets.
- Always present BOTH the bull and bear case — never one-sided.
- Distinguish FACTS (from tool data) from your OPINION (analysis).
- End single-stock answers with a clear verdict: BUY / HOLD / REDUCE, a conviction level, and a time horizon.
- Always include this exact line at the very end: "${DISCLAIMER}"`;

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export interface AgentContext {
  supabase: any;
}

interface AgentTool {
  declaration: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
  execute: (args: any, ctx: AgentContext) => Promise<unknown>;
}

const SYMBOL_PARAM = {
  symbol: {
    type: "string",
    description: "US stock ticker symbol, e.g. AAPL, MU, NVDA.",
  },
};

/** Compact 5-year income-statement trend from FMP (stable, falling back to v3). */
async function fetchAnnualFinancials(symbol: string) {
  if (!FMP_KEY) return [];
  const tryFetch = async (url: string) => {
    const res = await fetch(url, { next: { revalidate: 86400 } }).catch(
      () => null
    );
    if (!res?.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : null;
  };

  const rows =
    (await tryFetch(
      `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&period=annual&limit=5&apikey=${FMP_KEY}`
    )) ||
    (await tryFetch(
      `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?period=annual&limit=5&apikey=${FMP_KEY}`
    ));

  if (!rows) return [];

  // Oldest-first so YoY growth reads naturally.
  const ordered = [...rows].reverse();
  return ordered.map((r: any, i: number) => {
    const revenue = r.revenue || 0;
    const prev = ordered[i - 1]?.revenue;
    return {
      year: parseInt(r.calendarYear || r.date?.split("-")[0] || "0"),
      revenue,
      netIncome: r.netIncome || 0,
      eps: r.eps || r.epsdiluted || 0,
      grossMarginPct: revenue > 0 ? +(((r.grossProfit || 0) / revenue) * 100).toFixed(1) : null,
      operatingMarginPct: revenue > 0 ? +(((r.operatingIncome || 0) / revenue) * 100).toFixed(1) : null,
      netMarginPct: revenue > 0 ? +(((r.netIncome || 0) / revenue) * 100).toFixed(1) : null,
      revenueGrowthPct: prev && prev > 0 ? +(((revenue - prev) / prev) * 100).toFixed(1) : null,
    };
  });
}

const TOOLS: AgentTool[] = [
  {
    declaration: {
      name: "get_quote",
      description:
        "Live price, daily change, day range and previous close for a ticker.",
      parameters: { type: "object", properties: SYMBOL_PARAM, required: ["symbol"] },
    },
    execute: async ({ symbol }) => {
      const q = await getQuote(String(symbol).toUpperCase());
      if (!q) return { found: false };
      return {
        found: true,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        dayHigh: q.high,
        dayLow: q.low,
        previousClose: q.previousClose,
      };
    },
  },
  {
    declaration: {
      name: "get_company_profile",
      description:
        "Company fundamentals: market cap, P/E, sector, industry, 52-week range, business description.",
      parameters: { type: "object", properties: SYMBOL_PARAM, required: ["symbol"] },
    },
    execute: async ({ symbol }) => {
      const p = await getCompanyProfile(String(symbol).toUpperCase());
      if (!p) return { found: false };
      return {
        found: true,
        name: p.name,
        sector: p.sector,
        industry: p.industry,
        marketCap: p.marketCap,
        pe: p.pe,
        week52High: p.week52High,
        week52Low: p.week52Low,
        description: p.description?.slice(0, 400) || "",
      };
    },
  },
  {
    declaration: {
      name: "get_analyst_ratings",
      description:
        "Wall Street analyst consensus (strong buy / buy / hold / sell counts) and mean/high/low price targets.",
      parameters: { type: "object", properties: SYMBOL_PARAM, required: ["symbol"] },
    },
    execute: async ({ symbol }) => {
      const sym = String(symbol).toUpperCase();
      const [ratings, target] = await Promise.all([
        getAnalystRatings(sym).catch(() => null),
        getPriceTarget(sym).catch(() => null),
      ]);
      if (!ratings && !target) return { found: false };
      return {
        found: true,
        ratings: ratings
          ? {
              strongBuy: ratings.strongBuy,
              buy: ratings.buy,
              hold: ratings.hold,
              sell: ratings.sell,
              strongSell: ratings.strongSell,
              period: ratings.period,
            }
          : null,
        priceTarget: target
          ? {
              mean: target.targetMean,
              high: target.targetHigh,
              low: target.targetLow,
            }
          : null,
      };
    },
  },
  {
    declaration: {
      name: "get_financials",
      description:
        "Up to 5 years of annual financials: revenue, net income, EPS, margins, and revenue growth. Use for fundamental/valuation questions.",
      parameters: { type: "object", properties: SYMBOL_PARAM, required: ["symbol"] },
    },
    execute: async ({ symbol }) => {
      const rows = await fetchAnnualFinancials(String(symbol).toUpperCase());
      return rows.length ? { found: true, years: rows } : { found: false };
    },
  },
  {
    declaration: {
      name: "get_price_history",
      description:
        "Historical closing prices over a range. Use for trend/performance questions ('how has it done this year').",
      parameters: {
        type: "object",
        properties: {
          ...SYMBOL_PARAM,
          range: {
            type: "string",
            enum: ["1M", "3M", "6M", "1Y", "3Y", "5Y"],
            description: "Lookback window. Defaults to 1Y.",
          },
        },
        required: ["symbol"],
      },
    },
    execute: async ({ symbol, range }) => {
      const days =
        { "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "3Y": 1095, "5Y": 1825 }[
          String(range || "1Y")
        ] || 365;
      const prices = await getHistoricalPrices(String(symbol).toUpperCase(), days);
      if (!prices.length) return { found: false };
      // Downsample to ~24 points to keep the payload small.
      const step = Math.max(1, Math.floor(prices.length / 24));
      const sampled = prices.filter((_, i) => i % step === 0).slice(0, 24);
      const first = prices[prices.length - 1]?.close;
      const last = prices[0]?.close;
      return {
        found: true,
        range: range || "1Y",
        points: prices.length,
        periodReturnPct:
          first && last ? +(((last - first) / first) * 100).toFixed(1) : null,
        latestClose: last,
        series: sampled.map((p) => ({ date: p.date, close: p.close })),
      };
    },
  },
  {
    declaration: {
      name: "get_news",
      description:
        "Recent news headlines with sentiment for a ticker. Use for 'what's happening / why is it moving' questions.",
      parameters: { type: "object", properties: SYMBOL_PARAM, required: ["symbol"] },
    },
    execute: async ({ symbol }) => {
      const news = await getCompanyNews(String(symbol).toUpperCase(), 7);
      if (!news.length) return { found: false };
      return {
        found: true,
        articles: news.slice(0, 8).map((n) => ({
          title: n.title,
          sentiment: n.sentiment,
          source: n.source,
          publishedAt: n.publishedAt?.split("T")[0],
        })),
      };
    },
  },
  {
    declaration: {
      name: "get_insider_trades",
      description:
        "Recent insider (Form 4) buys and sells from company executives and directors.",
      parameters: { type: "object", properties: SYMBOL_PARAM, required: ["symbol"] },
    },
    execute: async ({ symbol }, ctx) => {
      const sym = String(symbol).toUpperCase();
      const { data } = await ctx.supabase
        .from("insider_trades")
        .select("filer_name, filer_role, trade_type, shares, price_per_share, total_value, filing_date")
        .eq("ticker_symbol", sym)
        .order("filing_date", { ascending: false })
        .limit(8);
      if (!data?.length) return { found: false };
      return {
        found: true,
        trades: data.map((t: any) => ({
          name: t.filer_name,
          role: t.filer_role,
          action: t.trade_type === "P" ? "BUY" : "SELL",
          shares: t.shares,
          pricePerShare: t.price_per_share,
          totalValue: t.total_value,
          date: t.filing_date,
        })),
      };
    },
  },
  {
    declaration: {
      name: "get_catalyst_signal",
      description:
        "Catalyst's own AI-generated BUY/REDUCE/WATCH call for a ticker, with conviction, entry/target/stop and rationale.",
      parameters: { type: "object", properties: SYMBOL_PARAM, required: ["symbol"] },
    },
    execute: async ({ symbol }, ctx) => {
      const sym = String(symbol).toUpperCase();
      const { data: tk } = await ctx.supabase
        .from("tickers")
        .select("id")
        .eq("symbol", sym)
        .single();
      if (!tk) return { found: false };
      const { data: call } = await ctx.supabase
        .from("calls")
        .select("call, conviction, why, horizon, entry_price, target_price, stop_price, price_at_call, created_at")
        .eq("ticker_id", tk.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!call) return { found: false };
      return { found: true, ...call };
    },
  },
  {
    declaration: {
      name: "get_ecosystem",
      description:
        "Business ecosystem map: key suppliers, customers, partners and competitors (with tickers) for a company.",
      parameters: { type: "object", properties: SYMBOL_PARAM, required: ["symbol"] },
    },
    execute: async ({ symbol }) => {
      const map = await getEcosystemMap(String(symbol).toUpperCase());
      if (!map.edges.length) return { found: false };
      return {
        found: true,
        summary: map.summary,
        relationships: map.edges.slice(0, 15).map((e) => ({
          ticker: e.targetTicker,
          relationship: e.relationship,
          description: e.description,
          tier: e.tier,
        })),
      };
    },
  },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.declaration.name, t]));

// ---------------------------------------------------------------------------
// Gemini function-calling loop
// ---------------------------------------------------------------------------

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface GeminiContent {
  role: "user" | "model" | "function";
  parts: GeminiPart[];
}

/** Gemini requires functionResponse.response to be a JSON object — wrap non-objects. */
function asResponseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { result: value };
}

async function callGeminiWithTools(
  contents: GeminiContent[]
): Promise<GeminiContent | null> {
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    tools: [{ function_declarations: TOOLS.map((t) => t.declaration) }],
    tool_config: { function_calling_config: { mode: "AUTO" } },
    contents,
    generationConfig: { temperature: 0.4, topP: 0.9, maxOutputTokens: 4096 },
  };

  for (const model of MODELS) {
    try {
      const res = await geminiFetch(model, GEMINI_KEY, body, GEMINI_TIMEOUT_MS);
      if (!res) {
        console.log(`[agent] Gemini ${model} network error`);
        continue;
      }
      if (!res.ok) {
        console.log(`[agent] Gemini ${model} ${res.status}`);
        continue;
      }
      const data = await res.json();
      const content = data.candidates?.[0]?.content;
      if (content) return content as GeminiContent;
    } catch (e) {
      console.log(`[agent] Gemini ${model} error:`, e);
    }
  }
  return null;
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentContext
): Promise<Record<string, unknown>> {
  const tool = TOOL_MAP.get(name);
  if (!tool) return { error: `Unknown tool: ${name}` };
  try {
    const result = await Promise.race([
      tool.execute(args, ctx),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("tool timeout")), TOOL_TIMEOUT_MS)
      ),
    ]);
    return asResponseObject(result);
  } catch (e) {
    console.log(`[agent] tool ${name} error:`, e);
    return { error: `Tool ${name} failed`, found: false };
  }
}

export interface AgentResult {
  reply: string;
  toolsUsed: string[];
}

/**
 * Run the Catalyst research agent: a Gemini function-calling loop that gathers
 * live data via tools and synthesizes an answer. Returns null on hard failure
 * so the caller can fall back to the legacy context-dump path.
 */
export async function runResearchAgent(opts: {
  message: string;
  ticker?: string | null;
  history?: { role: "user" | "assistant"; content: string }[];
  ctx: AgentContext;
}): Promise<AgentResult | null> {
  if (!GEMINI_KEY) return null;

  const contents: GeminiContent[] = [];

  // Replay prior turns so follow-ups ("what about its competitors?") have
  // context. Gemini requires the first turn to be from the user, so drop any
  // leading assistant turns left over after slicing.
  const recent = (opts.history || []).slice(-6);
  while (recent.length && recent[0].role !== "user") recent.shift();
  for (const m of recent) {
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }

  const opener = opts.ticker
    ? `The user is currently viewing ${opts.ticker.toUpperCase()}. Question: ${opts.message}`
    : opts.message;
  contents.push({ role: "user", parts: [{ text: opener }] });

  const toolsUsed: string[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const modelContent = await callGeminiWithTools(contents);
    if (!modelContent) return null; // hard failure → caller falls back

    contents.push(modelContent);

    const calls = (modelContent.parts || []).filter(
      (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
        "functionCall" in p
    );

    // No tool calls → the model produced its final answer.
    if (calls.length === 0) {
      const text = (modelContent.parts || [])
        .map((p) => ("text" in p ? p.text : ""))
        .join("")
        .trim();
      if (!text) return null;
      const reply = text.includes("not personalized financial advice")
        ? text
        : `${text}\n\n${DISCLAIMER}`;
      return { reply, toolsUsed: [...new Set(toolsUsed)] };
    }

    // Execute all requested tools (possibly in parallel) and feed results back.
    const responses = await Promise.all(
      calls.map(async (c) => {
        toolsUsed.push(c.functionCall.name);
        const response = await runTool(
          c.functionCall.name,
          c.functionCall.args || {},
          opts.ctx
        );
        return {
          functionResponse: { name: c.functionCall.name, response },
        } as GeminiPart;
      })
    );
    contents.push({ role: "function", parts: responses });
  }

  // Hit the iteration cap — ask for a final answer with no more tools.
  contents.push({
    role: "user",
    parts: [
      {
        text: "Based on the data gathered, give your final analysis now. Do not call any more tools.",
      },
    ],
  });
  const finalContent = await callGeminiWithTools(contents);
  const finalText = (finalContent?.parts || [])
    .map((p) => ("text" in p ? p.text : ""))
    .join("")
    .trim();
  if (!finalText) return null;
  const reply = finalText.includes("not personalized financial advice")
    ? finalText
    : `${finalText}\n\n${DISCLAIMER}`;
  return { reply, toolsUsed: [...new Set(toolsUsed)] };
}

/** Human-readable labels for the tool trace shown in the UI. */
export const TOOL_LABELS: Record<string, string> = {
  get_quote: "live quote",
  get_company_profile: "company profile",
  get_analyst_ratings: "analyst ratings",
  get_financials: "5-yr financials",
  get_price_history: "price history",
  get_news: "recent news",
  get_insider_trades: "insider trades",
  get_catalyst_signal: "Catalyst signal",
  get_ecosystem: "ecosystem map",
};
