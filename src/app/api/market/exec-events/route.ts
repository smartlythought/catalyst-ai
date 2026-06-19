import { NextResponse } from "next/server";

export const revalidate = 3600; // ISR: revalidate hourly

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

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

async function fetchGeminiEvents(): Promise<ExecEvent[]> {
  if (!GEMINI_KEY) return [];

  const today = todayStr();
  const endDate = futureStr(30);

  const prompt = `You are a financial events tracker. List upcoming executive and company events for major US mega-cap tech companies (AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA, AVGO, AMD, NFLX, CRM, ORCL) from ${today} to ${endDate}.

Include these event types: earnings calls, product launches, developer conferences, shareholder meetings, regulatory hearings, investor days, and major keynotes.

Return a JSON array of objects with these fields:
- company (string): full company name
- ticker (string): stock ticker
- eventType (string): one of "Earnings Call", "Product Launch", "Conference", "Shareholder Meeting", "Regulatory Hearing", "Investor Day", "Keynote"
- date (string): YYYY-MM-DD format
- time (string): time if known, or "TBD"
- description (string): one sentence describing the event
- impact (string): "high", "medium", or "low"

Only include events you are reasonably confident about based on known annual schedules and publicly announced events. Do not fabricate events. If unsure about a date, skip the event.

Return ONLY the JSON array, no other text.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    const events: ExecEvent[] = JSON.parse(text);

    // Validate and sanitize
    return events
      .filter(
        (e) =>
          e.company &&
          e.ticker &&
          e.eventType &&
          e.date &&
          /^\d{4}-\d{2}-\d{2}$/.test(e.date)
      )
      .map((e) => ({
        company: e.company,
        ticker: e.ticker.toUpperCase(),
        eventType: e.eventType,
        date: e.date,
        time: e.time || "TBD",
        description: e.description || "",
        impact:
          e.impact === "high" || e.impact === "medium" || e.impact === "low"
            ? e.impact
            : "medium",
      }));
  } catch {
    return [];
  }
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
  const [finnhubEvents, geminiEvents] = await Promise.all([
    fetchFinnhubEarnings(),
    fetchGeminiEvents(),
  ]);

  // Finnhub earnings take priority (more accurate), then Gemini for other event types
  const combined = deduplicateEvents([...finnhubEvents, ...geminiEvents]);

  return NextResponse.json({
    events: combined,
    generatedAt: new Date().toISOString(),
  });
}
