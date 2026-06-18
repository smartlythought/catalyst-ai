import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const supabase = createServiceClient();
  let inserted = 0;
  let skipped = 0;

  // 1. Fetch ALL US symbols from Finnhub (30K+)
  let finnhubSymbols: any[] = [];
  if (FINNHUB_KEY) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${FINNHUB_KEY}`
      );
      if (res.ok) {
        finnhubSymbols = await res.json();
      }
    } catch {}
  }

  if (finnhubSymbols.length === 0) {
    return NextResponse.json(
      { error: "Finnhub returned 0 symbols. Check FINNHUB_API_KEY." },
      { status: 502 }
    );
  }

  // Filter for common stocks on major exchanges (NASDAQ, NYSE, AMEX)
  const MAJOR_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS"]);
  const STOCK_TYPES = new Set(["Common Stock", "EQS"]);

  const usStocks = finnhubSymbols.filter(
    (s: any) =>
      s.symbol &&
      s.description &&
      !s.symbol.includes(".") &&
      !s.symbol.includes("-") &&
      s.symbol.length <= 5 &&
      MAJOR_MICS.has(s.mic) &&
      STOCK_TYPES.has(s.type)
  );

  // 2. Fetch SEC EDGAR tickers for CIK mapping
  const cikMap = new Map<string, { cik: string; name: string; exchange: string }>();
  try {
    const res = await fetch(
      "https://www.sec.gov/files/company_tickers_exchange.json",
      {
        headers: {
          "User-Agent":
            process.env.SEC_EDGAR_USER_AGENT ||
            "Catalyst research@catalyst.claudeo.ai",
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      for (const row of data.data || []) {
        // fields: [cik, name, ticker, exchange]
        cikMap.set(row[2], {
          cik: String(row[0]),
          name: row[1],
          exchange: row[3] || "",
        });
      }
    }
  } catch {}

  // 3. Get existing symbols to avoid redundant upserts
  const { data: existingTickers } = await supabase
    .from("tickers")
    .select("symbol");
  const existingSet = new Set(
    (existingTickers || []).map((t: any) => t.symbol)
  );

  // 4. Batch insert new tickers
  const toInsert: any[] = [];
  for (const stock of usStocks) {
    if (existingSet.has(stock.symbol)) {
      skipped++;
      continue;
    }

    const sec = cikMap.get(stock.symbol);
    const exchangeName =
      stock.mic === "XNAS"
        ? "NASDAQ"
        : stock.mic === "XNYS"
          ? "NYSE"
          : stock.mic === "XASE"
            ? "AMEX"
            : "NYSE";

    toInsert.push({
      symbol: stock.symbol,
      company_name: (sec?.name || stock.description || stock.symbol).slice(
        0,
        200
      ),
      exchange: exchangeName,
      cik: sec?.cik || null,
    });
  }

  // Insert in chunks of 200
  for (const chunk of chunkArray(toInsert, 200)) {
    if (Date.now() - startTime > 50000) break;

    const { error } = await supabase.from("tickers").insert(chunk);
    if (!error) {
      inserted += chunk.length;
    } else {
      // Fallback: insert one by one to skip any duplicates
      for (const row of chunk) {
        const { error: e2 } = await supabase.from("tickers").insert(row);
        if (!e2) inserted++;
      }
    }
  }

  // 5. Backfill CIK for existing tickers that don't have one
  let cikBackfilled = 0;
  if (cikMap.size > 0) {
    const { data: noCik } = await supabase
      .from("tickers")
      .select("id, symbol")
      .is("cik", null)
      .limit(1000);

    for (const t of noCik || []) {
      const sec = cikMap.get(t.symbol);
      if (sec?.cik) {
        await supabase.from("tickers").update({ cik: sec.cik }).eq("id", t.id);
        cikBackfilled++;
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const { count } = await supabase
    .from("tickers")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    inserted,
    skipped,
    cikBackfilled,
    finnhubTotal: finnhubSymbols.length,
    filteredStocks: usStocks.length,
    secCompanies: cikMap.size,
    totalInDb: count,
    elapsedSeconds: elapsed,
  });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
