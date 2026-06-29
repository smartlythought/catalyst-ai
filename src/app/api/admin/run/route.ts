import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || "";

// Map admin job keys → the existing route + method. Heavy AI jobs that used to
// run on a schedule are now triggered here, on demand.
const JOBS: Record<string, { path: string; method: "GET" | "POST" }> = {
  picks: { path: "/api/picks/daily?refresh=1", method: "GET" },
  ingest: { path: "/api/ingest", method: "POST" },
  deep: { path: "/api/ingest/deep?offset=0&limit=12", method: "POST" },
  weekly: { path: "/api/ingest/weekly-picks", method: "GET" },
};

export async function POST(request: NextRequest) {
  // Owner-only.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { job } = await request.json().catch(() => ({ job: "" }));
  const j = JOBS[job];
  if (!j) {
    return NextResponse.json({ error: "Unknown job" }, { status: 400 });
  }

  // Forward to the real route server-side so the CRON_SECRET never reaches the
  // browser. These jobs make multiple Gemini calls and can run ~tens of secs.
  try {
    const res = await fetch(`${request.nextUrl.origin}${j.path}`, {
      method: j.method,
      headers: CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {},
      signal: AbortSignal.timeout(55_000),
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, status: res.status, result: body });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e).slice(0, 200) },
      { status: 502 }
    );
  }
}
