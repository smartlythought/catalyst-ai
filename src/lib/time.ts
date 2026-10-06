// Shared time formatting — everything user-facing is shown in US Eastern time
// (the market's clock), regardless of where the server or viewer is.

export const ET = "America/New_York";

/** "Mon Oct 6, 8:12 AM ET" (or "Oct 6, 8:12 AM ET" with weekday: false). */
export function formatET(iso: string | number | Date, opts: { weekday?: boolean; time?: boolean } = {}): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-US", {
    timeZone: ET,
    ...(opts.weekday !== false ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
  });
  if (opts.time === false) return date;
  const time = d.toLocaleTimeString("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" });
  return `${date}, ${time} ET`;
}

/** "just now" / "12m ago" / "3h ago" / "2d ago". */
export function timeAgo(iso: string | number | Date, now: number = Date.now()): string {
  const s = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (!isFinite(s)) return "";
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Today's date in ET as YYYY-MM-DD. */
export function todayETDate(at: Date = new Date()): string {
  return at.toLocaleDateString("en-CA", { timeZone: ET }); // en-CA → YYYY-MM-DD
}

/** Today's date header in ET, e.g. "Monday, Oct 6". */
export function todayHeaderET(at: Date = new Date()): string {
  return at.toLocaleDateString("en-US", { timeZone: ET, weekday: "long", month: "short", day: "numeric" });
}
