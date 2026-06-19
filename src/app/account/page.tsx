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
    }
    load();
  }, [router]);

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
            ].map((item, i) => (
              <div
                key={item.label}
                className={`flex items-center justify-between px-4 py-3.5 ${
                  i < 2 ? "border-b border-border-hairline" : ""
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

        {/* Quick actions */}
        <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden mb-5">
          {[
            { label: "Edit profile", href: "/onboarding", icon: "pencil" },
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
