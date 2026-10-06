"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TabBar } from "@/components/tab-bar";
import { isAdminEmail } from "@/lib/admin";

interface JobDef {
  key: string;
  label: string;
  desc: string;
  est: string;
  free?: boolean;
  viewHref?: string;
}

const JOBS: JobDef[] = [
  {
    key: "picks",
    label: "Regenerate Daily Picks",
    desc: "Today's Calls + short & long term (session-aware pricing, signals, deep-dive)",
    est: "~3–4 calls",
    viewHref: "/picks",
  },
  {
    key: "radar",
    label: "Run Momentum Radar",
    desc: "Live scan for volume surges, gaps & breakouts — no AI",
    est: "Free",
    free: true,
    viewHref: "/radar",
  },
  {
    key: "ingest",
    label: "Run Signal Ingestion",
    desc: "Score the universe, generate fresh BUY/REDUCE/WATCH calls",
    est: "~15 calls",
  },
  {
    key: "deep",
    label: "Run Deep Ingestion",
    desc: "Deep per-stock signal analysis (next batch of 12)",
    est: "~12 calls",
  },
  {
    key: "weekly",
    label: "Generate Weekly Picks",
    desc: "Weekly top short & long term summary",
    est: "~1 call",
    viewHref: "/picks",
  },
  {
    key: "backfill-calls",
    label: "Import Past Calls",
    desc: "Add picks made before the Track Record existed (one-time, safe to re-run)",
    est: "Free",
    free: true,
    viewHref: "/performance",
  },
  {
    key: "cleanup-history",
    label: "Clean AI History",
    desc: "Remove duplicate history rows (same picks copied across days)",
    est: "Free",
    free: true,
    viewHref: "/history",
  },
];

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function AdminPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  // Freshness: last-generated timestamps (read-only, free to fetch).
  const [picksAt, setPicksAt] = useState<string | null>(null);
  const [picksCount, setPicksCount] = useState(0);
  const [radarAt, setRadarAt] = useState<string | null>(null);
  const [radarCount, setRadarCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email || null))
      .catch(() => setEmail(null))
      .finally(() => setChecking(false));
  }, []);

  const loadFreshness = useCallback(async () => {
    // Plain GETs — these serve saved data and never spend on Gemini.
    try {
      const r = await fetch("/api/picks/daily");
      const d = await r.json();
      setPicksAt(d.generatedAt || null);
      setPicksCount((d.picks || []).length);
    } catch {}
    try {
      const r = await fetch("/api/market/radar");
      const d = await r.json();
      setRadarAt(d.at || null);
      setRadarCount((d.hits || []).length);
    } catch {}
  }, []);

  useEffect(() => {
    if (email && isAdminEmail(email)) loadFreshness();
  }, [email, loadFreshness]);

  async function run(job: string) {
    setRunning(job);
    setResults((r) => ({ ...r, [job]: "Running… (may take ~30–60s)" }));
    try {
      const res = await fetch("/api/admin/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResults((r) => ({ ...r, [job]: `❌ ${data.error || res.status}` }));
      } else {
        const inner = data.result || {};
        const summary =
          inner.calls != null && inner.runs != null
            ? `✅ ${inner.calls} past calls from ${inner.runs} runs imported`
            : inner.deleted != null
            ? `✅ removed ${inner.deleted} duplicate${inner.deleted === 1 ? "" : "s"} · ${inner.kept} kept`
            : inner.picks != null
            ? `✅ ${Array.isArray(inner.picks) ? inner.picks.length : inner.picks} picks generated`
            : inner.hits != null
              ? `✅ ${Array.isArray(inner.hits) ? inner.hits.length : inner.hits} in play`
              : inner.stored != null
                ? `✅ stored ${inner.stored}`
                : inner.aiCandidates != null
                  ? `✅ ${inner.aiCandidates} candidates analyzed`
                  : data.ok
                    ? "✅ Done"
                    : `⚠️ ${inner.error || "completed with issues"}`;
        setResults((r) => ({ ...r, [job]: summary }));
        // Refresh the freshness stamps after a successful run.
        loadFreshness();
      }
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

  // Freshness helper per job.
  const freshnessFor = (key: string): { at: string | null; count: number } | null => {
    if (key === "picks") return { at: picksAt, count: picksCount };
    if (key === "radar") return { at: radarAt, count: radarCount };
    return null;
  };
  const isStale = (at: string | null) =>
    !at || Date.now() - new Date(at).getTime() > 20 * 3600_000;

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-3">
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">Admin · Run Tools</h1>
        <p className="text-[13px] text-text-muted mt-1">
          Everything runs on demand — nothing auto-runs or spends on its own.
          Tap Run to refresh. Signed in as {email}.
        </p>
        <Link href="/performance" className="inline-block mt-2 text-[12px] font-bold text-accent-brand">
          Track Record &rsaquo;
        </Link>
      </header>

      <div className="px-5 flex flex-col gap-3">
        {JOBS.map((j) => {
          const fresh = freshnessFor(j.key);
          const stale = fresh ? isStale(fresh.at) : false;
          return (
            <div key={j.key} className="bg-surface-1 border border-border-1 rounded-[18px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-bold">{j.label}</span>
                    <span
                      className={`font-mono text-[9px] uppercase tracking-[0.5px] px-1.5 py-0.5 rounded border ${
                        j.free
                          ? "text-pos-green border-pos-green/30 bg-pos-green/10"
                          : "text-text-faint border-chip-border bg-chip-bg"
                      }`}
                    >
                      {j.est}
                    </span>
                  </div>
                  <p className="text-[12px] text-text-muted mt-1">{j.desc}</p>

                  {/* Freshness line */}
                  {fresh && (
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={`w-[6px] h-[6px] rounded-full ${
                          stale ? "bg-neutral-watch" : "bg-pos-green"
                        }`}
                      />
                      <span className="text-[11px] font-mono text-text-faint">
                        {fresh.count > 0
                          ? `${fresh.count} · generated ${ago(fresh.at)}`
                          : "not generated yet"}
                        {stale && fresh.count > 0 ? " · stale" : ""}
                      </span>
                      {j.viewHref && fresh.count > 0 && (
                        <Link
                          href={j.viewHref}
                          className="text-[11px] font-bold text-accent-brand ml-auto"
                        >
                          View &rsaquo;
                        </Link>
                      )}
                    </div>
                  )}

                  {results[j.key] && (
                    <p className="text-[12px] font-mono mt-2 text-text-secondary">
                      {results[j.key]}
                    </p>
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

      <div className="px-5 mt-5">
        <div className="bg-surface-1 border border-border-1 rounded-[14px] p-4 text-[12px] text-text-faint leading-relaxed">
          <span className="text-accent-brand font-semibold">On-demand mode.</span>{" "}
          Nothing runs automatically anymore, so opening the app never spends on
          Google AI — it shows the last generated data until you tap Run here.
          The Momentum Radar is free (no AI). Watch your spend cap for the
          Gemini jobs.
        </div>
      </div>

      <TabBar />
    </div>
  );
}
