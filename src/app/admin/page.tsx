"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TabBar } from "@/components/tab-bar";
import { isAdminEmail } from "@/lib/admin";
import { PushToggle } from "@/components/push-toggle";
import { UpdatedStamp } from "@/components/updated-stamp";
import { formatET } from "@/lib/time";

interface JobDef {
  key: string;
  label: string;
  desc: string;
  schedule?: string; // human-readable; must match vercel.json
  ai?: boolean;
  viewHref?: string;
}

// Keys must match src/lib/jobs.ts. Schedules mirror vercel.json (Vercel Hobby
// runs each cron once a day, at some point within the scheduled hour).
const JOBS: JobDef[] = [
  { key: "picks", label: "Daily Picks", desc: "Short-term momentum picks + long-term AI picks, with stops/targets", schedule: "Weekdays ~8 AM ET (pre-market)", ai: true, viewHref: "/picks" },
  { key: "radar", label: "Momentum Radar", desc: "Live scan for volume surges, gaps & breakouts — no AI", schedule: "Weekdays ~11 AM ET", viewHref: "/radar" },
  { key: "penny", label: "High-Yield picks", desc: "Small-cap growth ideas (generated once per day)", schedule: "Weekdays ~7 AM ET", ai: true, viewHref: "/penny" },
  { key: "ipo", label: "IPO analysis", desc: "AI rating of upcoming IPOs (generated once per day)", schedule: "Weekdays ~7 AM ET", ai: true, viewHref: "/ipo" },
  { key: "ingest", label: "Signal ingestion", desc: "Score the universe, fresh BUY/REDUCE/WATCH calls", schedule: "Weekdays ~5 PM ET (after close)", ai: true },
  { key: "deep", label: "Deep ingestion", desc: "Deep analysis of the next 12 largest stocks (cycles through ~240)", schedule: "Weekdays ~6 PM ET", ai: true },
  { key: "weekly", label: "Weekly picks", desc: "Weekly short & long-term summary", schedule: "Fridays ~6 PM ET", ai: true },
  { key: "universe", label: "Universe refresh", desc: "Refresh the list of US stocks from the exchange directory", schedule: "Mondays ~6 AM ET" },
  { key: "backfill-calls", label: "Import past calls", desc: "Add picks made before the Track Record existed (safe to re-run)", viewHref: "/performance" },
  { key: "cleanup-history", label: "Clean AI history", desc: "Remove duplicate history rows", viewHref: "/history" },
];

interface RunRow {
  id: number;
  job: string;
  trigger: "cron" | "admin";
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  summary: string | null;
}

export default function AdminPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [picksAt, setPicksAt] = useState<string | null>(null);
  const [radarAt, setRadarAt] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email || null))
      .catch(() => setEmail(null))
      .finally(() => setChecking(false));
  }, []);

  const loadStatus = useCallback(async () => {
    // Read-only GETs — serve saved data, never trigger a generation.
    fetch("/api/admin/runs")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs || []))
      .catch(() => {})
      .finally(() => setRunsLoaded(true));
    fetch("/api/picks/daily")
      .then((r) => r.json())
      .then((d) => setPicksAt(d.generatedAt || null))
      .catch(() => {});
    fetch("/api/market/radar")
      .then((r) => r.json())
      .then((d) => setRadarAt(d.at || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (email && isAdminEmail(email)) loadStatus();
  }, [email, loadStatus]);

  async function run(job: string) {
    setRunning(job);
    setResults((r) => ({ ...r, [job]: "Running… (can take 1–3 min on the free AI tier)" }));
    try {
      const res = await fetch("/api/admin/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      });
      const data = await res.json();
      setResults((r) => ({
        ...r,
        [job]: !res.ok ? `❌ ${data.error || res.status}` : `${data.ok ? "✅" : "⚠️"} ${data.summary || "Done"}`,
      }));
      loadStatus();
    } catch (e) {
      setResults((r) => ({ ...r, [job]: `❌ ${String(e).slice(0, 80)}` }));
    } finally {
      setRunning(null);
    }
  }

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!email) {
    return (
      <div className="min-h-dvh pb-24 safe-top flex flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[20px] font-extrabold mb-2">Admin</h1>
        <p className="text-text-muted text-[14px] mb-4">Sign in to access admin tools.</p>
        <Link href="/auth/login" className="px-6 py-3 rounded-[14px] bg-accent-brand text-white font-bold text-[15px]">
          Sign in
        </Link>
        <TabBar />
      </div>
    );
  }

  if (!isAdminEmail(email)) {
    return (
      <div className="min-h-dvh pb-24 safe-top flex flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[20px] font-extrabold mb-2">Admin</h1>
        <p className="text-text-muted text-[14px]">
          This account ({email}) isn&apos;t authorized for admin tools.
        </p>
        <TabBar />
      </div>
    );
  }

  const lastRun = (key: string) => runs.find((r) => r.job === key);

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-3">
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">Admin · Automation</h1>
        <p className="text-[13px] text-text-muted mt-1">
          Jobs run automatically on the schedule below (US Eastern time). AI runs
          on the free NVIDIA tier. Tap Run to refresh anything now. Signed in as {email}.
        </p>
        <Link href="/performance" className="inline-block mt-2 text-[12px] font-bold text-accent-brand">
          Track Record &rsaquo;
        </Link>
      </header>

      <div className="px-5 mb-3">
        <PushToggle />
      </div>

      <div className="px-5 flex flex-col gap-3">
        {JOBS.map((j) => {
          const last = lastRun(j.key);
          return (
            <div key={j.key} className="bg-surface-1 border border-border-1 rounded-[18px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-bold">{j.label}</span>
                    <span
                      className={`font-mono text-[9px] uppercase tracking-[0.5px] px-1.5 py-0.5 rounded border ${
                        j.ai ? "text-accent-brand border-accent-brand/30 bg-accent-brand/10" : "text-pos-green border-pos-green/30 bg-pos-green/10"
                      }`}
                    >
                      {j.ai ? "AI · free tier" : "No AI"}
                    </span>
                  </div>
                  <p className="text-[12px] text-text-muted mt-1">{j.desc}</p>
                  <p className="text-[11px] font-mono text-text-faint mt-1">
                    {j.schedule ? `⏱ Auto: ${j.schedule}` : "Manual only"}
                  </p>

                  {/* Data freshness (from the data itself) */}
                  {j.key === "picks" && <UpdatedStamp at={picksAt} label="Picks generated" staleIfNotToday className="mt-1.5" />}
                  {j.key === "radar" && <UpdatedStamp at={radarAt} label="Last scan" staleAfterHours={24} className="mt-1.5" />}

                  {/* Last run (from the run log) */}
                  {last ? (
                    <p className="text-[11px] font-mono mt-1.5" style={{ color: last.ok === false ? "#F5A524" : "var(--text-faint)" }}>
                      {last.ok == null ? "⏳ Running since" : last.ok ? "✓ Last run" : "⚠ Failed"} {formatET(last.started_at)}
                      {" · "}
                      {last.trigger === "cron" ? "auto" : "manual"}
                      {last.summary ? ` · ${last.summary}` : ""}
                    </p>
                  ) : runsLoaded ? (
                    <p className="text-[11px] font-mono text-text-faint mt-1.5">No runs logged yet</p>
                  ) : null}

                  {results[j.key] && (
                    <p className="text-[12px] font-mono mt-2 text-text-secondary">{results[j.key]}</p>
                  )}
                  {j.viewHref && (
                    <Link href={j.viewHref} className="inline-block text-[11px] font-bold text-accent-brand mt-1.5">
                      View &rsaquo;
                    </Link>
                  )}
                </div>
                <button
                  onClick={() => run(j.key)}
                  disabled={running !== null}
                  className="shrink-0 px-4 h-[40px] rounded-[12px] bg-accent-brand text-white font-bold text-[13px] disabled:opacity-40"
                >
                  {running === j.key ? "Running…" : "Run"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full run log */}
      <div className="px-5 mt-6">
        <h2 className="text-[15px] font-bold mb-2">Run log</h2>
        {runs.length === 0 ? (
          <div className="bg-surface-1 border border-border-1 rounded-[14px] p-4 text-[12px] text-text-faint">
            {runsLoaded ? "No runs yet — scheduled runs will appear here." : "Loading…"}
          </div>
        ) : (
          <div className="bg-surface-1 border border-border-1 rounded-[14px] divide-y divide-border-1">
            {runs.slice(0, 30).map((r) => (
              <div key={r.id} className="px-3.5 py-2.5 text-[11px] font-mono">
                <div className="flex items-center gap-2">
                  <span style={{ color: r.ok === false ? "#F5A524" : r.ok ? "var(--pos-green)" : "var(--text-faint)" }}>
                    {r.ok == null ? "⏳" : r.ok ? "✓" : "⚠"}
                  </span>
                  <span className="font-bold text-text-secondary">{JOBS.find((j) => j.key === r.job)?.label || r.job}</span>
                  <span className="text-text-faint">{r.trigger === "cron" ? "auto" : "manual"}</span>
                  <span className="ml-auto text-text-faint">{formatET(r.started_at)}</span>
                </div>
                {r.summary && <div className="text-text-faint mt-0.5 pl-5">{r.summary}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <TabBar />
    </div>
  );
}
