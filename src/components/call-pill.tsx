import type { CallType } from "@/lib/types";
import { cn } from "@/lib/utils";

const callStyles: Record<CallType, { text: string; bg: string }> = {
  BUY: { text: "text-pos-green", bg: "bg-pos-green/12" },
  REDUCE: { text: "text-neg-red", bg: "bg-neg-red/12" },
  WATCH: { text: "text-neutral-watch", bg: "bg-neutral-watch/12" },
};

interface CallPillProps {
  call: CallType;
  className?: string;
}

export function CallPill({ call, className }: CallPillProps) {
  const style = callStyles[call];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-md font-mono text-[11px] font-semibold tracking-wider uppercase",
        style.text,
        style.bg,
        className
      )}
    >
      {call}
    </span>
  );
}
