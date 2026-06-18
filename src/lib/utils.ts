import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return price.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export function formatPriceShort(price: number): string {
  return `$${price.toFixed(2)}`;
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
}

export function callColor(call: "BUY" | "REDUCE" | "WATCH"): string {
  switch (call) {
    case "BUY":
      return "var(--pos-green)";
    case "REDUCE":
      return "var(--neg-red)";
    case "WATCH":
      return "var(--neutral-watch)";
  }
}

export function callColorClass(call: "BUY" | "REDUCE" | "WATCH") {
  switch (call) {
    case "BUY":
      return "text-pos-green";
    case "REDUCE":
      return "text-neg-red";
    case "WATCH":
      return "text-neutral-watch";
  }
}
