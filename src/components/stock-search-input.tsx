"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  sector: string | null;
}

interface StockSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (symbol: string, name: string) => void;
  placeholder?: string;
}

export function StockSearchInput({
  value,
  onChange,
  onSelect,
  placeholder = "Symbol or company",
}: StockSearchInputProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResults = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const items = (data.results || []).slice(0, 8);
      setResults(items);
      setIsOpen(items.length > 0);
    } catch {
      setResults([]);
      setIsOpen(false);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchResults(value);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, fetchResults]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(result: SearchResult) {
    onSelect(result.symbol, result.name);
    setIsOpen(false);
    setResults([]);
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          className="w-full h-[40px] rounded-[10px] border border-border-1 bg-surface-2 px-3 text-[14px] text-text-primary placeholder:text-text-faint outline-none font-mono"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-text-faint border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 bg-surface-1 border border-border-1 rounded-[14px] shadow-lg overflow-hidden">
          {results.map((result, i) => (
            <button
              key={result.symbol}
              type="button"
              onClick={() => handleSelect(result)}
              className={`w-full text-left px-3 py-2.5 hover:bg-surface-2 transition-colors ${
                i < results.length - 1 ? "border-b border-border-hairline" : ""
              }`}
            >
              <span className="font-mono text-[14px] font-bold text-text-primary">
                {result.symbol}
              </span>
              <span className="text-[12px] text-text-muted ml-2">
                {result.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
