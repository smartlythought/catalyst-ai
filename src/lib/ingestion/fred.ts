// FRED (Federal Reserve Economic Data) — free macro series. Optional: only
// active when FRED_API_KEY is set; otherwise every function no-ops so nothing
// breaks. Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html
const FRED_KEY = process.env.FRED_API_KEY || "";

async function latest(
  seriesId: string,
  limit = 14
): Promise<{ date: string; value: number }[]> {
  if (!FRED_KEY) return [];
  try {
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=${limit}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const d = await res.json();
    return (d.observations || [])
      .map((o: any) => ({ date: o.date, value: parseFloat(o.value) }))
      .filter((o: any) => !isNaN(o.value));
  } catch {
    return [];
  }
}

export interface FredMacro {
  cpiYoY: number | null; // inflation, % year-over-year
  unemployment: number | null; // %
  fedFunds: number | null; // %
}

/** Latest CPI YoY, unemployment, and fed funds rate. null if no key/unavailable. */
export async function getFredMacro(): Promise<FredMacro | null> {
  if (!FRED_KEY) return null;
  try {
    const [cpi, unrate, ff] = await Promise.all([
      latest("CPIAUCSL", 14), // CPI index (monthly) → derive YoY
      latest("UNRATE", 2),
      latest("FEDFUNDS", 2),
    ]);
    let cpiYoY: number | null = null;
    if (cpi.length >= 13 && cpi[12].value > 0) {
      cpiYoY = ((cpi[0].value - cpi[12].value) / cpi[12].value) * 100;
    }
    return {
      cpiYoY,
      unemployment: unrate[0]?.value ?? null,
      fedFunds: ff[0]?.value ?? null,
    };
  } catch {
    return null;
  }
}
