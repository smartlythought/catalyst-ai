"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TabBar } from "@/components/tab-bar";

interface JobDef {
  key: string;
  label: string;
  desc: string;
  est: string;
}

const JOBS: JobDef[] = [
  {
    key: "picks",
    label: "Regenerate Daily Picks",
    desc: "Today's Calls + short & long term (2 Gemini calls)",
    est: "~2 calls",
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
  },
];

export default function AdminPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email || null))
      .catch(() => setEmail(null))
      .finally(() => setChecking(false));
  }, []);

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
          inner.picks != null
            ? `✅ ${Array.isArray(inner.picks) ? inner.picks.length : inner.picks} picks`
            : inner.stored != null
              ? `✅ stored ${inner.stored}`
              : inner.aiCandidates != null
                ? `✅ ${inner.aiCandidates} candidates analyzed`
                : data.ok
                  ? "✅ Done"
                  : `⚠️ ${inner.error || "completed with issues"}`;
        setResults((r) => ({ ...r, [job]: summary }));
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

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-3">
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">Admin · AI Jobs</h1>
        <p className="text-[13px] text-text-muted mt-1">
          Run AI analysis on demand. Each run consumes Gemini quota — watch your
          spend cap. Signed in as {email}.
        </p>
      </header>

      <div className="px-5 flex flex-col gap-3">
        {JOBS.map((j) => (
          <div key={j.key} className="bg-surface-1 border border-border-1 rounded-[18px] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold">{j.label}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.5px] text-text-faint px-1.5 py-0.5 rounded bg-chip-bg border border-chip-border">
                    {j.est}
                  </span>
                </div>
                <p className="text-[12px] text-text-muted mt-1">{j.desc}</p>
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
        ))}
      </div>

      <div className="px-5 mt-5">
        <div className="bg-surface-1 border border-border-1 rounded-[14px] p-4 text-[12px] text-text-faint">
          Heavy ingestion no longer runs automatically — trigger it here when you
          want fresh analysis. Daily Picks still auto-generate once per trading
          day on first visit.
        </div>
      </div>

      <TabBar />
    </div>
  );
}
