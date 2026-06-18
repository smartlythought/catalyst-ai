"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TabBar } from "@/components/tab-bar";
import { Disclaimer } from "@/components/disclaimer";

interface Holding {
  ticker: string;
  company: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  change: number;
  changePercent: number;
  totalValue: number;
  pnl: number;
  pnlPercent: number;
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [totalPnl, setTotalPnl] = useState(0);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addSymbol, setAddSymbol] = useState("");
  const [addShares, setAddShares] = useState("");
  const [addCost, setAddCost] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      setUser(u);

      if (u) {
        try {
          const res = await fetch("/api/portfolio");
          const data = await res.json();
          setHoldings(data.holdings || []);
          setTotalValue(data.totalValue || 0);
          setTotalPnl(data.totalPnl || 0);
        } catch {}
      }
      setLoading(false);
    }
    load();
  }, []);

  async function addHolding() {
    if (!addSymbol || !addShares || !addCost) return;
    setSaving(true);
    try {
      await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: addSymbol.toUpperCase(),
          shares: parseFloat(addShares),
          avgCost: parseFloat(addCost),
        }),
      });
      setShowAdd(false);
      setAddSymbol("");
      setAddShares("");
      setAddCost("");
      const res = await fetch("/api/portfolio");
      const data = await res.json();
      setHoldings(data.holdings || []);
      setTotalValue(data.totalValue || 0);
      setTotalPnl(data.totalPnl || 0);
    } catch {}
    setSaving(false);
  }

  async function removeHolding(symbol: string) {
    await fetch(`/api/portfolio?symbol=${symbol}`, { method: "DELETE" });
    setHoldings(holdings.filter((h) => h.ticker !== symbol));
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh pb-24 safe-top">
        <header className="px-5 pt-4 pb-4">
          <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
            Portfolio
          </h1>
        </header>
        <div className="px-5 py-12 text-center">
          <p className="text-text-muted text-[15px] mb-4">
            Sign in to track your portfolio
          </p>
          <Link
            href="/auth/login"
            className="inline-block px-6 py-3 rounded-[14px] bg-accent-brand text-white font-bold text-[15px]"
          >
            Sign in
          </Link>
        </div>
        <TabBar />
      </div>
    );
  }

  const totalPnlPercent = totalValue - totalPnl > 0 ? (totalPnl / (totalValue - totalPnl)) * 100 : 0;

  return (
    <div className="min-h-dvh pb-24 safe-top">
      <header className="px-5 pt-4 pb-4">
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
          Portfolio
        </h1>
      </header>

      {/* Summary card */}
      <div className="px-5 mb-4">
        <div className="bg-surface-1 border border-border-1 rounded-[18px] p-5">
          <div className="text-[12px] text-text-faint font-mono uppercase tracking-[1px] mb-1">
            Total Value
          </div>
          <div className="font-mono text-[32px] font-bold leading-none">
            ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div
            className="font-mono text-[15px] font-medium mt-1"
            style={{
              color: totalPnl >= 0 ? "var(--pos-green-bright)" : "var(--neg-red-bright)",
            }}
          >
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} ({totalPnlPercent >= 0 ? "+" : ""}{totalPnlPercent.toFixed(2)}%)
          </div>
        </div>
      </div>

      {/* Holdings */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px]">
            Holdings ({holdings.length})
          </h2>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-[13px] font-medium text-accent-brand"
          >
            {showAdd ? "Cancel" : "+ Add"}
          </button>
        </div>

        {showAdd && (
          <div className="bg-surface-1 border border-border-1 rounded-[14px] p-4 mb-4">
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Symbol"
                value={addSymbol}
                onChange={(e) => setAddSymbol(e.target.value)}
                className="flex-1 h-[40px] rounded-[10px] border border-border-1 bg-surface-2 px-3 text-[14px] text-text-primary placeholder:text-text-faint outline-none"
              />
              <input
                type="number"
                placeholder="Shares"
                value={addShares}
                onChange={(e) => setAddShares(e.target.value)}
                className="w-[80px] h-[40px] rounded-[10px] border border-border-1 bg-surface-2 px-3 text-[14px] text-text-primary placeholder:text-text-faint outline-none"
              />
              <input
                type="number"
                placeholder="Avg $"
                value={addCost}
                onChange={(e) => setAddCost(e.target.value)}
                className="w-[80px] h-[40px] rounded-[10px] border border-border-1 bg-surface-2 px-3 text-[14px] text-text-primary placeholder:text-text-faint outline-none"
              />
            </div>
            <button
              onClick={addHolding}
              disabled={saving}
              className="w-full h-[40px] rounded-[10px] bg-accent-brand text-white font-bold text-[14px]"
            >
              {saving ? "Adding..." : "Add holding"}
            </button>
          </div>
        )}

        {holdings.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-text-muted text-[14px]">
              No holdings yet. Add your first stock above.
            </p>
          </div>
        ) : (
          holdings.map((h) => (
            <Link
              key={h.ticker}
              href={`/stock/${h.ticker}`}
              className="flex items-center gap-3 py-3.5 border-b border-border-hairline"
            >
              <div className="w-[42px] h-[42px] rounded-full bg-surface-2 border border-border-1 flex items-center justify-center font-mono text-[12px] font-bold text-text-muted">
                {h.ticker.slice(0, 4)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[15px] font-bold">
                    {h.ticker}
                  </span>
                  <span className="text-[11px] text-text-faint font-mono">
                    {h.shares} shares
                  </span>
                </div>
                <div className="text-[12px] text-text-muted">
                  Avg ${h.avgCost.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[14px] font-bold">
                  ${h.totalValue.toFixed(2)}
                </div>
                <div
                  className="font-mono text-[12px] font-medium"
                  style={{
                    color: h.pnl >= 0 ? "var(--pos-green-bright)" : "var(--neg-red-bright)",
                  }}
                >
                  {h.pnl >= 0 ? "+" : ""}{h.pnlPercent.toFixed(1)}%
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  removeHolding(h.ticker);
                }}
                className="text-text-faint text-[16px] ml-1"
              >
                &times;
              </button>
            </Link>
          ))
        )}
      </div>

      <Disclaimer />
      <TabBar />
    </div>
  );
}
