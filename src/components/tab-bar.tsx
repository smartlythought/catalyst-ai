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
    name: "Discover",
    href: "/discover",
    match: (p: string) => p.startsWith("/discover") || p.startsWith("/picks") || p.startsWith("/ipo") || p.startsWith("/penny") || p.startsWith("/events"),
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="8" stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"} strokeWidth="1.5"/>
        <path d="M14.5 7.5L12.2 12.2L7.5 14.5L9.8 9.8L14.5 7.5Z" stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"} strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    name: "Portfolio",
    href: "/portfolio",
    match: (p: string) => p.startsWith("/portfolio"),
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <rect
          x="3"
          y="5"
          width="16"
          height="12"
          rx="2"
          stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"}
          strokeWidth="1.5"
        />
        <path
          d="M3 9H19"
          stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"}
          strokeWidth="1.5"
        />
        <path
          d="M7 13H10"
          stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    name: "AI Chat",
    href: "/chat",
    match: (p: string) => p.startsWith("/chat"),
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <path
          d="M4 4H18V15H8L4 18V4Z"
          stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="10" r="1" fill={active ? "var(--accent-brand)" : "var(--tab-inactive)"} />
        <circle cx="11" cy="10" r="1" fill={active ? "var(--accent-brand)" : "var(--tab-inactive)"} />
        <circle cx="14" cy="10" r="1" fill={active ? "var(--accent-brand)" : "var(--tab-inactive)"} />
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
