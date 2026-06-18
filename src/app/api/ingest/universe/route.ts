import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const FMP_KEY = process.env.FMP_API_KEY || "";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!FMP_KEY) {
    return NextResponse.json({ error: "FMP_API_KEY not configured" }, { status: 500 });
  }

  const supabase = createServiceClient();
  let inserted = 0;
  let updated = 0;

  // Fetch S&P 500 constituents
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/sp500_constituent?apikey=${FMP_KEY}`
    );
    if (res.ok) {
      const constituents = await res.json();
      for (const c of constituents || []) {
        const { data: existing } = await supabase
          .from("tickers")
          .select("id")
          .eq("symbol", c.symbol)
          .single();

        if (existing) {
          await supabase
            .from("tickers")
            .update({
              company_name: c.name || c.symbol,
              sector: c.sector || null,
              industry: c.subSector || null,
            })
            .eq("id", existing.id);
          updated++;
        } else {
          await supabase.from("tickers").insert({
            symbol: c.symbol,
            company_name: c.name || c.symbol,
            exchange: c.exchange || "NYSE",
            sector: c.sector || null,
            industry: c.subSector || null,
          });
          inserted++;
        }
      }
    }
  } catch {}

  // Also fetch NASDAQ 100 for broader tech coverage
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/nasdaq_constituent?apikey=${FMP_KEY}`
    );
    if (res.ok) {
      const constituents = await res.json();
      for (const c of constituents || []) {
        const { data: existing } = await supabase
          .from("tickers")
          .select("id")
          .eq("symbol", c.symbol)
          .single();

        if (!existing) {
          await supabase.from("tickers").insert({
            symbol: c.symbol,
            company_name: c.name || c.symbol,
            exchange: "NASDAQ",
            sector: c.sector || null,
            industry: c.subSector || null,
          });
          inserted++;
        }
      }
    }
  } catch {}

  // Backfill CIK numbers for tickers that don't have them
  try {
    const { data: noCik } = await supabase
      .from("tickers")
      .select("id, symbol")
      .is("cik", null)
      .limit(50);

    if (noCik?.length) {
      const cikRes = await fetch(
        "https://www.sec.gov/files/company_tickers.json",
        { headers: { "User-Agent": process.env.SEC_EDGAR_USER_AGENT || "Catalyst research@catalyst.claudeo.ai" } }
      );
      if (cikRes.ok) {
        const cikData = await cikRes.json();
        const cikMap = new Map<string, string>();
        for (const entry of Object.values(cikData) as any[]) {
          cikMap.set(entry.ticker, String(entry.cik_str));
        }
        for (const t of noCik) {
          const cik = cikMap.get(t.symbol);
          if (cik) {
            await supabase
              .from("tickers")
              .update({ cik })
              .eq("id", t.id);
          }
        }
      }
    }
  } catch {}

  return NextResponse.json({
    inserted,
    updated,
    message: `Universe refreshed: ${inserted} new tickers, ${updated} updated`,
  });
}
