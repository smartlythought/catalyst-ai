"use client";

import { useState } from "react";
import { TabBar } from "@/components/tab-bar";
import type { AlertSettings } from "@/lib/types";

function Toggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="relative w-[46px] h-[28px] rounded-full transition-colors duration-150"
      style={{
        backgroundColor: enabled ? "var(--toggle-on)" : "var(--toggle-off)",
      }}
    >
      <div
        className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white transition-[left] duration-150"
        style={{ left: enabled ? "21px" : "3px" }}
      />
    </button>
  );
}

const signalLabels: { key: keyof AlertSettings["signals"]; label: string }[] = [
  { key: "insiderTrades", label: "Insider trades" },
  { key: "secFilings", label: "SEC filings & 8-Ks" },
  { key: "analystChanges", label: "Analyst changes" },
  { key: "earningsGuidance", label: "Earnings & guidance" },
  { key: "optionsFlow", label: "Unusual options flow" },
  { key: "newsSentiment", label: "News & sentiment" },
  { key: "technicalSignals", label: "Technical signals" },
];

export default function AlertsPage() {
  const [settings, setSettings] = useState<AlertSettings>({
    channels: { push: true, whatsapp: true, email: false },
    minConviction: 70,
    signals: {
      insiderTrades: true,
      secFilings: true,
      analystChanges: true,
      earningsGuidance: true,
      optionsFlow: true,
      newsSentiment: true,
      technicalSignals: false,
    },
  });

  const toggleChannel = (ch: keyof AlertSettings["channels"]) => {
    setSettings((s) => ({
      ...s,
      channels: { ...s.channels, [ch]: !s.channels[ch] },
    }));
  };

  const toggleSignal = (sig: keyof AlertSettings["signals"]) => {
    setSettings((s) => ({
      ...s,
      signals: { ...s.signals, [sig]: !s.signals[sig] },
    }));
  };

  return (
    <div className="min-h-dvh pb-24">
      <header className="safe-top px-5 pb-4">
        <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
          Alerts
        </h1>
      </header>

      {/* Delivery */}
      <div className="px-5 mb-6">
        <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
          Delivery
        </h2>
        <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-hairline">
            <div>
              <div className="text-[15px] font-medium">Push</div>
            </div>
            <Toggle
              enabled={settings.channels.push}
              onToggle={() => toggleChannel("push")}
            />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-hairline">
            <div>
              <div className="text-[15px] font-medium">WhatsApp</div>
              <div className="text-[12px] text-text-muted">
                Connected &middot; +1 (415) 555-0182
              </div>
            </div>
            <Toggle
              enabled={settings.channels.whatsapp}
              onToggle={() => toggleChannel("whatsapp")}
            />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <div className="text-[15px] font-medium">Email digest</div>
            </div>
            <Toggle
              enabled={settings.channels.email}
              onToggle={() => toggleChannel("email")}
            />
          </div>
        </div>
      </div>

      {/* Minimum conviction */}
      <div className="px-5 mb-6">
        <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
          Minimum conviction
        </h2>
        <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[14px] text-text-muted">
              Only send calls above
            </span>
            <span className="font-mono text-[28px] font-bold text-text-primary">
              {settings.minConviction}%
            </span>
          </div>
          <input
            type="range"
            min={50}
            max={95}
            step={5}
            value={settings.minConviction}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                minConviction: Number(e.target.value),
              }))
            }
            className="w-full accent-accent-brand"
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-text-faint font-mono">50%</span>
            <span className="text-[10px] text-text-faint font-mono">95%</span>
          </div>
        </div>
      </div>

      {/* Signals to track */}
      <div className="px-5 mb-6">
        <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px] mb-3">
          Signals to track
        </h2>
        <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
          {signalLabels.map((item, i) => (
            <div
              key={item.key}
              className={`flex items-center justify-between px-4 py-3.5 ${
                i < signalLabels.length - 1
                  ? "border-b border-border-hairline"
                  : ""
              }`}
            >
              <span className="text-[15px] font-medium">{item.label}</span>
              <Toggle
                enabled={settings.signals[item.key]}
                onToggle={() => toggleSignal(item.key)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="px-5 pb-4">
        <p className="text-[10px] text-text-faint font-mono tracking-[0.5px] uppercase text-center leading-relaxed">
          Catalyst is not a broker. We do not provide personalized financial
          advice.
        </p>
      </div>

      <TabBar />
    </div>
  );
}
