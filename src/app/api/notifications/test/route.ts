import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { sendPushToAll } from "@/lib/push";

// Owner-only: send a test notification to every subscribed device.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
  const r = await sendPushToAll({
    title: "✅ Catalyst notifications work",
    body: `Test sent at ${time} ET. You'll get picks, breakouts and run alerts here.`,
    url: "/admin",
    tag: "test",
  });
  return NextResponse.json(r);
}
