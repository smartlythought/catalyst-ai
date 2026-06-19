"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TabBar } from "@/components/tab-bar";
import { StockSearchInput } from "@/components/stock-search-input";
import type { AlertSettings } from "@/lib/types";

interface PriceAlert {
  id: number;
  ticker: string;
  company: string;
  condition: "above" | "below";
  targetPrice: number;
  isActive: boolean;
  triggered: boolean;
  triggeredAt: string | null;
}

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

const DEFAULT_SETTINGS: AlertSettings = {
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
};

export default function AlertsPage() {
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [alertSymbol, setAlertSymbol] = useState("");
  const [alertCondition, setAlertCondition] = useState<"above" | "below">("above");
  const [alertPrice, setAlertPrice] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_alerts")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setSettings({
          channels: {
            push: data.push_enabled,
            whatsapp: data.whatsapp_enabled,
            email: data.email_enabled,
          },
          minConviction: data.min_conviction,
          signals: {
            insiderTrades: data.track_insider_trades,
            secFilings: data.track_sec_filings,
            analystChanges: data.track_analyst_changes,
            earningsGuidance: data.track_earnings,
            optionsFlow: data.track_options_flow,
            newsSentiment: data.track_news_sentiment,
            technicalSignals: data.track_technical,
          },
        });
      }

      try {
        const res = await fetch("/api/alerts/price");
        const alertData = await res.json();
        setPriceAlerts(alertData.alerts || []);
      } catch {}
    }
    load();
  }, []);

  async function addPriceAlert() {
    if (!alertSymbol || !alertPrice) return;
    setSaving(true);
    try {
      await fetch("/api/alerts/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: alertSymbol.toUpperCase(),
          condition: alertCondition,
          targetPrice: parseFloat(alertPrice),
        }),
      });
      setShowAddAlert(false);
      setAlertSymbol("");
      setAlertPrice("");
      const res = await fetch("/api/alerts/price");
      const data = await res.json();
      setPriceAlerts(data.alerts || []);
    } catch {}
    setSaving(false);
  }

  async function deletePriceAlert(id: number) {
    await fetch(`/api/alerts/price?id=${id}`, { method: "DELETE" });
    setPriceAlerts(priceAlerts.filter((a) => a.id !== id));
  }

  const persist = useCallback(
    async (updated: AlertSettings) => {
      setSaving(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSaving(false);
        return;
      }

      await supabase.from("user_alerts").upsert({
        user_id: user.id,
        push_enabled: updated.channels.push,
        whatsapp_enabled: updated.channels.whatsapp,
        email_enabled: updated.channels.email,
        min_conviction: updated.minConviction,
        track_insider_trades: updated.signals.insiderTrades,
        track_sec_filings: updated.signals.secFilings,
        track_analyst_changes: updated.signals.analystChanges,
        track_earnings: updated.signals.earningsGuidance,
        track_options_flow: updated.signals.optionsFlow,
        track_news_sentiment: updated.signals.newsSentiment,
        track_technical: updated.signals.technicalSignals,
      });
      setSaving(false);
    },
    []
  );

  const toggleChannel = (ch: keyof AlertSettings["channels"]) => {
    const updated = {
      ...settings,
      channels: { ...settings.channels, [ch]: !settings.channels[ch] },
    };
    setSettings(updated);
    persist(updated);
  };

  const toggleSignal = (sig: keyof AlertSettings["signals"]) => {
    const updated = {
      ...settings,
      signals: { ...settings.signals, [sig]: !settings.signals[sig] },
    };
    setSettings(updated);
    persist(updated);
  };

  return (
    <div className="min-h-dvh pb-24">
      <header className="safe-top px-5 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-extrabold tracking-[-0.6px]">
            Alerts
          </h1>
          {saving && (
            <span className="text-[11px] text-text-faint font-mono">
              Saving...
            </span>
          )}
        </div>
      </header>

      {/* Price Alerts */}
      <div className="px-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-[10px] text-text-faint uppercase tracking-[1px]">
            Price Alerts ({priceAlerts.length})
          </h2>
          <button
            onClick={() => setShowAddAlert(!showAddAlert)}
            className="text-[13px] font-medium text-accent-brand"
          >
            {showAddAlert ? "Cancel" : "+ Add"}
          </button>
        </div>

        {showAddAlert && (
          <div className="bg-surface-1 border border-border-1 rounded-[14px] p-4 mb-3">
            <div className="flex gap-2 mb-3">
              <StockSearchInput
                value={alertSymbol}
                onChange={setAlertSymbol}
                onSelect={(symbol) => setAlertSymbol(symbol)}
                placeholder="Symbol"
              />
              <select
                value={alertCondition}
                onChange={(e) =>
                  setAlertCondition(e.target.value as "above" | "below")
                }
                className="h-[40px] rounded-[10px] border border-border-1 bg-surface-2 px-3 text-[14px] text-text-primary outline-none"
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
              <input
                type="number"
                placeholder="Price"
                value={alertPrice}
                onChange={(e) => setAlertPrice(e.target.value)}
                className="w-[90px] h-[40px] rounded-[10px] border border-border-1 bg-surface-2 px-3 text-[14px] text-text-primary placeholder:text-text-faint outline-none font-mono"
              />
            </div>
            <button
              onClick={addPriceAlert}
              disabled={saving}
              className="w-full h-[40px] rounded-[10px] bg-accent-brand text-white font-bold text-[14px]"
            >
              {saving ? "Adding..." : "Create alert"}
            </button>
          </div>
        )}

        {priceAlerts.length > 0 ? (
          <div className="bg-surface-1 border border-border-1 rounded-[18px] overflow-hidden">
            {priceAlerts.map((alert, i) => (
              <div
                key={alert.id}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  i < priceAlerts.length - 1
                    ? "border-b border-border-hairline"
                    : ""
                }`}
              >
                <Link
                  href={`/stock/${alert.ticker}`}
                  className="flex-1 flex items-center gap-3"
                >
                  <div className="w-[36px] h-[36px] rounded-full bg-surface-2 border border-border-1 flex items-center justify-center font-mono text-[11px] font-bold text-text-muted">
                    {alert.ticker.slice(0, 4)}
                  </div>
                  <div>
                    <div className="font-mono text-[14px] font-bold">
                      {alert.ticker}
                    </div>
                    <div className="text-[12px] text-text-muted">
                      {alert.condition === "above" ? "Above" : "Below"} $
                      {alert.targetPrice.toFixed(2)}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  {alert.triggered ? (
                    <span className="text-[10px] font-mono font-medium text-pos-green px-2 py-0.5 rounded bg-pos-green/10">
                      Triggered
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-medium text-text-faint px-2 py-0.5 rounded bg-surface-2">
                      Active
                    </span>
                  )}
                  <button
                    onClick={() => deletePriceAlert(alert.id)}
                    className="text-text-faint text-[14px]"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !showAddAlert && (
            <div className="py-6 text-center">
              <p className="text-text-muted text-[13px]">
                No price alerts. Tap + Add to get notified when a stock hits
                your target.
              </p>
            </div>
          )
        )}
      </div>

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
          <div className="px-4 py-3.5 border-b border-border-hairline">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[15px] font-medium">WhatsApp</div>
              </div>
              <Toggle
                enabled={settings.channels.whatsapp}
                onToggle={() => toggleChannel("whatsapp")}
              />
            </div>
            {settings.channels.whatsapp && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-text-faint">
                  Set your number in
                </span>
                <Link
                  href="/account"
                  className="text-[11px] text-accent-brand font-medium"
                >
                  Account &rsaquo;
                </Link>
              </div>
            )}
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
            onChange={(e) => {
              const updated = {
                ...settings,
                minConviction: Number(e.target.value),
              };
              setSettings(updated);
            }}
            onMouseUp={() => persist(settings)}
            onTouchEnd={() => persist(settings)}
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
