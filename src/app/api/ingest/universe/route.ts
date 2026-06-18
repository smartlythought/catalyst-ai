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
    return NextResponse.json(
      { error: "FMP_API_KEY not configured" },
      { status: 500 }
    );
  }

  const startTime = Date.now();
  const supabase = createServiceClient();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // 1. Fetch ALL US-traded stocks from FMP
  let allStocks: any[] = [];
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/stock/list?apikey=${FMP_KEY}`
    );
    if (res.ok) {
      const raw = await res.json();
      allStocks = (raw || []).filter(
        (s: any) =>
          s.symbol &&
          s.name &&
          s.exchangeShortName &&
          ["NASDAQ", "NYSE", "AMEX"].includes(s.exchangeShortName) &&
          s.type === "stock" &&
          (s.price === undefined || s.price >= 1)
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: `FMP stock/list failed: ${e}` },
      { status: 502 }
    );
  }

  if (allStocks.length === 0) {
    return NextResponse.json(
      { error: "FMP returned 0 US stocks" },
      { status: 502 }
    );
  }

  // 2. Batch upsert into Supabase (chunks of 100 for upsert)
  const chunks = chunkArray(allStocks, 100);

  for (const chunk of chunks) {
    if (Date.now() - startTime > 50000) break; // safety for 60s timeout

    const rows = chunk.map((s: any) => ({
      symbol: s.symbol,
      company_name: s.name.slice(0, 200),
      exchange: s.exchangeShortName,
    }));

    const { data: existingRows } = await supabase
      .from("tickers")
      .select("symbol")
      .in(
        "symbol",
        rows.map((r: any) => r.symbol)
      );

    const existingSet = new Set(
      (existingRows || []).map((r: any) => r.symbol)
    );

    const toInsert = rows.filter((r: any) => !existingSet.has(r.symbol));
    const toUpdate = rows.filter((r: any) => existingSet.has(r.symbol));

    if (toInsert.length > 0) {
      const { error } = await supabase.from("tickers").insert(toInsert);
      if (!error) {
        inserted += toInsert.length;
      } else {
        // Fallback: insert one by one to skip duplicates
        for (const row of toInsert) {
          const { error: e2 } = await supabase.from("tickers").insert(row);
          if (!e2) inserted++;
          else skipped++;
        }
      }
    }

    for (const row of toUpdate) {
      await supabase
        .from("tickers")
        .update({ company_name: row.company_name, exchange: row.exchange })
        .eq("symbol", row.symbol);
      updated++;
    }
  }

  // 3. Enrich with sector/industry data from FMP profiles (top 500 by market cap)
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=2000000000&exchange=NYSE,NASDAQ&limit=500&apikey=${FMP_KEY}`
    );
    if (res.ok) {
      const screened = await res.json();
      for (const s of screened || []) {
        if (s.symbol && (s.sector || s.industry)) {
          await supabase
            .from("tickers")
            .update({
              sector: s.sector || null,
              industry: s.industry || null,
              market_cap: s.marketCap || null,
            })
            .eq("symbol", s.symbol);
        }
      }
    }
  } catch {}

  // 4. Backfill CIK numbers from SEC EDGAR
  let cikBackfilled = 0;
  try {
    const { data: noCik } = await supabase
      .from("tickers")
      .select("id, symbol")
      .is("cik", null)
      .limit(500);

    if (noCik?.length) {
      const cikRes = await fetch(
        "https://www.sec.gov/files/company_tickers.json",
        {
          headers: {
            "User-Agent":
              process.env.SEC_EDGAR_USER_AGENT ||
              "Catalyst research@catalyst.claudeo.ai",
          },
        }
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
            await supabase.from("tickers").update({ cik }).eq("id", t.id);
            cikBackfilled++;
          }
        }
      }
    }
  } catch {}

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  return NextResponse.json({
    inserted,
    updated,
    skipped,
    cikBackfilled,
    totalFromFMP: allStocks.length,
    elapsedSeconds: elapsed,
    message: `Universe refreshed: ${inserted} new, ${updated} updated, ${allStocks.length} total US stocks from FMP`,
  });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
