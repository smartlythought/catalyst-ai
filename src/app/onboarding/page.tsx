"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const goals = [
  { id: "grow_wealth", label: "Grow my wealth", desc: "Long-term compounding through quality stocks" },
  { id: "generate_income", label: "Generate income", desc: "Dividend plays and cash-flow strategies" },
  { id: "trade_actively", label: "Trade actively", desc: "Short-term momentum and catalyst plays" },
];

const risks = [
  { id: "conservative", label: "Conservative", desc: "Protect capital, steady gains", color: "#53BDEB" },
  { id: "balanced", label: "Balanced", desc: "Mix of growth and stability", color: "#16C784" },
  { id: "aggressive", label: "Aggressive", desc: "High risk, high reward", color: "#E8743B" },
];

const capitalOptions = ["$5K", "$10K", "$25K", "$50K", "$100K"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState("");
  const [risk, setRisk] = useState("");
  const [capital, setCapital] = useState("");

  const canAdvance =
    (step === 0 && goal) ||
    (step === 1 && risk) ||
    (step === 2 && capital) ||
    step === 3;

  const advance = () => {
    if (step < 3) setStep(step + 1);
    else router.push("/");
  };

  const ctaLabel =
    step < 2 ? "Continue" : step === 2 ? "Finish setup" : "Enter Catalyst";

  return (
    <div className="min-h-dvh flex flex-col safe-top px-5 pb-8">
      {/* Progress bar */}
      {step < 3 && (
        <div className="flex gap-2 mb-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex-1 h-[3px] rounded-full"
              style={{
                backgroundColor:
                  i <= step ? "var(--accent-brand)" : "var(--border-track)",
              }}
            />
          ))}
        </div>
      )}

      <div className="flex-1">
        {/* Step 0: Goal */}
        {step === 0 && (
          <>
            <h1 className="text-[28px] font-extrabold tracking-[-0.6px] mb-6">
              What are you here to do?
            </h1>
            <div className="flex flex-col gap-3">
              {goals.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGoal(g.id)}
                  className={cn(
                    "text-left p-4 rounded-[18px] border-2 transition-colors bg-surface-1",
                    goal === g.id
                      ? "border-accent-brand"
                      : "border-border-1"
                  )}
                >
                  <div className="text-[17px] font-bold">{g.label}</div>
                  <div className="text-[13px] text-text-muted mt-1">
                    {g.desc}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 1: Risk */}
        {step === 1 && (
          <>
            <h1 className="text-[28px] font-extrabold tracking-[-0.6px] mb-6">
              How do you handle risk?
            </h1>
            <div className="flex flex-col gap-3">
              {risks.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRisk(r.id)}
                  className={cn(
                    "text-left p-4 rounded-[18px] border-2 transition-colors bg-surface-1 flex items-start gap-3",
                    risk === r.id
                      ? "border-accent-brand"
                      : "border-border-1"
                  )}
                >
                  <span
                    className="w-[10px] h-[10px] rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: r.color }}
                  />
                  <div>
                    <div className="text-[17px] font-bold">{r.label}</div>
                    <div className="text-[13px] text-text-muted mt-1">
                      {r.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 2: Capital + delivery */}
        {step === 2 && (
          <>
            <h1 className="text-[28px] font-extrabold tracking-[-0.6px] mb-6">
              Starting capital
            </h1>
            <div className="flex flex-wrap gap-2 mb-8">
              {capitalOptions.map((c) => (
                <button
                  key={c}
                  onClick={() => setCapital(c)}
                  className={cn(
                    "font-mono text-[14px] font-medium px-4 py-2.5 rounded-[8px] border transition-colors",
                    capital === c
                      ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                      : "border-border-1 bg-surface-2 text-text-secondary"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            <h2 className="text-[18px] font-bold mb-3">
              Get calls on WhatsApp
            </h2>
            <div className="bg-surface-1 border border-border-1 rounded-[18px] p-4 flex items-center gap-3">
              <div className="w-[40px] h-[40px] rounded-full bg-[#25D366] flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                  <path d="M17.47 14.38c-.29-.14-1.7-.84-1.96-.93-.26-.1-.46-.15-.65.14-.19.3-.74.94-.91 1.13-.17.19-.34.22-.63.07-.29-.14-1.22-.45-2.33-1.43-.86-.76-1.44-1.71-1.61-2-.17-.29-.02-.44.13-.59.13-.13.29-.34.43-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.14-.65-1.56-.89-2.14-.23-.56-.47-.48-.65-.49-.17-.01-.36-.01-.55-.01-.19 0-.51.07-.78.36-.26.29-1.01 1-.1.01 2.43 0 2.43s1.6 3.88 1.82 4.43c.23.56.8.91 1.13.91.32 0 .93-.36 1.06-.71.13-.36.13-.65.1-.72-.05-.07-.17-.12-.36-.22z" />
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5.16-1.34A9.93 9.93 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.74 0-3.36-.54-4.7-1.47l-.34-.22-3.06.8.82-2.98-.24-.36A7.95 7.95 0 0 1 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-semibold">WhatsApp connected</div>
                <div className="text-[12px] text-text-muted font-mono">
                  +1 (415) 555-0182
                </div>
              </div>
              <span className="w-[8px] h-[8px] rounded-full bg-pos-green" />
            </div>
          </>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div className="flex flex-col items-center text-center pt-12">
            <div className="w-[72px] h-[72px] rounded-full bg-pos-green/15 flex items-center justify-center mb-6">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="var(--pos-green)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-[28px] font-extrabold mb-2">
              You&apos;re all set
            </h1>
            <p className="text-[15px] text-text-muted mb-8">
              Catalyst will scan the market and send you actionable calls.
            </p>

            <div className="w-full bg-surface-1 border border-border-1 rounded-[18px] p-4 text-left">
              {[
                { label: "Profile", value: goals.find((g) => g.id === goal)?.label || "—" },
                { label: "Risk", value: risks.find((r) => r.id === risk)?.label || "—" },
                { label: "Capital", value: capital || "—" },
                { label: "Alerts", value: "WhatsApp + Push" },
              ].map((item, i) => (
                <div
                  key={item.label}
                  className={cn(
                    "flex items-center justify-between py-2.5",
                    i < 3 ? "border-b border-border-hairline" : ""
                  )}
                >
                  <span className="text-[13px] text-text-muted">{item.label}</span>
                  <span className="text-[14px] font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-3 mt-6">
        {step > 0 && step < 3 && (
          <button
            onClick={() => setStep(step - 1)}
            className="w-[54px] h-[54px] rounded-[14px] border border-border-1 bg-surface-1 flex items-center justify-center text-text-muted text-[20px]"
          >
            &lsaquo;
          </button>
        )}
        <button
          onClick={advance}
          disabled={!canAdvance}
          className={cn(
            "flex-1 h-[54px] rounded-[14px] font-bold text-[16px] transition-all",
            canAdvance
              ? "bg-accent-brand text-white shadow-[0_8px_22px_rgba(232,116,59,0.28)]"
              : "bg-surface-2 text-text-faint cursor-not-allowed"
          )}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
