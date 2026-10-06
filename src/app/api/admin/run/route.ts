import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { JOBS, runJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
// Jobs run on open models via the free NVIDIA tier and can take a few minutes.
export const maxDuration = 300;

// Owner-only manual trigger for any job in the shared registry (lib/jobs.ts).
// The run is logged exactly like a scheduled one (trigger "admin"), but no
// push notification is sent — you're already looking at the result.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { job } = await request.json().catch(() => ({ job: "" }));
  if (!JOBS[job]) {
    return NextResponse.json({ error: "Unknown job" }, { status: 400 });
  }

  const r = await runJob(job, request.nextUrl.origin, "admin");
  return NextResponse.json({ ok: r.ok, status: r.status, summary: r.summary, result: r.result });
}
