import { NextRequest, NextResponse } from "next/server";
import { sendPushToAll } from "@/lib/push";

// Server-to-server: send a push to every subscribed device. CRON_SECRET-gated.
// (Replaces an earlier stub that posted unsigned, unencrypted payloads, which
// push services reject.)
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { title, body, url, ticker } = await request.json().catch(() => ({}));
  if (!body) return NextResponse.json({ error: "Missing body" }, { status: 400 });
  const r = await sendPushToAll({
    title: title || "Catalyst Alert",
    body,
    url: url || (ticker ? `/stock/${ticker}` : "/"),
  });
  return NextResponse.json(r);
}
