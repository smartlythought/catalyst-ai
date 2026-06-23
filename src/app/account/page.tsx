"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TabBar } from "@/components/tab-bar";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappSaved, setWhatsappSaved] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [emailTestSending, setEmailTestSending] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<"ok" | "fail" | null>(null);
  const [emailTestError, setEmailTestError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user: u },
      } = await supabase.auth.getUser();

      if (!u) {
        router.push("/auth/login");
        return;
      }

      setUser(u);

      const { data } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", u.id)
        .single();

      setProfile(data);
      if (data?.whatsapp_number) setWhatsappNumber(data.whatsapp_number);
    }
    load();
  }, [router]);

  async function saveWhatsapp() {
    if (!user || !whatsappNumber.replace(/\D/g, "")) return;
    setWhatsappSaving(true);
    const supabase = createClient();
    await supabase
      .from("user_profiles")
      .update({ whatsapp_number: whatsappNumber.replace(/\D/g, "") })
      .eq("id", user.id);
    setWhatsappSaving(false);
    setWhatsappSaved(true);
    setTimeout(() => setWhatsappSaved(false), 2000);
  }

  async function sendTestAlert() {
    setTestSending(true);
    setTestResult(null);
    setTestError(null);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: "NVDA",
          call: "BUY",
          conviction: 92,
          price: 210.69,
          entry: 208.0,
          target: 235.0,
          stop: 195.0,
          why: "This is a test alert from Catalyst. If you received this, WhatsApp alerts are working!",
        }),
      });
      if (res.ok) {
        setTestResult("ok");
      } else {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        setTestResult("fail");
        setTestError(data.error || `HTTP ${res.status}`);
      }
    } catch {
      setTestResult("fail");
      setTestError("Network error");
    }
    setTestSending(false);
    setTimeout(() => { setTestResult(null); setTestError(null); }, 8000);
  }

  async function sendTestEmail() {
    setEmailTestSending(true);
    setEmailTestResult(null);
    setEmailTestError(null);
    try {
      const res = await fetch("/api/email/test", { method: "POST" });
      if (res.ok) {
        setEmailTestResult("ok");
      } else {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        setEmailTestResult("fail");
        setEmailTestError(data.error || `HTTP ${res.status}`);
      }
    } catch {
      setEmailTestResult("fail");
      setEmailTestError("Network error");
    }
    setEmailTestSending(false);
    setTimeout(() => { setEmailTestResult(null); setEmailTestError(null); }, 8000);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (!user) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const initials = (user.user_metadata?.full_name || user.email || "U")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const goalLabels: Record<string, string> = {
    grow_wealth: "Grow my wealth",
    generate_income: "Generate income",
    trade_actively: "Trade actively",
  };

  const riskLabels: Record<string, string> = {
    conservative: "Conservative",
    balanced: "Balanced",
    aggressive: "Aggressive",
  };

  return (
    <div className="min-h-dvh pb-24">
      <header className="safe-top px-5 pb-4">
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
          Account
        </h1>
      </header>

      <div className="px-5">
        {/* Profile card */}
        <div className="bg-surface-1 border border-border-1 rounded-[18px] p-5 mb-5 flex items-center gap-4">
          <div className="w-[52px] h-[52px] rounded-full bg-accent-brand/15 border border-accent-brand/30 flex items-center justify-center text-[18px] font-bold text-accent-brand">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-bold truncate">
              {user.user_metadata?.full_name || "Catalyst User"}
            </div>
            <div className="text-[13px] text-text-muted truncate">
              {user.email}
            </div>
          </div>
        </div>

        {/* Preferences */}
        {profile && (
          <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden mb-5">
            {[
              {
                label: "Goal",
                value: goalLabels[profile.goal] || profile.goal || "—",
              },
              {
                label: "Risk",
                value:
                  riskLabels[profile.risk_tolerance] ||
                  profile.risk_tolerance ||
                  "—",
              },
              {
                label: "Capital",
                value: profile.capital_range || "—",
              },
              {
                label: "Timezone",
                value: profile.timezone?.replace(/_/g, " ").replace(/\//g, " / ") || Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " "),
              },
            ].map((item, i) => (
              <div
                key={item.label}
                className={`flex items-center justify-between px-4 py-3.5 ${
                  i < 3 ? "border-b border-border-hairline" : ""
                }`}
              >
                <span className="text-[14px] text-text-muted">
                  {item.label}
                </span>
                <span className="text-[14px] font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* WhatsApp */}
        <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden mb-5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366"/>
              <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="#25D366" strokeWidth="1.5" fill="none"/>
            </svg>
            <span className="text-[14px] font-semibold">WhatsApp Alerts</span>
          </div>
          <div className="flex gap-2">
            <input
              type="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="flex-1 h-[42px] rounded-[10px] bg-surface-2 border border-border-1 px-3 font-mono text-[14px] text-text-primary placeholder:text-text-faint outline-none focus:border-accent-brand"
            />
            <button
              onClick={saveWhatsapp}
              disabled={whatsappSaving || !whatsappNumber.replace(/\D/g, "")}
              className={`h-[42px] px-4 rounded-[10px] font-bold text-[13px] transition-all ${
                whatsappSaved
                  ? "bg-pos-green/15 text-pos-green border border-pos-green/30"
                  : "bg-accent-brand text-white"
              } disabled:opacity-40`}
            >
              {whatsappSaving ? "..." : whatsappSaved ? "Saved" : "Save"}
            </button>
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-[11px] text-text-faint">
              Enter number with country code (e.g. +91...)
            </p>
            {profile?.whatsapp_number && (
              <button
                onClick={sendTestAlert}
                disabled={testSending}
                className={`text-[11px] font-bold px-3 py-1 rounded-[8px] transition-all ${
                  testResult === "ok"
                    ? "bg-pos-green/15 text-pos-green"
                    : testResult === "fail"
                      ? "bg-neg-red/15 text-neg-red"
                      : "bg-accent-brand/10 text-accent-brand"
                }`}
              >
                {testSending
                  ? "Sending..."
                  : testResult === "ok"
                    ? "Sent! Check WhatsApp"
                    : testResult === "fail"
                      ? "Failed"
                      : "Send test alert"}
              </button>
            )}
          </div>
          {testError && (
            <p className="text-[11px] text-neg-red mt-2 font-mono break-all">
              {testError}
            </p>
          )}
          {!profile?.whatsapp_number && (
            <p className="text-[11px] text-accent-brand mt-1 font-medium">
              Save your number, then enable WhatsApp in Alert settings.
            </p>
          )}
        </div>

        {/* Email Alerts */}
        <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden mb-5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="3" stroke="#3B82F6" strokeWidth="1.5" fill="none"/>
              <path d="M2 7L12 13L22 7" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[14px] font-semibold">Email Alerts</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-text-secondary">
                {user.email}
              </p>
              <p className="text-[11px] text-text-faint mt-0.5">
                Enable Email in Alert settings to receive stock calls
              </p>
            </div>
            <button
              onClick={sendTestEmail}
              disabled={emailTestSending}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-[8px] transition-all shrink-0 ml-3 ${
                emailTestResult === "ok"
                  ? "bg-pos-green/15 text-pos-green"
                  : emailTestResult === "fail"
                    ? "bg-neg-red/15 text-neg-red"
                    : "bg-blue-500/10 text-blue-500"
              }`}
            >
              {emailTestSending
                ? "Sending..."
                : emailTestResult === "ok"
                  ? "Sent! Check inbox"
                  : emailTestResult === "fail"
                    ? "Failed"
                    : "Send test email"}
            </button>
          </div>
          {emailTestError && (
            <p className="text-[11px] text-neg-red mt-2 font-mono break-all">
              {emailTestError}
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden mb-5">
          {[
            { label: "Edit preferences", href: "/onboarding", icon: "pencil" },
            { label: "Alert settings", href: "/alerts", icon: "bell" },
            { label: "Portfolio", href: "/portfolio", icon: "chart" },
            { label: "AI Chat", href: "/chat", icon: "chat" },
          ].map((item, i) => (
            <a
              key={item.label}
              href={item.href}
              className={`flex items-center justify-between px-4 py-3.5 ${
                i < 3 ? "border-b border-border-hairline" : ""
              }`}
            >
              <span className="text-[15px] font-medium">{item.label}</span>
              <span className="text-[14px] text-text-faint">&rsaquo;</span>
            </a>
          ))}
        </div>

        {/* Appearance */}
        <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden mb-5">
          <ThemeToggle />
        </div>

        {/* App info */}
        <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden mb-5">
          {[
            { label: "Version", value: "1.0.0" },
            { label: "AI Model", value: "Gemini 2.5 Flash" },
            { label: "Data Sources", value: "FMP + Finnhub + SEC" },
          ].map((item, i) => (
            <div
              key={item.label}
              className={`flex items-center justify-between px-4 py-3.5 ${
                i < 2 ? "border-b border-border-hairline" : ""
              }`}
            >
              <span className="text-[14px] text-text-muted">{item.label}</span>
              <span className="text-[13px] font-mono text-text-faint">
                {item.value}
              </span>
            </div>
          ))}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full h-[52px] rounded-[14px] border border-neg-red/30 text-neg-red font-bold text-[15px]"
        >
          Sign out
        </button>

        <p className="text-[10px] text-text-faint font-mono tracking-[0.5px] text-center mt-4 mb-2">
          Catalyst is not a financial advisor. All AI calls are for
          informational purposes only.
        </p>
      </div>

      <TabBar />
    </div>
  );
}
