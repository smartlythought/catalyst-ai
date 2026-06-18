"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPercent } from "@/lib/utils";
import { Sparkline } from "@/components/sparkline";
import { TabBar } from "@/components/tab-bar";
import { MOCK_HOLDINGS } from "@/lib/mock-data";
import type { Holding } from "@/lib/types";

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>(MOCK_HOLDINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data } = await supabase
          .from("portfolio")
          .select(
            `
            shares,
            avg_cost,
            tickers!inner (symbol, company_name)
          `
          )
          .eq("user_id", user.id);

        if (data && data.length > 0) {
          setHoldings(
            data.map((row: any) => ({
              ticker: row.tickers.symbol,
              company: row.tickers.company_name,
              shares: row.shares,
              avgCost: row.avg_cost,
              currentPrice: row.avg_cost,
              change: 0,
              changePercent: 0,
              totalValue: row.shares * row.avg_cost,
              pnl: 0,
              pnlPercent: 0,
              hasActiveSignal: false,
              sparkline: [],
            }))
          );
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  const totalValue = holdings.reduce((sum, h) => sum + h.totalValue, 0);
  const totalPnl = holdings.reduce((sum, h) => sum + h.pnl, 0);
  const totalPnlPercent =
    totalValue - totalPnl > 0
      ? (totalPnl / (totalValue - totalPnl)) * 100
      : 0;
  const activeSignals = holdings.filter((h) => h.hasActiveSignal).length;

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-24">
      <header className="safe-top px-5 pb-4">
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
          Portfolio
        </h1>
      </header>

      {/* Summary card */}
      <div className="px-5 mb-5">
        <div
          className="rounded-[18px] p-5"
          style={{
            background: "linear-gradient(165deg, #13201A, #0F141A)",
            border: "1px solid #1C3328",
          }}
        >
          <div className="font-mono text-[33px] font-semibold tracking-tight">
            ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
          <div
            className={`font-mono text-[15px] font-medium mt-1 ${
              totalPnl >= 0 ? "text-pos-green" : "text-neg-red"
            }`}
          >
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} (
            {formatPercent(totalPnlPercent)})
          </div>
          <div className="flex items-center gap-6 mt-4 pt-3 border-t border-border-hairline">
            <div>
              <div className="font-mono text-[18px] font-bold text-text-primary">
                {holdings.length}
              </div>
              <div className="text-[11px] text-text-muted">Positions</div>
            </div>
            <div>
              <div className="font-mono text-[18px] font-bold text-accent-brand">
                {activeSignals}
              </div>
              <div className="text-[11px] text-text-muted">Active signals</div>
            </div>
            <div>
              <div className="font-mono text-[18px] font-bold text-text-primary">
                —
              </div>
              <div className="text-[11px] text-text-muted">Cash</div>
            </div>
          </div>
        </div>
      </div>

      {/* Holdings */}
      <div className="px-5">
        <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
          Holdings
        </h2>
        <div className="flex flex-col">
          {holdings.map((h, i) => {
            const changeColor =
              h.pnlPercent >= 0
                ? "var(--pos-green-bright)"
                : "var(--neg-red-bright)";
            return (
              <div
                key={h.ticker}
                className={`flex items-center gap-3 py-3.5 ${
                  i < holdings.length - 1
                    ? "border-b border-border-hairline"
                    : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[15px] font-bold">{h.ticker}</span>
                    {h.hasActiveSignal && (
                      <span className="w-[6px] h-[6px] rounded-full bg-accent-brand animate-live-pulse" />
                    )}
                  </div>
                  <span className="text-[12px] text-text-muted">
                    {h.shares} shares
                  </span>
                </div>
                {h.sparkline.length > 0 && (
                  <Sparkline
                    data={h.sparkline}
                    color={changeColor}
                    width={56}
                    height={22}
                  />
                )}
                <div className="text-right">
                  <div className="font-mono text-[14px] font-medium">
                    ${h.currentPrice.toFixed(2)}
                  </div>
                  <div
                    className="font-mono text-[12px] font-medium"
                    style={{ color: changeColor }}
                  >
                    {formatPercent(h.pnlPercent)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TabBar />
    </div>
  );
}
