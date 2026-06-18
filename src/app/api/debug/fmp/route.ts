import { NextRequest, NextResponse } from "next/server";

const FMP_KEY = process.env.FMP_API_KEY || "";
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, any> = {
    fmpKey: FMP_KEY ? FMP_KEY.slice(0, 6) + "..." : "NONE",
    finnhubKey: FINNHUB_KEY ? FINNHUB_KEY.slice(0, 6) + "..." : "NONE",
  };

  // Test FMP v3 (legacy)
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/AAPL?apikey=${FMP_KEY}`
    );
    results.fmp_v3 = { status: res.status, body: (await res.text()).slice(0, 300) };
  } catch (e: any) { results.fmp_v3 = { error: e.message }; }

  // Test FMP stable API (new format)
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=${FMP_KEY}`
    );
    results.fmp_stable_quote = { status: res.status, body: (await res.text()).slice(0, 500) };
  } catch (e: any) { results.fmp_stable_quote = { error: e.message }; }

  // Test FMP stable batch
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/batch-quote?symbols=AAPL,MSFT,NVDA&apikey=${FMP_KEY}`
    );
    results.fmp_stable_batch = { status: res.status, body: (await res.text()).slice(0, 800) };
  } catch (e: any) { results.fmp_stable_batch = { error: e.message }; }

  // Test FMP stable stock list
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/stock-list?apikey=${FMP_KEY}`
    );
    const text = await res.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch {}
    results.fmp_stable_stocklist = {
      status: res.status,
      isArray: Array.isArray(parsed),
      count: Array.isArray(parsed) ? parsed.length : 0,
      sample: Array.isArray(parsed) ? parsed.slice(0, 2) : text.slice(0, 300),
    };
  } catch (e: any) { results.fmp_stable_stocklist = { error: e.message }; }

  // Test FMP stable search
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/search?query=AAPL&apikey=${FMP_KEY}`
    );
    results.fmp_stable_search = { status: res.status, body: (await res.text()).slice(0, 500) };
  } catch (e: any) { results.fmp_stable_search = { error: e.message }; }

  // Test Finnhub quote
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${FINNHUB_KEY}`
    );
    results.finnhub_quote = { status: res.status, body: (await res.text()).slice(0, 300) };
  } catch (e: any) { results.finnhub_quote = { error: e.message }; }

  // Test Finnhub stock symbols (US exchange)
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${FINNHUB_KEY}`
    );
    const text = await res.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch {}
    results.finnhub_symbols = {
      status: res.status,
      isArray: Array.isArray(parsed),
      count: Array.isArray(parsed) ? parsed.length : 0,
      sample: Array.isArray(parsed) ? parsed.slice(0, 3) : text.slice(0, 300),
    };
  } catch (e: any) { results.finnhub_symbols = { error: e.message }; }

  // Test SEC EDGAR company tickers
  try {
    const res = await fetch("https://www.sec.gov/files/company_tickers_exchange.json", {
      headers: { "User-Agent": "Catalyst research@catalyst.claudeo.ai" },
    });
    const text = await res.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch {}
    const fields = parsed?.fields;
    const dataCount = parsed?.data?.length;
    results.sec_tickers = {
      status: res.status,
      fields,
      totalCompanies: dataCount,
      sample: parsed?.data?.slice(0, 3),
    };
  } catch (e: any) { results.sec_tickers = { error: e.message }; }

  return NextResponse.json(results);
}
