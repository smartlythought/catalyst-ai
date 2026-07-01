import { NextResponse } from "next/server";
import { scanRadar } from "@/lib/ingestion/radar";
import { sendRadarDigest } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Intraday Momentum Radar. No AI — pure Yahoo signal math, so it's free to run
// as often as needed (on-demand from Admin, or the midday cron).
//   ?refresh=1  bypass the 5-min cache
//   ?notify=1   (cron) email a digest of what's in play
export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";
  const notify = url.searchParams.get("notify") === "1";

  try {
    const result = await scanRadar(force);

    if (notify && result.hits.length > 0) {
      // Only alert on genuinely strong movers to avoid noise.
      const strong = result.hits.filter((h) => h.heat >= 45);
      if (strong.length > 0) {
        await sendRadarDigest(strong).catch(() => {});
      }
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: String(e).slice(0, 200), hits: [], scanned: 0, at: new Date().toISOString() },
      { status: 502 }
    );
  }
}
