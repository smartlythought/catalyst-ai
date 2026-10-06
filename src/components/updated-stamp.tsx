"use client";

import { useEffect, useState } from "react";
import { formatET, timeAgo, todayETDate } from "@/lib/time";

interface UpdatedStampProps {
  at: string | number | null | undefined;
  /** What the time refers to, e.g. "Picks generated", "Prices as of". */
  label?: string;
  /** Older than this → amber "stale" dot. Default 20h. */
  staleAfterHours?: number;
  /** Mark stale whenever the data isn't from today (ET) — for daily data. */
  staleIfNotToday?: boolean;
  /** Shown when there's no timestamp (nothing generated yet). */
  emptyText?: string;
  className?: string;
}

/**
 * One consistent freshness line for every page:
 *   ● Picks generated Mon Oct 6, 8:12 AM ET · 2h ago
 * Absolute time is rendered on the server; the relative "ago" is added after
 * mount (and ticks every minute) so server/client HTML always match.
 */
export function UpdatedStamp({
  at,
  label = "Updated",
  staleAfterHours = 20,
  staleIfNotToday = false,
  emptyText = "Not generated yet",
  className = "",
}: UpdatedStampProps) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!at) {
    return (
      <div className={`flex items-center gap-1.5 text-[11px] font-mono text-text-faint ${className}`}>
        <span className="w-[6px] h-[6px] rounded-full bg-text-faint/60 shrink-0" />
        {emptyText}
      </div>
    );
  }

  const ms = new Date(at).getTime();
  const stale =
    now != null &&
    ((staleIfNotToday && todayETDate(new Date(ms)) !== todayETDate(new Date(now))) ||
      now - ms > staleAfterHours * 3600_000);

  return (
    <div className={`flex items-center gap-1.5 text-[11px] font-mono text-text-faint ${className}`}>
      <span
        className="w-[6px] h-[6px] rounded-full shrink-0"
        style={{ background: stale ? "#F5A524" : "var(--pos-green)" }}
        title={stale ? "Older data" : "Fresh"}
      />
      <span>
        {label} {formatET(ms)}
        {now != null && <> · {timeAgo(ms, now)}</>}
        {stale && <span style={{ color: "#F5A524" }}> · older data</span>}
      </span>
    </div>
  );
}
