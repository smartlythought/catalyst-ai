import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { userId, title, body: msgBody, url, ticker } = body;

  const supabase = createServiceClient();

  const query = userId
    ? supabase.from("push_subscriptions").select("*").eq("user_id", userId)
    : supabase.from("push_subscriptions").select("*");

  const { data: subs } = await query;
  if (!subs?.length) {
    return NextResponse.json({ sent: 0, reason: "no_subscriptions" });
  }

  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
  if (!VAPID_PRIVATE) {
    return NextResponse.json({ sent: 0, reason: "no_vapid_key" });
  }

  let sent = 0;
  for (const sub of subs) {
    try {
      const payload = JSON.stringify({
        title: title || "Catalyst Alert",
        body: msgBody,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: url || `/stock/${ticker}`, ticker },
      });

      await sendWebPush(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
        VAPID_PRIVATE
      );
      sent++;
    } catch {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("id", sub.id);
    }
  }

  return NextResponse.json({ sent, total: subs.length });
}

async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  _vapidKey: string
) {
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      TTL: "86400",
    },
    body: payload,
  });

  if (!res.ok && res.status === 410) {
    throw new Error("Subscription expired");
  }
}
