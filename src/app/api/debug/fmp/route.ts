import { NextRequest, NextResponse } from "next/server";

const FMP_KEY = process.env.FMP_API_KEY || "";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, any> = {
    hasKey: !!FMP_KEY,
    keyPrefix: FMP_KEY ? FMP_KEY.slice(0, 6) + "..." : "NONE",
  };

  // Test 1: Single quote
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/AAPL?apikey=${FMP_KEY}`
    );
    const text = await res.text();
    results.singleQuote = {
      status: res.status,
      body: text.slice(0, 500),
    };
  } catch (e: any) {
    results.singleQuote = { error: e.message };
  }

  // Test 2: Stock list (first 5)
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/stock/list?apikey=${FMP_KEY}`
    );
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {}
    results.stockList = {
      status: res.status,
      isArray: Array.isArray(parsed),
      count: Array.isArray(parsed) ? parsed.length : 0,
      sample: Array.isArray(parsed) ? parsed.slice(0, 3) : text.slice(0, 500),
    };
  } catch (e: any) {
    results.stockList = { error: e.message };
  }

  // Test 3: Batch quote (3 symbols)
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/AAPL,MSFT,NVDA?apikey=${FMP_KEY}`
    );
    const text = await res.text();
    results.batchQuote = {
      status: res.status,
      body: text.slice(0, 800),
    };
  } catch (e: any) {
    results.batchQuote = { error: e.message };
  }

  // Test 4: Stock screener
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=100000000000&exchange=NYSE,NASDAQ&limit=5&apikey=${FMP_KEY}`
    );
    const text = await res.text();
    results.screener = {
      status: res.status,
      body: text.slice(0, 500),
    };
  } catch (e: any) {
    results.screener = { error: e.message };
  }

  return NextResponse.json(results);
}
