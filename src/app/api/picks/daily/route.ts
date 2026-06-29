import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendDailyPicksDigest } from "@/lib/email";
import { GEMINI_MODELS } from "@/lib/ai/models";
import { withinDailyAIBudget, AI_BUDGET_MESSAGE } from "@/lib/ai/usage";

export const dynamic = "force-dynamic";

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const FMP_KEY = process.env.FMP_API_KEY || "";

interface Pick {
  symbol: string;
  companyName: string;
  action: "BUY" | "SELL";
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  timeframe: "short-term" | "long-term";
  conviction: number;
  rationale: string;
  catalysts: string[];
  currentPrice?: number;
}

interface StockSnapshot {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  pe: number;
  marketCap: number;
  sector: string;
  volume: number;
  week52High: number;
  week52Low: number;
  analystBuy: number;
  analystHold: number;
  analystSell: number;
  targetMean: number;
}

const SCAN_UNIVERSE = [
  "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AVGO","AMD","CRM",
  "NFLX","ORCL","ADBE","INTC","QCOM","CSCO","TXN","MU","AMAT","LRCX",
  "JPM","V","MA","BAC","GS","WFC","AXP","BLK","SCHW","MS",
  "UNH","JNJ","LLY","PFE","ABBV","MRK","TMO","ABT","BMY","AMGN",
  "XOM","CVX","COP","SLB","EOG","OXY","PSX","VLO","MPC","HAL",
  "WMT","COST","HD","LOW","TGT","SBUX","MCD","NKE","TJX","BKNG",
  "PG","KO","PEP","PM","CL","EL","MDLZ","GIS","KHC","STZ",
  "DIS","CMCSA","T","VZ","TMUS","CHTR","PARA","WBD","SPOT","ROKU",
  "BA","CAT","DE","GE","HON","RTX","LMT","UNP","UPS","FDX",
  "PLTR","SNOW","CRWD","NET","DDOG","ZS","PANW","FTNT","MDB","COIN",
  "SQ","SHOP","MELI","SE","UBER","LYFT","DASH","ABNB","RBLX","U",
  "ARM","SMCI","DELL","HPE","IBM","NOW","WDAY","TEAM","HUBS","VEEV",
];

async function fetchFMPBatchQuotes(): Promise<Map<string, any>> {
  const map = new Map();
  if (!FMP_KEY) { console.log("[picks] No FMP key"); return map; }

  for (let i = 0; i < SCAN_UNIVERSE.length; i += 30) {
    const batch = SCAN_UNIVERSE.slice(i, i + 30);
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/batch-quote?symbols=${batch.join(",")}&apikey=${FMP_KEY}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        console.log(`[picks] FMP batch ${i}-${i+30} status: ${res.status}`);
        continue;
      }
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      for (const q of arr) {
        if (q.symbol && q.price > 0) map.set(q.symbol, q);
      }
      console.log(`[picks] FMP batch ${i}-${i+30}: got ${arr.length} quotes, total ${map.size}`);
    } catch (e) {
      console.log(`[picks] FMP batch ${i}-${i+30} error:`, e);
    }
  }
  return map;
}

async function fetchFinnhubQuote(symbol: string): Promise<any> {
  if (!FINNHUB_KEY) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 300 } }
    );
    const d = await res.json();
    return d.c > 0 ? d : null;
  } catch { return null; }
}

async function fetchAnalystData(symbols: string[]): Promise<Map<string, any>> {
  const map = new Map();
  if (!FINNHUB_KEY) return map;

  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (sym) => {
      try {
        const [rec, pt] = await Promise.all([
          fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${sym}&token=${FINNHUB_KEY}`)
            .then(r => r.json()).catch(() => []),
          fetch(`https://finnhub.io/api/v1/stock/price-target?symbol=${sym}&token=${FINNHUB_KEY}`)
            .then(r => r.json()).catch(() => ({})),
        ]);
        return {
          symbol: sym,
          buy: rec[0]?.buy || 0,
          hold: rec[0]?.hold || 0,
          sell: rec[0]?.sell || 0,
          targetMean: pt.targetMean || 0,
        };
      } catch { return null; }
    }));
    for (const r of results) {
      if (r) map.set(r.symbol, r);
    }
    if (i + 5 < symbols.length) await new Promise(r => setTimeout(r, 250));
  }
  return map;
}

async function buildSnapshots(): Promise<StockSnapshot[]> {
  const fmpQuotes = await fetchFMPBatchQuotes();
  const snapshots: StockSnapshot[] = [];

  for (const sym of SCAN_UNIVERSE) {
    const fmp = fmpQuotes.get(sym);
    if (fmp && fmp.price > 0) {
      snapshots.push({
        symbol: sym,
        name: fmp.name || sym,
        price: fmp.price,
        change: fmp.change ?? 0,
        changePct: fmp.changesPercentage ?? fmp.changePercentage ?? 0,
        pe: fmp.pe ?? 0,
        marketCap: fmp.marketCap ?? 0,
        sector: fmp.sector || "",
        volume: fmp.volume ?? 0,
        week52High: fmp.yearHigh ?? 0,
        week52Low: fmp.yearLow ?? 0,
        analystBuy: 0, analystHold: 0, analystSell: 0, targetMean: 0,
      });
    }
  }

  if (snapshots.length < 40 && FINNHUB_KEY) {
    const needed = SCAN_UNIVERSE.filter(s => !fmpQuotes.has(s)).slice(0, 60);
    console.log(`[picks] Finnhub fallback for ${needed.length} symbols`);
    for (let i = 0; i < needed.length; i += 5) {
      const batch = needed.slice(i, i + 5);
      const results = await Promise.all(batch.map(async (sym) => {
        const q = await fetchFinnhubQuote(sym);
        return q ? { sym, q } : null;
      }));
      for (const r of results) {
        if (r) {
          snapshots.push({
            symbol: r.sym,
            name: r.sym,
            price: r.q.c,
            change: r.q.d ?? 0,
            changePct: r.q.dp ?? 0,
            pe: 0, marketCap: 0, sector: "", volume: 0,
            week52High: r.q.h ?? 0, week52Low: r.q.l ?? 0,
            analystBuy: 0, analystHold: 0, analystSell: 0, targetMean: 0,
          });
        }
      }
      if (snapshots.length >= 40) break;
      if (i + 5 < needed.length) await new Promise(r => setTimeout(r, 200));
    }
  }
  console.log(`[picks] Total snapshots: ${snapshots.length}`);

  const topMovers = [...snapshots]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 40)
    .map(s => s.symbol);

  const analystData = await fetchAnalystData(topMovers);
  for (const snap of snapshots) {
    const ad = analystData.get(snap.symbol);
    if (ad) {
      snap.analystBuy = ad.buy;
      snap.analystHold = ad.hold;
      snap.analystSell = ad.sell;
      snap.targetMean = ad.targetMean;
    }
  }

  return snapshots;
}

function buildStockData(snapshots: StockSnapshot[]): string {
  const shuffled = [...snapshots].sort(() => Math.random() - 0.5);
  return shuffled.map(s => {
    let line = `${s.symbol} | $${s.price.toFixed(2)} | ${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(2)}%`;
    if (s.pe > 0) line += ` | PE:${s.pe.toFixed(1)}`;
    if (s.marketCap > 0) line += ` | MCap:$${(s.marketCap / 1e9).toFixed(0)}B`;
    if (s.week52High > 0) line += ` | 52wH:$${s.week52High.toFixed(2)}`;
    if (s.week52Low > 0) line += ` | 52wL:$${s.week52Low.toFixed(2)}`;
    if (s.analystBuy > 0) line += ` | Analysts:${s.analystBuy}B/${s.analystHold}H/${s.analystSell}S`;
    if (s.targetMean > 0) line += ` | AvgPT:$${s.targetMean.toFixed(2)}`;
    return line;
  }).join("\n");
}

function buildShortTermPrompt(stockData: string, count: number, today: string, phase: string): string {
  const phaseHint = phase === "pre-market"
    ? "Focus on pre-market movers and gap-up/gap-down setups."
    : phase === "after-hours"
      ? "Focus on after-hours movers and next-day setups."
      : "Focus on intraday momentum and swing trade setups.";

  return `You are an elite stock analyst. Today is ${today} (${phase}). ${phaseHint}
Below are REAL live prices and data for US stocks.

LIVE MARKET DATA:
${stockData}

TASK: Select exactly 10 stocks for SHORT-TERM trades (1–4 weeks).
Focus on momentum, swing trades, catalysts, earnings plays, sector rotation.

RULES:
1. Entry price within 1-3% of current price — users act TODAY.
2. BUY target: 5-15% upside. SELL target: 5-15% downside. Stop loss: 3-7%.
3. Risk:reward at least 2:1. Conviction 70+ = high confidence.
4. Pick from at least 5 different sectors. Max 2 per sector.
5. Include at least 2 mid-cap stocks (market cap under $50B).
6. 7-8 BUY, 2-3 SELL.

Return a JSON array of exactly 10 objects with: "symbol", "companyName", "action" (BUY/SELL), "entryPrice", "targetPrice", "stopLoss", "timeframe" (always "short-term"), "conviction" (50-95), "rationale" (2 sentences), "catalysts" (array of 2-3). Return ONLY the JSON array.`;
}

function buildLongTermPrompt(stockData: string, count: number, today: string, excludeSymbols: string[]): string {
  const excludeNote = excludeSymbols.length > 0
    ? `\nDO NOT pick these symbols (already in short-term picks): ${excludeSymbols.join(", ")}`
    : "";

  return `You are an elite stock analyst focused on VALUE and GROWTH investing. Today is ${today}.
Below are REAL live prices and data for US stocks.

LIVE MARKET DATA:
${stockData}

TASK: Select exactly 10 stocks for LONG-TERM positions (1–6 months).
Focus on fundamental value, sector tailwinds, analyst upgrades, macro themes, undervalued stocks.
${excludeNote}

RULES:
1. Entry price within 1-5% of current price.
2. BUY target: 10-30% upside. SELL target: 10-25% downside. Stop loss: 5-12%.
3. Risk:reward at least 2:1. Conviction 70+ = high confidence.
4. Prioritize stocks where analyst target is significantly above/below current price.
5. Pick from at least 5 different sectors. Max 2 per sector.
6. Include at least 3 mid-cap stocks (market cap under $50B).
7. 7-8 BUY, 2-3 SELL.

Return a JSON array of exactly 10 objects with: "symbol", "companyName", "action" (BUY/SELL), "entryPrice", "targetPrice", "stopLoss", "timeframe" (always "long-term"), "conviction" (50-95), "rationale" (2 sentences), "catalysts" (array of 2-3). Return ONLY the JSON array.`;
}

function validatePicks(picks: Pick[], snapshots: StockSnapshot[]): Pick[] {
  const priceMap = new Map(snapshots.map(s => [s.symbol, s.price]));
  const seen = new Set<string>();

  return picks.filter(p => {
    if (seen.has(p.symbol)) return false;
    seen.add(p.symbol);

    const realPrice = priceMap.get(p.symbol);
    if (!realPrice) return false;

    const isLong = p.timeframe === "long-term";
    const maxDrift = isLong ? 0.08 : 0.05;

    const entryDrift = Math.abs(p.entryPrice - realPrice) / realPrice;
    if (entryDrift > maxDrift) {
      p.entryPrice = realPrice;
    }

    if (p.action === "BUY") {
      const minTarget = isLong ? 1.12 : 1.10;
      if (p.targetPrice <= p.entryPrice) p.targetPrice = p.entryPrice * minTarget;
      if (p.stopLoss >= p.entryPrice) p.stopLoss = p.entryPrice * (isLong ? 0.92 : 0.95);
    } else {
      const maxTarget = isLong ? 0.88 : 0.90;
      if (p.targetPrice >= p.entryPrice) p.targetPrice = p.entryPrice * maxTarget;
      if (p.stopLoss <= p.entryPrice) p.stopLoss = p.entryPrice * (isLong ? 1.08 : 1.05);
    }

    p.currentPrice = realPrice;
    return true;
  });
}

function getTradingDateET(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const hour = et.getHours();

  if (day === 0) et.setDate(et.getDate() - 2);
  else if (day === 6) et.setDate(et.getDate() - 1);
  else if (hour < 4) et.setDate(et.getDate() - (day === 1 ? 3 : 1));

  return et.toISOString().split("T")[0];
}

function getMarketPhase(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = et.getHours();
  const min = et.getMinutes();
  const t = hour * 60 + min;
  if (t < 570) return "pre-market";
  if (t < 960) return "market-hours";
  return "after-hours";
}

async function getCachedPicks(tradingDate: string): Promise<any | null> {
  try {
    const sb = createServiceClient();
    const { data } = await sb
      .from("daily_picks")
      .select("*")
      .eq("generated_date", tradingDate)
      .single();

    if (!data) return null;

    const age = Date.now() - new Date(data.generated_at).getTime();
    const maxAge = getMarketPhase() === "market-hours" ? 4 * 3600_000 : 12 * 3600_000;

    if (age > maxAge) return null;

    return {
      picks: data.picks,
      generatedAt: data.generated_at,
      stocksScanned: data.stocks_scanned,
      disclaimer: "AI-generated recommendations for informational purposes only. Not financial advice.",
    };
  } catch {
    return null;
  }
}

async function storePicks(tradingDate: string, picks: Pick[], scanned: number) {
  try {
    const sb = createServiceClient();
    await sb.from("daily_picks").upsert({
      generated_date: tradingDate,
      picks,
      stocks_scanned: scanned,
      generated_at: new Date().toISOString(),
    }, { onConflict: "generated_date" });
  } catch {}
}

export async function GET(request: Request) {
  if (!GEMINI_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  const tradingDate = getTradingDateET();
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";

  if (!forceRefresh) {
    const cached = await getCachedPicks(tradingDate);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  // Fresh generation makes Gemini calls — respect the daily budget. Serve
  // stale cache if available rather than failing outright.
  if (!(await withinDailyAIBudget())) {
    const stale = await getCachedPicks(tradingDate);
    if (stale) return NextResponse.json(stale);
    return NextResponse.json(
      { error: AI_BUDGET_MESSAGE, picks: [] },
      { status: 429 }
    );
  }

  try {
    console.log("[picks] Building snapshots...");
    const snapshots = await buildSnapshots();

    if (snapshots.length < 10) {
      return NextResponse.json(
        { error: "Insufficient market data — try again shortly" },
        { status: 502 }
      );
    }

    const phase = getMarketPhase();
    const stockData = buildStockData(snapshots);

    async function callGemini(prompt: string): Promise<Pick[]> {
      const models = GEMINI_MODELS;
      for (const model of models) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  responseMimeType: "application/json",
                  temperature: 0.7,
                },
              }),
              signal: AbortSignal.timeout(25000),
            }
          );
          if (!res.ok) { console.log(`[picks] Gemini ${model} ${res.status}`); continue; }
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) continue;
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {
          console.log(`[picks] Gemini ${model} error:`, e);
          continue;
        }
      }
      return [];
    }

    console.log("[picks] Generating short-term + long-term in parallel...");
    const shortPrompt = buildShortTermPrompt(stockData, snapshots.length, tradingDate, phase);
    const longPrompt = buildLongTermPrompt(stockData, snapshots.length, tradingDate, []);

    const [shortPicks, longPicks] = await Promise.all([
      callGemini(shortPrompt),
      callGemini(longPrompt),
    ]);

    console.log(`[picks] Got ${shortPicks.length} short + ${longPicks.length} long picks`);
    const picks = [...shortPicks, ...longPicks];

    if (!picks.length) {
      return NextResponse.json({ error: "Failed to generate picks" }, { status: 502 });
    }

    const validated = validatePicks(picks, snapshots);

    await storePicks(tradingDate, validated, snapshots.length);

    sendDailyPicksDigest(validated, tradingDate).catch(() => {});

    return NextResponse.json({
      picks: validated,
      generatedAt: new Date().toISOString(),
      stocksScanned: snapshots.length,
      disclaimer: "AI-generated recommendations for informational purposes only. Not financial advice.",
    });
  } catch (err) {
    console.error("Picks generation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
