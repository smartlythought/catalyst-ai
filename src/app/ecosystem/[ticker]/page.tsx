"use client";

import { use } from "react";
import Link from "next/link";
import { MOCK_SIGNALS } from "@/lib/mock-data";
import { cn, formatPercent } from "@/lib/utils";
import { TabBar } from "@/components/tab-bar";

const KNOWN_ECOSYSTEMS: Record<
  string,
  { ticker: string; rel: string; desc: string; price: number; change: number }[]
> = {
  NVDA: [
    { ticker: "TSM", rel: "supplier", desc: "Primary chip fabrication (TSMC)", price: 178.5, change: 1.2 },
    { ticker: "AVGO", rel: "partner", desc: "Networking chips for AI data centers", price: 168.3, change: 0.8 },
    { ticker: "SMCI", rel: "customer", desc: "Largest GPU server manufacturer", price: 42.1, change: -2.1 },
    { ticker: "DELL", rel: "customer", desc: "Enterprise AI server distribution", price: 132.5, change: 0.5 },
    { ticker: "MSFT", rel: "customer", desc: "Azure cloud GPU fleet buyer", price: 442.6, change: 0.5 },
    { ticker: "META", rel: "customer", desc: "AI research GPU procurement", price: 505.2, change: 0.7 },
    { ticker: "GOOGL", rel: "customer", desc: "GCP GPU fleet + TPU competitor", price: 178.3, change: -0.5 },
    { ticker: "AMD", rel: "competitor", desc: "MI300X AI GPU direct rival", price: 164.9, change: 0.3 },
    { ticker: "ARM", rel: "partner", desc: "Grace CPU architecture license", price: 152.8, change: 1.8 },
    { ticker: "PLTR", rel: "partner", desc: "AI platform integration", price: 24.5, change: 3.2 },
    { ticker: "MRVL", rel: "partner", desc: "Custom networking silicon for DGX", price: 72.3, change: 1.1 },
    { ticker: "INTC", rel: "competitor", desc: "Gaudi AI accelerator rival", price: 31.2, change: -1.4 },
  ],
  TSLA: [
    { ticker: "ALB", rel: "supplier", desc: "Lithium supplier for batteries", price: 78.3, change: -0.8 },
    { ticker: "RIVN", rel: "competitor", desc: "EV truck/SUV competitor", price: 14.2, change: 2.1 },
    { ticker: "LCID", rel: "competitor", desc: "Luxury EV sedan competitor", price: 3.1, change: -1.5 },
    { ticker: "GM", rel: "competitor", desc: "Legacy auto + EV expansion", price: 48.2, change: 0.3 },
    { ticker: "F", rel: "competitor", desc: "F-150 Lightning competitor", price: 12.1, change: -0.4 },
    { ticker: "NVDA", rel: "supplier", desc: "AI training chips for FSD", price: 172.4, change: 2.9 },
  ],
};

const relColors: Record<string, string> = {
  supplier: "#53BDEB",
  customer: "var(--pos-green)",
  partner: "var(--accent-brand)",
  competitor: "var(--neg-red)",
  subsidiary: "#9AA1AD",
  investor: "#E8A838",
};

const relLabels: Record<string, string> = {
  supplier: "SUPPLIER",
  customer: "CUSTOMER",
  partner: "PARTNER",
  competitor: "COMPETITOR",
  subsidiary: "SUBSIDIARY",
  investor: "INVESTOR",
};

export default function EcosystemPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = use(params);
  const symbol = ticker.toUpperCase();
  const signal = MOCK_SIGNALS.find((s) => s.ticker === symbol);
  const edges = KNOWN_ECOSYSTEMS[symbol] || [];

  const suppliers = edges.filter((e) => e.rel === "supplier");
  const customers = edges.filter((e) => e.rel === "customer");
  const partners = edges.filter((e) => e.rel === "partner");
  const competitors = edges.filter((e) => e.rel === "competitor");

  const topPerformers = [...edges]
    .filter((e) => e.rel !== "competitor")
    .sort((a, b) => b.change - a.change)
    .slice(0, 3);

  return (
    <div className="min-h-dvh pb-24">
      <header className="safe-top px-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <Link
            href={signal ? `/stock/${symbol}` : "/"}
            className="text-[14px] text-accent-brand font-medium flex items-center gap-1"
          >
            <span className="text-[18px]">&lsaquo;</span> Back
          </Link>
        </div>
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
          {symbol} Ecosystem
        </h1>
        <p className="text-[14px] text-text-muted mt-1">
          {edges.length} companies in the {signal?.company || symbol} network
        </p>
      </header>

      {/* Top performers */}
      {topPerformers.length > 0 && (
        <div className="px-5 mb-5">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
            Top performing partners
          </h2>
          <div className="flex gap-2">
            {topPerformers.map((p, i) => (
              <div
                key={p.ticker}
                className="flex-1 bg-surface-1 border border-border-1 rounded-[14px] p-3"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {i === 0 && (
                    <span className="text-[10px] font-mono font-bold text-accent-brand">
                      #1
                    </span>
                  )}
                  <span className="text-[15px] font-bold">{p.ticker}</span>
                </div>
                <div className="font-mono text-[12px] text-text-secondary">
                  ${p.price.toFixed(2)}
                </div>
                <div
                  className="font-mono text-[12px] font-semibold"
                  style={{
                    color:
                      p.change >= 0
                        ? "var(--pos-green-bright)"
                        : "var(--neg-red-bright)",
                  }}
                >
                  {formatPercent(p.change)}
                </div>
                <div
                  className="font-mono text-[8px] font-medium tracking-[0.5px] uppercase mt-1"
                  style={{ color: relColors[p.rel] }}
                >
                  {relLabels[p.rel]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Relationship groups */}
      {[
        { label: "Suppliers", items: suppliers, icon: "↑" },
        { label: "Customers", items: customers, icon: "↓" },
        { label: "Partners", items: partners, icon: "⇄" },
        { label: "Competitors", items: competitors, icon: "⚡" },
      ]
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <div key={group.label} className="px-5 mb-5">
            <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
              {group.icon} {group.label}
            </h2>
            <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
              {group.items.map((edge, i) => (
                <div
                  key={edge.ticker}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5",
                    i < group.items.length - 1
                      ? "border-b border-border-hairline"
                      : ""
                  )}
                >
                  <div
                    className="w-[6px] h-[6px] rounded-full shrink-0"
                    style={{
                      backgroundColor: relColors[edge.rel] || "var(--neutral-watch)",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold">
                        {edge.ticker}
                      </span>
                      <span
                        className="font-mono text-[9px] font-medium tracking-[0.5px] uppercase px-1.5 py-0.5 rounded"
                        style={{
                          color: relColors[edge.rel],
                          backgroundColor: `color-mix(in srgb, ${relColors[edge.rel] || "#9AA1AD"} 12%, transparent)`,
                        }}
                      >
                        {relLabels[edge.rel]}
                      </span>
                    </div>
                    <div className="text-[12px] text-text-muted truncate">
                      {edge.desc}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[13px] font-medium">
                      ${edge.price.toFixed(2)}
                    </div>
                    <div
                      className="font-mono text-[11px] font-medium"
                      style={{
                        color:
                          edge.change >= 0
                            ? "var(--pos-green-bright)"
                            : "var(--neg-red-bright)",
                      }}
                    >
                      {formatPercent(edge.change)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

      <TabBar />
    </div>
  );
}
