import { NextRequest, NextResponse } from "next/server";
import { JOBS, runJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Entry point for Vercel Cron (see vercel.json): GET /api/cron/run?job=<key>.
// Vercel sends "Authorization: Bearer $CRON_SECRET" automatically when the
// CRON_SECRET env var is set, so only the scheduler can trigger runs.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const job = request.nextUrl.searchParams.get("job") || "";
  if (!JOBS[job]) return NextResponse.json({ error: "Unknown job" }, { status: 400 });

  const r = await runJob(job, request.nextUrl.origin, "cron");
  return NextResponse.json(
    { job, ok: r.ok, status: r.status, summary: r.summary, notified: r.notified },
    { status: r.ok ? 200 : 502 }
  );
}
