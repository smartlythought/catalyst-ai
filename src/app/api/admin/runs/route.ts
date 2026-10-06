import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { recentJobRuns } from "@/lib/jobs";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

// Owner-only: recent job runs (scheduled + manual) for the Admin run log.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return NextResponse.json({ runs: await recentJobRuns(60), pushConfigured: pushConfigured() });
}
