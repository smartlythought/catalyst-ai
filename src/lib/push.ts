// Web Push (PWA notifications) — signed with VAPID and encrypted per the Web
// Push spec via the `web-push` library. Browsers' push services reject
// unsigned/unencrypted messages, which is why the old stub never delivered.
//
// Env (set in Vercel; generate once with `npx web-push generate-vapid-keys`):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — also needed in the browser to subscribe
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT (optional)      — contact URL/mailto for push services
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

export interface PushMessage {
  title: string;
  body: string;
  url?: string; // opened when the notification is tapped
  tag?: string; // same tag replaces an older notification instead of stacking
}

export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function sendPushToAll(
  msg: PushMessage
): Promise<{ sent: number; removed: number; total: number; reason?: string }> {
  if (!pushConfigured()) return { sent: 0, removed: 0, total: 0, reason: "no_vapid_keys" };
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "https://catalyst.claudeo.ai",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const sb = createServiceClient();
  const { data: subs } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (!subs?.length) return { sent: 0, removed: 0, total: 0, reason: "no_subscriptions" };

  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url || "/", tag: msg.tag });
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s: { id: number; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 6 * 3600 }
        );
        sent++;
      } catch (e: any) {
        // 404/410 = the browser dropped this subscription; clean it up.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
          removed++;
        } else {
          console.log("[push] send failed:", e?.statusCode, String(e?.body || e).slice(0, 160));
        }
      }
    })
  );
  return { sent, removed, total: subs.length };
}
