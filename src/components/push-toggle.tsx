"use client";

import { useEffect, useState } from "react";

// Enable / test phone notifications for this device (PWA Web Push).
// iPhone: works only after "Add to Home Screen" and opening Catalyst from the
// home-screen icon (iOS 16.4+). Android Chrome works in the browser or app.

type State = "checking" | "unsupported" | "needs-key" | "blocked" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState("unsupported");
      }
      if (!PUBLIC_KEY) return setState("needs-key");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) as BufferSource,
        }));
      const res = await fetch("/api/notifications/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setState("on");
      setMsg("Enabled on this device.");
    } catch (e) {
      setMsg(`Couldn't enable: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/notifications/register", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("Turned off on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/notifications/test", { method: "POST" }).then((x) => x.json());
      setMsg(
        r.sent > 0
          ? `Test sent to ${r.sent} device${r.sent > 1 ? "s" : ""} — check your notifications.`
          : `Not sent (${r.reason || r.error || "unknown"}).`
      );
    } finally {
      setBusy(false);
    }
  }

  const status: Record<State, string> = {
    checking: "Checking…",
    unsupported:
      "This browser can't receive push. On iPhone, add Catalyst to your Home Screen and open it from the icon.",
    "needs-key": "Not set up yet — add the VAPID keys in Vercel and redeploy.",
    blocked: "Blocked for this site — allow notifications in your browser/site settings.",
    off: "Off on this device.",
    on: "On — you'll get picks, breakouts and run alerts.",
  };

  return (
    <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold">🔔 Phone notifications</div>
          <p className="text-[12px] text-text-muted mt-1">{status[state]}</p>
          {msg && <p className="text-[12px] font-mono mt-2 text-text-secondary">{msg}</p>}
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {state === "off" && (
            <button
              onClick={enable}
              disabled={busy}
              className="px-4 h-[40px] rounded-[12px] bg-accent-brand text-white font-bold text-[13px] disabled:opacity-40"
            >
              Enable
            </button>
          )}
          {state === "on" && (
            <>
              <button
                onClick={test}
                disabled={busy}
                className="px-4 h-[36px] rounded-[12px] bg-accent-brand text-white font-bold text-[12px] disabled:opacity-40"
              >
                Send test
              </button>
              <button
                onClick={disable}
                disabled={busy}
                className="px-4 h-[32px] rounded-[12px] border border-border-1 text-text-muted font-bold text-[11px] disabled:opacity-40"
              >
                Turn off
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
