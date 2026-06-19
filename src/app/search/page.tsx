"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { TabBar } from "@/components/tab-bar";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  sector: string | null;
  inDb: boolean;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    inputRef.current?.focus();
    try {
      const stored = JSON.parse(localStorage.getItem("catalyst_recent_searches") || "[]");
      setRecentSearches(stored);
    } catch {}
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 150);
  }, [query]);

  function saveRecent(symbol: string) {
    const updated = [symbol, ...recentSearches.filter((s) => s !== symbol)].slice(0, 10);
    setRecentSearches(updated);
    localStorage.setItem("catalyst_recent_searches", JSON.stringify(updated));
  }

  const trendingTickers = ["NVDA", "AAPL", "TSLA", "MSFT", "AMD", "META", "AMZN", "GOOGL"];

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <div className="px-5 pt-4 pb-3">
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2"
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
          >
            <circle
              cx="8"
              cy="8"
              r="5.5"
              stroke="var(--text-faint)"
              strokeWidth="1.5"
            />
            <path
              d="M12 12L16 16"
              stroke="var(--text-faint)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search stocks, companies..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-[48px] rounded-[14px] border border-border-1 bg-surface-1 pl-11 pr-4 text-[15px] text-text-primary placeholder:text-text-faint outline-none focus:border-accent-brand transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-faint text-[18px]"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="px-5">
          {results.map((r) => (
            <Link
              key={r.symbol}
              href={`/stock/${r.symbol}`}
              onClick={() => saveRecent(r.symbol)}
              className="flex items-center gap-3 py-3.5 border-b border-border-hairline"
            >
              <div className="w-[42px] h-[42px] rounded-full bg-surface-2 border border-border-1 flex items-center justify-center font-mono text-[13px] font-bold text-text-muted">
                {r.symbol.slice(0, 3)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[15px] font-bold">
                    {r.symbol}
                  </span>
                  <span className="text-[10px] font-mono text-text-faint uppercase tracking-[0.5px]">
                    {r.exchange}
                  </span>
                </div>
                <div className="text-[13px] text-text-muted truncate">
                  {r.name}
                </div>
              </div>
              {r.sector && (
                <span className="text-[10px] font-mono text-text-faint px-2 py-0.5 rounded bg-chip-bg border border-chip-border">
                  {r.sector}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {!loading && !query && (
        <div className="px-5">
          {recentSearches.length > 0 && (
            <div className="mb-6">
              <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
                Recent
              </h2>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((s) => (
                  <Link
                    key={s}
                    href={`/stock/${s}`}
                    className="font-mono text-[13px] font-medium text-text-secondary px-3 py-1.5 rounded-[10px] bg-surface-1 border border-border-1"
                  >
                    {s}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            Trending
          </h2>
          <div className="flex flex-wrap gap-2">
            {trendingTickers.map((t) => (
              <Link
                key={t}
                href={`/stock/${t}`}
                onClick={() => saveRecent(t)}
                className="font-mono text-[13px] font-medium text-accent-brand px-3 py-1.5 rounded-[10px] bg-accent-brand/10 border border-accent-brand/20"
              >
                {t}
              </Link>
            ))}
          </div>
        </div>
      )}

      {!loading && query && results.length === 0 && (
        <div className="px-5 py-12 text-center">
          <p className="text-text-muted text-[14px]">
            No results for &ldquo;{query}&rdquo;
          </p>
          <p className="text-text-faint text-[12px] mt-1">
            Try a ticker symbol (AAPL) or company name
          </p>
        </div>
      )}

      <TabBar />
    </div>
  );
}
