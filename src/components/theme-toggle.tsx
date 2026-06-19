"use client";

import { useState, useEffect } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("catalyst_theme") as
      | "dark"
      | "light"
      | null;
    const initial = stored || "dark";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("catalyst_theme", next);
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-between w-full px-4 py-3.5"
    >
      <span className="text-[15px] font-medium">
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </span>
      <div
        className="relative w-[44px] h-[24px] rounded-full transition-colors"
        style={{
          backgroundColor:
            theme === "light" ? "var(--toggle-on)" : "var(--toggle-off)",
        }}
      >
        <div
          className="absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white shadow-sm transition-transform"
          style={{
            left: theme === "light" ? "22px" : "2px",
          }}
        />
      </div>
    </button>
  );
}
