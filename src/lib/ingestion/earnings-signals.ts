// Earnings-awareness for the picks pipeline. ADDITIVE — it produces signals
// the AI can weigh; it does not change selection logic.
//
// IMPORTANT framing: earnings are a BINARY, high-variance event. This layer
// improves odds and — crucially — flags the risk; it never claims to predict
// the post-earnings direction. The AI is told to treat imminent earnings as
// risk, not a guaranteed win.
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";

export interface EarningsInfo {
  date: string; // YYYY-MM-DD
  daysAway: number; // calendar days from today (ET)
  hour: string; // "bmo" (before open) | "amc" (after close) | ""
  epsEstimate: number | null;
}

export interface EarningsHistory {
  beats: number; // quarters beaten (of `total`)
  total: number; // quarters with data (≤4)
  lastSurprisePct: number | null; // most-recent surprise %
}

function todayET(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return et.toISOString().split("T")[0];
}

// One Finnhub call covers the whole calendar window → cheap for the full scan.
let cache: { at: number; map: Map<string, EarningsInfo> } | null = null;
const TTL_MS = 6 * 3600_000;

export async function getEarningsCalendar(daysAhead = 10): Promise<Map<string, EarningsInfo>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const map = new Map<string, EarningsInfo>();
  if (!FINNHUB_KEY) return map;
  try {
    const from = todayET();
    const to = new Date(new Date(from + "T00:00:00").getTime() + daysAhead * 86400000)
      .toISOString()
      .split("T")[0];
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return map;
    const data = await res.json();
    const arr = data?.earningsCalendar || [];
    const base = new Date(from + "T00:00:00").getTime();
    for (const e of arr) {
      const sym = String(e.symbol || "").toUpperCase();
      if (!sym || !e.date) continue;
      const daysAway = Math.round((new Date(e.date + "T00:00:00").getTime() - base) / 86400000);
      const prev = map.get(sym);
      if (!prev || daysAway < prev.daysAway) {
        map.set(sym, { date: e.date, daysAway, hour: e.hour || "", epsEstimate: e.epsEstimate ?? null });
      }
    }
    cache = { at: Date.now(), map };
  } catch {
    /* best-effort */
  }
  return map;
}

/** Human label for a pick chip / rationale. */
export function earningsLabel(info: EarningsInfo): string {
  if (info.daysAway <= 0) return "Earnings today";
  if (info.daysAway === 1) return "Earnings tomorrow";
  return `Earnings in ${info.daysAway}d`;
}

/** Last-4-quarter beat record + most-recent surprise, per symbol (finalists only). */
export async function getEarningsHistory(symbol: string): Promise<EarningsHistory | null> {
  if (!FINNHUB_KEY) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&token=${FINNHUB_KEY}`
    );
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) return null;
    const recent = arr.slice(0, 4);
    let beats = 0;
    let total = 0;
    for (const q of recent) {
      if (q.actual != null && q.estimate != null) {
        total++;
        if (q.actual >= q.estimate) beats++;
      }
    }
    if (!total) return null;
    const lastSurprisePct =
      typeof recent[0]?.surprisePercent === "number" ? recent[0].surprisePercent : null;
    return { beats, total, lastSurprisePct };
  } catch {
    return null;
  }
}
