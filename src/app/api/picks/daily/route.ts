import { NextResponse } from "next/server";

export const revalidate = 3600;

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
  if (!FMP_KEY) return map;

  for (let i = 0; i < SCAN_UNIVERSE.length; i += 30) {
    const batch = SCAN_UNIVERSE.slice(i, i + 30);
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/batch-quote?symbols=${batch.join(",")}&apikey=${FMP_KEY}`,
        { next: { revalidate: 300 } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const q of (Array.isArray(data) ? data : [])) {
        if (q.symbol && q.price > 0) map.set(q.symbol, q);
      }
    } catch {}
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

  if (snapshots.length < 20 && FINNHUB_KEY) {
    for (let i = 0; i < Math.min(SCAN_UNIVERSE.length, 40); i++) {
      if (fmpQuotes.has(SCAN_UNIVERSE[i])) continue;
      const q = await fetchFinnhubQuote(SCAN_UNIVERSE[i]);
      if (q) {
        snapshots.push({
          symbol: SCAN_UNIVERSE[i],
          name: SCAN_UNIVERSE[i],
          price: q.c,
          change: q.d ?? 0,
          changePct: q.dp ?? 0,
          pe: 0, marketCap: 0, sector: "", volume: 0,
          week52High: q.h ?? 0, week52Low: q.l ?? 0,
          analystBuy: 0, analystHold: 0, analystSell: 0, targetMean: 0,
        });
      }
    }
  }

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

function buildPrompt(snapshots: StockSnapshot[], today: string): string {
  const stockData = snapshots.map(s => {
    let line = `${s.symbol} | $${s.price.toFixed(2)} | ${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(2)}%`;
    if (s.pe > 0) line += ` | PE:${s.pe.toFixed(1)}`;
    if (s.marketCap > 0) line += ` | MCap:$${(s.marketCap / 1e9).toFixed(0)}B`;
    if (s.week52High > 0) line += ` | 52wH:$${s.week52High.toFixed(2)}`;
    if (s.week52Low > 0) line += ` | 52wL:$${s.week52Low.toFixed(2)}`;
    if (s.analystBuy > 0) line += ` | Analysts:${s.analystBuy}B/${s.analystHold}H/${s.analystSell}S`;
    if (s.targetMean > 0) line += ` | AvgPT:$${s.targetMean.toFixed(2)}`;
    return line;
  }).join("\n");

  return `You are an elite stock analyst. Today is ${today}. Below are REAL live prices and data for ${snapshots.length} US stocks.

LIVE MARKET DATA:
${stockData}

TASK: Select exactly 10 stocks for actionable same-day or short-term recommendations.

CRITICAL RULES:
1. Entry price MUST be within 1-3% of the CURRENT price shown above. Users should be able to act TODAY.
2. For BUY: target 5-15% upside from entry over the timeframe. Stop loss 3-7% below entry.
3. For SELL/SHORT: target 5-15% downside from entry. Stop loss 3-7% above entry.
4. Risk:reward ratio must be at least 2:1
5. Conviction 70+ means you are very confident based on the data
6. DO NOT pick stocks that are already at 52-week highs unless they have strong analyst upgrades and momentum
7. Favor stocks where analyst target price suggests meaningful upside/downside from current price
8. Mix sectors — no more than 3 picks from the same sector

Return a JSON array of exactly 10 objects:
- "symbol": ticker
- "companyName": company name
- "action": "BUY" or "SELL"
- "entryPrice": price near current price (within 1-3%)
- "targetPrice": realistic target based on analyst targets and technicals
- "stopLoss": protective stop loss
- "timeframe": "short-term" (1-4 weeks) or "long-term" (1-6 months)
- "conviction": integer 50-95
- "rationale": 2 sentences explaining WHY based on the real data above
- "catalysts": array of 2-3 specific catalysts

Include 7-8 BUY and 2-3 SELL. Return ONLY the JSON array.`;
}

function validatePicks(picks: Pick[], snapshots: StockSnapshot[]): Pick[] {
  const priceMap = new Map(snapshots.map(s => [s.symbol, s.price]));

  return picks.filter(p => {
    const realPrice = priceMap.get(p.symbol);
    if (!realPrice) return false;

    const entryDrift = Math.abs(p.entryPrice - realPrice) / realPrice;
    if (entryDrift > 0.05) {
      p.entryPrice = realPrice;
    }

    if (p.action === "BUY") {
      if (p.targetPrice <= p.entryPrice) p.targetPrice = p.entryPrice * 1.10;
      if (p.stopLoss >= p.entryPrice) p.stopLoss = p.entryPrice * 0.95;
    } else {
      if (p.targetPrice >= p.entryPrice) p.targetPrice = p.entryPrice * 0.90;
      if (p.stopLoss <= p.entryPrice) p.stopLoss = p.entryPrice * 1.05;
    }

    p.currentPrice = realPrice;
    return true;
  });
}

export async function GET() {
  if (!GEMINI_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  try {
    const snapshots = await buildSnapshots();

    if (snapshots.length < 10) {
      return NextResponse.json(
        { error: "Insufficient market data — try again shortly" },
        { status: 502 }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const prompt = buildPrompt(snapshots, today);

    const models = ["gemini-2.5-flash", "gemini-2.0-flash"];
    let picks: Pick[] = [];

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
                temperature: 0.4,
              },
            }),
          }
        );

        if (!res.ok) continue;
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) continue;

        picks = JSON.parse(text);
        if (Array.isArray(picks) && picks.length > 0) break;
      } catch { continue; }
    }

    if (!picks.length) {
      return NextResponse.json({ error: "Failed to generate picks" }, { status: 502 });
    }

    const validated = validatePicks(picks, snapshots);

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
