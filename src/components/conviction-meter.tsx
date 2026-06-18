"use client";

import { cn } from "@/lib/utils";

interface ConvictionMeterProps {
  value: number;
  color: string;
  label?: string;
}

export function ConvictionMeter({ value, color, label }: ConvictionMeterProps) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-[12px] text-text-muted font-medium">{label}</span>
      )}
      <div className="meter-track flex-1 min-w-[60px]">
        <div
          className="meter-fill"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span
        className={cn("font-mono text-[12px] font-medium")}
        style={{ color }}
      >
        {value}%
      </span>
    </div>
  );
}
