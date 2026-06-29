import { NextResponse } from "next/server";
import { yahooBatchQuotes } from "@/lib/ingestion/yahoo";

export const revalidate = 3600; // ISR: revalidate hourly
export const maxDuration = 60;

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";

interface ExecEvent {
  company: string;
  ticker: string;
  eventType: string;
  date: string;
  time: string;
  description: string;
  impact: "high" | "medium" | "low";
}

const MEGA_CAP_TICKERS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "META",
  "NVDA",
  "TSLA",
  "BRK.B",
  "AVGO",
  "JPM",
  "LLY",
  "V",
  "MA",
  "UNH",
  "COST",
  "WMT",
  "NFLX",
  "CRM",
  "AMD",
  "ORCL",
];

const MEGA_CAP_NAMES: Record<string, string> = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  GOOGL: "Alphabet",
  AMZN: "Amazon",
  META: "Meta Platforms",
  NVDA: "NVIDIA",
  TSLA: "Tesla",
  "BRK.B": "Berkshire Hathaway",
  AVGO: "Broadcom",
  JPM: "JPMorgan Chase",
  LLY: "Eli Lilly",
  V: "Visa",
  MA: "Mastercard",
  UNH: "UnitedHealth",
  COST: "Costco",
  WMT: "Walmart",
  NFLX: "Netflix",
  CRM: "Salesforce",
  AMD: "AMD",
  ORCL: "Oracle",
};

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function futureStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Minimum market cap to be worth showing — cuts micro-cap noise.
const MIN_MARKET_CAP = 700_000_000; // $700M

function impactForMarketCap(mcap: number): "high" | "medium" | "low" {
  if (mcap >= 10_000_000_000) return "high"; // $10B+
  if (mcap >= 2_000_000_000) return "medium"; // $2B–10B
  return "low"; // $700M–2B
}

async function fetchFinnhubEarnings(): Promise<ExecEvent[]> {
  if (!FINNHUB_KEY) return [];

  try {
    const from = todayStr();
    const to = futureStr(20); // next ~20 days
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];

    const data = await res.json();

    // Soonest-first candidates (dedupe symbols, drop dual-class ".X" tickers).
    const seen = new Set<string>();
    const candidates: any[] = [];
    for (const e of (data.earningsCalendar || [])
      .filter((e: any) => e.symbol && e.date && !e.symbol.includes("."))
      .sort((a: any, b: any) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
      if (seen.has(e.symbol)) continue;
      seen.add(e.symbol);
      candidates.push(e);
      if (candidates.length >= 250) break;
    }

    // Enrich with market cap + real company name via Yahoo (free batch),
    // then keep only companies >= $700M so the list is meaningful.
    const quotes = await yahooBatchQuotes(candidates.map((c) => c.symbol));

    return candidates
      .map((e: any) => {
        const q = quotes.get(e.symbol);
        const mcap = q?.marketCap || 0;
        if (mcap < MIN_MARKET_CAP) return null;
        const name = q?.name || MEGA_CAP_NAMES[e.symbol] || e.symbol;
        const capLabel =
          mcap >= 1e12
            ? `$${(mcap / 1e12).toFixed(1)}T`
            : mcap >= 1e9
              ? `$${(mcap / 1e9).toFixed(1)}B`
              : `$${(mcap / 1e6).toFixed(0)}M`;
        return {
          company: name,
          ticker: e.symbol,
          eventType: "Earnings Call",
          date: e.date,
          time: e.hour === 0 ? "Before market open" : "After market close",
          description: `${name} (${capLabel} mkt cap) Q${getQuarter(e.date)} earnings.${
            e.epsEstimate != null ? ` EPS est: $${e.epsEstimate.toFixed(2)}.` : ""
          }${
            e.revenueEstimate != null
              ? ` Rev est: $${formatRevenue(e.revenueEstimate)}.`
              : ""
          }`,
          impact: impactForMarketCap(mcap),
          marketCap: mcap,
        };
      })
      .filter((e): e is ExecEvent & { marketCap: number } => e !== null)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 60);
  } catch {
    return [];
  }
}

function getQuarter(dateStr: string): number {
  const month = new Date(dateStr + "T00:00:00").getMonth();
  // Earnings are reported for the previous quarter
  if (month >= 0 && month <= 2) return 4; // Jan-Mar reports Q4
  if (month >= 3 && month <= 5) return 1; // Apr-Jun reports Q1
  if (month >= 6 && month <= 8) return 2; // Jul-Sep reports Q2
  return 3; // Oct-Dec reports Q3
}

function formatRevenue(val: number): string {
  if (val >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(0)}M`;
  return val.toLocaleString();
}

const DEV_CATEGORY_MAP: Record<string, { eventType: string; impact: "high" | "medium" | "low" }> = {
  "Acquisition": { eventType: "Acquisition", impact: "high" },
  "Clinical Trial": { eventType: "Clinical Trial", impact: "high" },
  "Contract": { eventType: "Contract Win", impact: "medium" },
  "FDA": { eventType: "Regulatory", impact: "high" },
  "IPO": { eventType: "IPO", impact: "high" },
  "Joint Venture": { eventType: "Partnership", impact: "medium" },
  "Product Launch": { eventType: "Product Launch", impact: "high" },
  "Partnership": { eventType: "Partnership", impact: "medium" },
  "Restructuring": { eventType: "Restructuring", impact: "medium" },
  "Stock Split": { eventType: "Stock Split", impact: "medium" },
};

async function fetchMajorDevelopments(): Promise<ExecEvent[]> {
  if (!FINNHUB_KEY) return [];

  const events: ExecEvent[] = [];
  const from = todayStr();
  const to = futureStr(30);

  for (let i = 0; i < MEGA_CAP_TICKERS.length; i += 5) {
    const batch = MEGA_CAP_TICKERS.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (ticker) => {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/major-development?symbol=${ticker}&from=${from}&to=${to}&token=${FINNHUB_KEY}`,
            { next: { revalidate: 3600 } }
          );
          if (!res.ok) return [];
          const data = await res.json();
          return (data.majorDevelopment || []).map((d: any) => {
            const mapped = DEV_CATEGORY_MAP[d.category] || { eventType: d.category || "News", impact: "low" as const };
            return {
              company: MEGA_CAP_NAMES[ticker] || ticker,
              ticker,
              eventType: mapped.eventType,
              date: d.datetime?.split(" ")[0] || from,
              time: d.datetime?.split(" ")[1] || "TBD",
              description: d.headline || `${MEGA_CAP_NAMES[ticker] || ticker} ${mapped.eventType.toLowerCase()} announcement`,
              impact: mapped.impact,
            };
          });
        } catch { return []; }
      })
    );
    for (const r of results) events.push(...r);
    if (i + 5 < MEGA_CAP_TICKERS.length) await new Promise(r => setTimeout(r, 200));
  }

  return events;
}

function deduplicateEvents(events: ExecEvent[]): ExecEvent[] {
  const seen = new Map<string, ExecEvent>();

  for (const event of events) {
    const key = `${event.ticker}-${event.date}-${event.eventType}`;
    if (!seen.has(key)) {
      seen.set(key, event);
    }
  }

  return Array.from(seen.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

export async function GET() {
  const [finnhubEvents, devEvents] = await Promise.all([
    fetchFinnhubEarnings(),
    fetchMajorDevelopments(),
  ]);

  const combined = deduplicateEvents([...finnhubEvents, ...devEvents]);

  return NextResponse.json({
    events: combined,
    generatedAt: new Date().toISOString(),
  });
}
