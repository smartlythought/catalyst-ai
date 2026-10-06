// Single registry for every runnable job — used by the Admin "Run" buttons and
// by the scheduled crons (/api/cron/run?job=…). Every run is logged to
// job_runs (so pages can show "last updated" and Admin can show run health),
// and scheduled runs send a phone push with the result or a failure alert.
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushToAll, type PushMessage } from "@/lib/push";

export type JobTrigger = "cron" | "admin";

export interface JobDef {
  label: string;
  path: string;
  method: "GET" | "POST";
  // Scheduled-run notification built from the job's JSON result (null = silent).
  notify?: (result: any) => PushMessage | null;
}

const DEEP_BATCH = 12;
const DEEP_MAX_OFFSET = 240; // cycle the ~240 largest stocks (~4 weeks of weekdays)

function picksMessage(r: any): PushMessage | null {
  const picks: any[] = Array.isArray(r?.picks) ? r.picks : [];
  if (!picks.length) return null;
  const short = picks
    .filter((p) => p.timeframe === "short-term")
    .slice(0, 5)
    .map((p) => (p.convictionBasis === "strength" ? `${p.symbol} ${p.conviction}` : p.symbol));
  const long = picks.filter((p) => p.timeframe === "long-term").slice(0, 4).map((p) => p.symbol);
  return {
    title: "📈 Today's picks are ready",
    body: [short.length ? `Short-term: ${short.join(", ")}` : "", long.length ? `Long-term: ${long.join(", ")}` : ""]
      .filter(Boolean)
      .join(" · "),
    url: "/",
    tag: "daily-picks",
  };
}

function radarMessage(r: any): PushMessage | null {
  const strong: any[] = (Array.isArray(r?.hits) ? r.hits : []).filter((h: any) => h.heat >= 45).slice(0, 4);
  if (!strong.length) return null;
  return {
    title: `⚡ ${strong.length} stock${strong.length > 1 ? "s" : ""} breaking out`,
    body: strong
      .map((h) => `${h.symbol} ${h.changePct >= 0 ? "+" : ""}${Number(h.changePct).toFixed(1)}%`)
      .join(" · "),
    url: "/radar",
    tag: "radar",
  };
}

export const JOBS: Record<string, JobDef> = {
  picks: { label: "Daily Picks", path: "/api/picks/daily?refresh=1", method: "GET", notify: picksMessage },
  penny: { label: "High-Yield picks", path: "/api/market/penny", method: "GET" },
  ipo: { label: "IPO analysis", path: "/api/market/ipo", method: "GET" },
  radar: { label: "Momentum Radar", path: "/api/market/radar?refresh=1", method: "GET", notify: radarMessage },
  ingest: { label: "Signal ingestion", path: "/api/ingest", method: "POST" },
  deep: { label: "Deep ingestion", path: `/api/ingest/deep?limit=${DEEP_BATCH}`, method: "POST" },
  weekly: {
    label: "Weekly picks",
    path: "/api/ingest/weekly-picks",
    method: "GET",
    notify: () => ({ title: "🗓️ Weekly picks updated", body: "Your weekly short & long-term summary is ready.", url: "/picks", tag: "weekly" }),
  },
  universe: { label: "Universe refresh", path: "/api/ingest/universe", method: "POST" },
  "cleanup-history": { label: "Clean AI history", path: "/api/admin/cleanup-history", method: "POST" },
  "backfill-calls": { label: "Import past calls", path: "/api/admin/backfill-calls", method: "POST" },
};

/** Deep ingestion walks the largest stocks in batches; resume after the last run. */
async function nextDeepOffset(): Promise<number> {
  try {
    const sb = createServiceClient();
    const { data } = await sb
      .from("job_runs")
      .select("result")
      .eq("job", "deep")
      .eq("ok", true)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = Number(data?.result?.nextOffset);
    return Number.isFinite(next) && next < DEEP_MAX_OFFSET ? next : 0;
  } catch {
    return 0;
  }
}

function summarize(job: string, ok: boolean, status: number, r: any): string {
  if (!ok) return `Failed (${status || "network"}): ${String(r?.error || r?.message || "").slice(0, 140)}`;
  if (job === "picks" && Array.isArray(r?.picks)) {
    const s = r.picks.filter((p: any) => p.timeframe === "short-term").length;
    return `${r.picks.length} picks (${s} short, ${r.picks.length - s} long) from ${r.stocksScanned ?? "?"} stocks`;
  }
  if (Array.isArray(r?.hits)) return `${r.hits.length} stocks in play`;
  if (Array.isArray(r?.picks)) return `${r.picks.length} picks${r.cached ? " (already generated today)" : ""}`;
  if (Array.isArray(r?.ipos)) return `${r.ipos.length} IPOs`;
  if (r?.processed != null) return `${r.ingested ?? r.processed} stocks analysed (offset ${r.offset})`;
  if (r?.calls != null && r?.runs != null) return `${r.calls} calls from ${r.runs} runs`;
  if (r?.deleted != null) return `removed ${r.deleted} duplicates`;
  return "Done";
}

export interface JobRunResult {
  ok: boolean;
  status: number;
  summary: string;
  result: any;
  notified?: { sent: number; reason?: string };
}

/**
 * Run a job by calling its route server-side (CRON_SECRET stays on the
 * server), log it to job_runs, and — for scheduled runs — push the outcome.
 */
export async function runJob(key: string, origin: string, trigger: JobTrigger): Promise<JobRunResult> {
  const job = JOBS[key];
  if (!job) return { ok: false, status: 400, summary: "Unknown job", result: null };

  const sb = createServiceClient();
  let runId: number | null = null;
  try {
    const { data } = await sb.from("job_runs").insert({ job: key, trigger }).select("id").single();
    runId = data?.id ?? null;
  } catch {
    /* logging is best-effort — the job still runs */
  }

  let path = job.path;
  if (key === "deep") path += `&offset=${await nextDeepOffset()}`;

  const secret = process.env.CRON_SECRET || "";
  let ok = false;
  let status = 0;
  let result: any = null;
  try {
    const res = await fetch(`${origin}${path}`, {
      method: job.method,
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      signal: AbortSignal.timeout(280_000),
    });
    status = res.status;
    result = await res.json().catch(() => ({}));
    ok = res.ok && !result?.error;
  } catch (e) {
    result = { error: String(e).slice(0, 200) };
  }

  const summary = summarize(key, ok, status, result);
  if (runId != null) {
    try {
      await sb
        .from("job_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok,
          status,
          summary,
          // Keep only small fields — full job output can be large.
          result: key === "deep" ? { nextOffset: result?.nextOffset ?? null } : null,
        })
        .eq("id", runId);
    } catch {
      /* best-effort */
    }
  }

  let notified: JobRunResult["notified"];
  if (trigger === "cron") {
    const msg = ok
      ? job.notify?.(result) ?? null
      : { title: `⚠️ ${job.label} failed`, body: summary, url: "/admin", tag: `fail-${key}` };
    if (msg) notified = await sendPushToAll(msg).catch((e) => ({ sent: 0, reason: String(e).slice(0, 80) }));
  }

  return { ok, status, summary, result, notified };
}

export interface JobRunRow {
  id: number;
  job: string;
  trigger: JobTrigger;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  status: number | null;
  summary: string | null;
}

/** Most recent runs (newest first), for Admin and freshness stamps. */
export async function recentJobRuns(limit = 40): Promise<JobRunRow[]> {
  try {
    const sb = createServiceClient();
    const { data } = await sb
      .from("job_runs")
      .select("id, job, trigger, started_at, finished_at, ok, status, summary")
      .order("started_at", { ascending: false })
      .limit(limit);
    return (data as JobRunRow[]) || [];
  } catch {
    return [];
  }
}
