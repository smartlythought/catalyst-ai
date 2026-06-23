import { NextResponse } from "next/server";

export const revalidate = 3600; // ISR: revalidate hourly

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

async function fetchFinnhubEarnings(): Promise<ExecEvent[]> {
  if (!FINNHUB_KEY) return [];

  try {
    const from = todayStr();
    const to = futureStr(30);
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const megaCapSet = new Set(MEGA_CAP_TICKERS);

    return (data.earningsCalendar || [])
      .filter((e: any) => e.symbol && e.date && megaCapSet.has(e.symbol))
      .map((e: any) => ({
        company: MEGA_CAP_NAMES[e.symbol] || e.symbol,
        ticker: e.symbol,
        eventType: "Earnings Call",
        date: e.date,
        time: e.hour === 0 ? "Before market open" : "After market close",
        description: `${MEGA_CAP_NAMES[e.symbol] || e.symbol} Q${getQuarter(e.date)} earnings report.${
          e.epsEstimate != null
            ? ` EPS estimate: $${e.epsEstimate.toFixed(2)}.`
            : ""
        }${
          e.revenueEstimate != null
            ? ` Revenue estimate: $${formatRevenue(e.revenueEstimate)}.`
            : ""
        }`,
        impact: "high" as const,
      }));
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
