"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TabBar } from "@/components/tab-bar";

interface WatchlistItem {
  symbol: string;
  name: string;
  exchange: string;
  sector: string | null;
  price: number;
  change: number;
  changePercent: number;
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setItems(data.watchlist || []);
        }
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  async function removeFromWatchlist(symbol: string) {
    setItems((prev) => prev.filter((i) => i.symbol !== symbol));
    await fetch("/api/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error === "Unauthorized") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5 pb-24">
        <h1 className="text-[20px] font-bold mb-2">Sign in to use Watchlist</h1>
        <p className="text-[14px] text-text-muted mb-6 text-center">
          Track your favorite stocks and get notified when signals fire
        </p>
        <Link
          href="/auth/login"
          className="bg-accent-brand text-white font-bold px-6 py-3 rounded-[14px]"
        >
          Sign in
        </Link>
        <TabBar />
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-[24px] font-extrabold">Watchlist</h1>
          <Link
            href="/search"
            className="text-[13px] text-accent-brand font-medium flex items-center gap-1"
          >
            <span className="text-[16px]">+</span> Add
          </Link>
        </div>
        <p className="text-[13px] text-text-muted mt-0.5">
          {items.length} {items.length === 1 ? "stock" : "stocks"} tracked
        </p>
      </header>

      {items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-text-muted text-[14px]">
            Your watchlist is empty
          </p>
          <Link
            href="/search"
            className="inline-block mt-4 text-accent-brand font-medium text-[14px]"
          >
            Search stocks to add
          </Link>
        </div>
      ) : (
        <div className="px-5">
          {items.map((item) => (
            <div
              key={item.symbol}
              className="flex items-center gap-3 py-3.5 border-b border-border-hairline"
            >
              <Link href={`/stock/${item.symbol}`} className="flex-1 flex items-center gap-3">
                <div className="w-[42px] h-[42px] rounded-full bg-surface-2 border border-border-1 flex items-center justify-center font-mono text-[13px] font-bold text-text-muted">
                  {item.symbol.slice(0, 3)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[15px] font-bold">
                    {item.symbol}
                  </div>
                  <div className="text-[12px] text-text-muted truncate">
                    {item.name}
                  </div>
                </div>
              </Link>
              <div className="text-right mr-2">
                {item.price > 0 && (
                  <>
                    <div className="font-mono text-[14px] font-semibold">
                      ${item.price.toFixed(2)}
                    </div>
                    <div
                      className="font-mono text-[12px]"
                      style={{
                        color:
                          item.changePercent >= 0
                            ? "var(--pos-green)"
                            : "var(--neg-red)",
                      }}
                    >
                      {item.changePercent >= 0 ? "+" : ""}
                      {item.changePercent.toFixed(2)}%
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => removeFromWatchlist(item.symbol)}
                className="text-text-faint text-[18px] px-2"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <TabBar />
    </div>
  );
}
