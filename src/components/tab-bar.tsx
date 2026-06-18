"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const tabs = [
  {
    name: "Signals",
    href: "/",
    match: (p: string) => p === "/" || p.startsWith("/signal"),
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <path
          d="M3 17V12M8 17V8M13 17V10M18 17V5"
          stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    name: "Search",
    href: "/search",
    match: (p: string) => p.startsWith("/search") || p.startsWith("/stock"),
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <circle
          cx="10"
          cy="10"
          r="6"
          stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"}
          strokeWidth="1.5"
        />
        <path
          d="M14.5 14.5L19 19"
          stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    name: "Watchlist",
    href: "/watchlist",
    match: (p: string) => p.startsWith("/watchlist"),
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <path
          d="M11 3L13.5 8.5L19.5 9L15 13.5L16.5 19.5L11 16.5L5.5 19.5L7 13.5L2.5 9L8.5 8.5L11 3Z"
          stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    name: "Alerts",
    href: "/alerts",
    match: (p: string) => p.startsWith("/alerts"),
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <path
          d="M11 3C7.68 3 5 5.68 5 9V13L3 16H19L17 13V9C17 5.68 14.32 3 11 3Z"
          stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M9 16C9 17.1 9.9 18 11 18C12.1 18 13 17.1 13 16"
          stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"}
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
];

export function TabBar() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth
        .getUser()
        .then(({ data }) => {
          setUser(data.user ? { email: data.user.email || undefined } : null);
        })
        .catch(() => {});
    } catch {}
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-tab-bar-border bg-tab-bar-bg backdrop-blur-xl safe-bottom">
      <div className="flex items-center justify-around h-[52px] max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = tab.match(pathname);
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1",
                isActive ? "text-accent-brand" : "text-tab-inactive"
              )}
            >
              {tab.icon(isActive)}
              <span className="text-[9px] font-medium">{tab.name}</span>
            </Link>
          );
        })}

        <Link
          href={user ? "/account" : "/auth/login"}
          className="flex flex-col items-center gap-0.5 px-3 py-1 text-tab-inactive"
        >
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
            <circle
              cx="11"
              cy="8"
              r="3.5"
              stroke={
                pathname.startsWith("/account") || pathname.startsWith("/auth")
                  ? "var(--accent-brand)"
                  : "var(--tab-inactive)"
              }
              strokeWidth="1.5"
            />
            <path
              d="M4 18.5C4 15.46 6.46 13 9.5 13h3c3.04 0 5.5 2.46 5.5 5.5"
              stroke={
                pathname.startsWith("/account") || pathname.startsWith("/auth")
                  ? "var(--accent-brand)"
                  : "var(--tab-inactive)"
              }
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[9px] font-medium">
            {user ? "Account" : "Sign in"}
          </span>
        </Link>
      </div>
    </nav>
  );
}
