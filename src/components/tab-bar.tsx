"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  {
    name: "Signals",
    href: "/",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
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
    name: "Portfolio",
    href: "/portfolio",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect
          x="3"
          y="3"
          width="16"
          height="16"
          rx="3"
          stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"}
          strokeWidth="1.5"
        />
        <path
          d="M3 9H19M9 9V19"
          stroke={active ? "var(--accent-brand)" : "var(--tab-inactive)"}
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    name: "Alerts",
    href: "/alerts",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
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

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-tab-bar-border bg-tab-bar-bg backdrop-blur-xl safe-bottom">
      <div className="flex items-center justify-around h-[52px] max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/" || pathname.startsWith("/signal")
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-4 py-1",
                isActive ? "text-accent-brand" : "text-tab-inactive"
              )}
            >
              {tab.icon(isActive)}
              <span className="text-[10px] font-medium">{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
