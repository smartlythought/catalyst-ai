"use client";

import type { Signal } from "@/lib/types";
import { SignalCard } from "./signal-card";

interface SignalsFeedProps {
  signals: Signal[];
}

export function SignalsFeed({ signals }: SignalsFeedProps) {
  return (
    <div className="px-5 flex flex-col gap-[13px]">
      {signals.map((signal) => (
        <SignalCard key={signal.id} signal={signal} />
      ))}
    </div>
  );
}
