import { createServiceClient } from "@/lib/supabase/server";

function todayET(): string {
  const now = new Date();
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  return et.toISOString().split("T")[0];
}

/**
 * Persist a day's AI output for history/back-testing. Upserts one row per
 * (kind, day). Fail-soft — never breaks the calling route.
 */
export async function saveAISnapshot(
  kind: "picks" | "penny" | "ipo",
  payload: unknown
): Promise<void> {
  try {
    const sb = createServiceClient();
    await sb.from("daily_ai_history").upsert(
      {
        kind,
        snapshot_date: todayET(),
        payload,
        created_at: new Date().toISOString(),
      },
      { onConflict: "kind,snapshot_date" }
    );
  } catch {
    // history is best-effort
  }
}

export interface AISnapshotRow {
  kind: string;
  snapshot_date: string;
  payload: any;
  created_at: string;
}

export async function getAISnapshots(days = 45): Promise<AISnapshotRow[]> {
  try {
    const sb = createServiceClient();
    const { data } = await sb
      .from("daily_ai_history")
      .select("kind, snapshot_date, payload, created_at")
      .order("snapshot_date", { ascending: false })
      .limit(days * 3);
    return (data as AISnapshotRow[]) || [];
  } catch {
    return [];
  }
}
