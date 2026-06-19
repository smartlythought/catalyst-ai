"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TabBar } from "@/components/tab-bar";
import { Disclaimer } from "@/components/disclaimer";

interface ExecEvent {
  company: string;
  ticker: string;
  eventType: string;
  date: string;
  time: string;
  description: string;
  impact: "high" | "medium" | "low";
}

interface EventsResponse {
  events: ExecEvent[];
  generatedAt: string;
}

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  "Earnings Call": {
    bg: "rgba(22, 199, 132, 0.12)",
    text: "var(--pos-green-bright)",
  },
  Conference: {
    bg: "rgba(59, 130, 246, 0.12)",
    text: "#3B82F6",
  },
  "Product Launch": {
    bg: "rgba(249, 115, 22, 0.12)",
    text: "#F97316",
  },
  Keynote: {
    bg: "rgba(249, 115, 22, 0.12)",
    text: "#F97316",
  },
  "Regulatory Hearing": {
    bg: "rgba(234, 57, 67, 0.12)",
    text: "var(--neg-red-bright)",
  },
  "Shareholder Meeting": {
    bg: "rgba(168, 85, 247, 0.12)",
    text: "#A855F7",
  },
  "Investor Day": {
    bg: "rgba(59, 130, 246, 0.12)",
    text: "#3B82F6",
  },
};

const IMPACT_DOTS: Record<string, { color: string; label: string }> = {
  high: { color: "var(--neg-red-bright)", label: "High Impact" },
  medium: { color: "#FACC15", label: "Medium" },
  low: { color: "var(--pos-green-bright)", label: "Low" },
};

function getEventTypeStyle(eventType: string) {
  return (
    EVENT_TYPE_COLORS[eventType] || {
      bg: "rgba(148, 163, 184, 0.12)",
      text: "var(--text-muted)",
    }
  );
}

function formatDateBlock(dateStr: string): { month: string; day: string; weekday: string } {
  const d = new Date(dateStr + "T00:00:00");
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }),
    day: String(d.getDate()),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
  };
}

function groupByTimeframe(
  events: ExecEvent[]
): { label: string; events: ExecEvent[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Get start of this week (Sunday)
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  // End of this week (Saturday)
  const endOfThisWeek = new Date(startOfWeek);
  endOfThisWeek.setDate(startOfWeek.getDate() + 6);

  // End of next week
  const endOfNextWeek = new Date(endOfThisWeek);
  endOfNextWeek.setDate(endOfThisWeek.getDate() + 7);

  const thisWeek: ExecEvent[] = [];
  const nextWeek: ExecEvent[] = [];
  const later: ExecEvent[] = [];

  for (const event of events) {
    const eventDate = new Date(event.date + "T00:00:00");
    if (eventDate <= endOfThisWeek) {
      thisWeek.push(event);
    } else if (eventDate <= endOfNextWeek) {
      nextWeek.push(event);
    } else {
      later.push(event);
    }
  }

  const groups: { label: string; events: ExecEvent[] }[] = [];
  if (thisWeek.length > 0) groups.push({ label: "This Week", events: thisWeek });
  if (nextWeek.length > 0) groups.push({ label: "Next Week", events: nextWeek });
  if (later.length > 0) groups.push({ label: "Later", events: later });

  return groups;
}

function EventSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-3 animate-pulse">
      <div className="w-[44px] h-[50px] rounded-[10px] bg-surface-2" />
      <div className="flex-1">
        <div className="h-4 w-24 bg-surface-2 rounded mb-2" />
        <div className="h-3 w-40 bg-surface-2 rounded mb-2" />
        <div className="h-3 w-32 bg-surface-2 rounded" />
      </div>
    </div>
  );
}

function EventCard({ event, isLast }: { event: ExecEvent; isLast: boolean }) {
  const dateBlock = formatDateBlock(event.date);
  const typeStyle = getEventTypeStyle(event.eventType);
  const impactDot = IMPACT_DOTS[event.impact] || IMPACT_DOTS.medium;

  return (
    <Link
      href={`/stock/${event.ticker}`}
      className={`flex gap-3 px-4 py-3 active:opacity-90 transition-opacity ${
        !isLast ? "border-b border-border-hairline" : ""
      }`}
    >
      {/* Date block */}
      <div className="w-[44px] h-[50px] rounded-[10px] bg-surface-2 border border-border-1 flex flex-col items-center justify-center shrink-0">
        <div className="text-[9px] text-text-faint font-mono leading-none uppercase">
          {dateBlock.month}
        </div>
        <div className="text-[16px] font-bold leading-tight">
          {dateBlock.day}
        </div>
        <div className="text-[8px] text-text-faint font-mono leading-none">
          {dateBlock.weekday}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[15px] font-bold">{event.ticker}</span>
          <span className="text-[12px] text-text-muted truncate">
            {event.company}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="font-mono text-[9px] font-medium tracking-[0.5px] uppercase px-2 py-0.5 rounded-md"
            style={{
              backgroundColor: typeStyle.bg,
              color: typeStyle.text,
            }}
          >
            {event.eventType}
          </span>
          <span className="flex items-center gap-1">
            <span
              className="w-[6px] h-[6px] rounded-full inline-block"
              style={{ backgroundColor: impactDot.color }}
            />
            <span className="text-[9px] text-text-faint font-mono">
              {impactDot.label}
            </span>
          </span>
        </div>

        <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">
          {event.description}
        </p>

        {event.time && event.time !== "TBD" && (
          <div className="text-[10px] text-text-faint font-mono mt-1">
            {event.time}
          </div>
        )}
      </div>

      {/* Chevron */}
      <div className="flex items-center shrink-0">
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M6 4L10 8L6 12"
            stroke="var(--text-faint)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Link>
  );
}

export default function EventsPage() {
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/market/exec-events")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load events");
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const eventTypes = data
    ? Array.from(new Set(data.events.map((e) => e.eventType))).sort()
    : [];

  const filtered =
    data?.events.filter((e) => filter === "all" || e.eventType === filter) ?? [];

  const groups = groupByTimeframe(filtered);

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-2">
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
          Exec Events
        </h1>
        <p className="text-[13px] text-text-muted mt-1">
          Track key executive &amp; company events
        </p>
      </header>

      {/* Filter tabs */}
      {!loading && !error && eventTypes.length > 0 && (
        <div className="px-5 pt-2 pb-3">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilter("all")}
              className={`font-mono text-[11px] font-medium px-3 py-1.5 rounded-[8px] whitespace-nowrap ${
                filter === "all"
                  ? "bg-accent-brand/15 text-accent-brand"
                  : "text-text-muted bg-surface-2"
              }`}
            >
              All
            </button>
            {eventTypes.map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`font-mono text-[11px] font-medium px-3 py-1.5 rounded-[8px] whitespace-nowrap ${
                  filter === type
                    ? "bg-accent-brand/15 text-accent-brand"
                    : "text-text-muted bg-surface-2"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary bar */}
      {!loading && !error && data && (
        <div className="px-5 mb-3">
          <div className="flex items-center gap-3 text-[11px] text-text-faint font-mono">
            <span>
              {filtered.length} event{filtered.length !== 1 ? "s" : ""}
            </span>
            {data.generatedAt && (
              <>
                <span className="text-border-1">|</span>
                <span>
                  Updated{" "}
                  {new Date(data.generatedAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <EventSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="px-5">
          <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center">
            <div className="text-[14px] text-text-muted mb-2">
              Unable to load events
            </div>
            <div className="text-[12px] text-text-faint">{error}</div>
          </div>
        </div>
      )}

      {/* Events grouped by timeframe */}
      {!loading && !error && data && (
        <>
          {groups.length > 0 ? (
            groups.map((group) => (
              <div key={group.label} className="px-5 mb-5">
                <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
                  {group.label}
                </h2>
                <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
                  {group.events.map((event, i) => (
                    <EventCard
                      key={`${event.ticker}-${event.date}-${event.eventType}`}
                      event={event}
                      isLast={i === group.events.length - 1}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="px-5">
              <div className="bg-surface-1 border border-border-1 rounded-[18px] p-6 text-center">
                <div className="text-[14px] text-text-muted">
                  No upcoming events found
                </div>
                <div className="text-[12px] text-text-faint mt-1">
                  Check back later for updates
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-5">
        <Disclaimer />
      </div>

      <TabBar />
    </div>
  );
}
