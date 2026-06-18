import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const FMP_KEY = process.env.FMP_API_KEY || "";

const CORE_TICKERS: [string, string, string, string][] = [
  // [symbol, name, exchange, sector]
  // Mega-cap tech
  ["AAPL", "Apple Inc.", "NASDAQ", "Technology"],
  ["MSFT", "Microsoft Corporation", "NASDAQ", "Technology"],
  ["GOOGL", "Alphabet Inc.", "NASDAQ", "Technology"],
  ["AMZN", "Amazon.com, Inc.", "NASDAQ", "Consumer Cyclical"],
  ["NVDA", "NVIDIA Corporation", "NASDAQ", "Technology"],
  ["META", "Meta Platforms, Inc.", "NASDAQ", "Technology"],
  ["TSLA", "Tesla, Inc.", "NASDAQ", "Consumer Cyclical"],
  ["AVGO", "Broadcom Inc.", "NASDAQ", "Technology"],
  ["ORCL", "Oracle Corporation", "NYSE", "Technology"],
  ["ADBE", "Adobe Inc.", "NASDAQ", "Technology"],
  ["CRM", "Salesforce, Inc.", "NYSE", "Technology"],
  ["AMD", "Advanced Micro Devices, Inc.", "NASDAQ", "Technology"],
  ["NFLX", "Netflix, Inc.", "NASDAQ", "Communication Services"],
  ["INTC", "Intel Corporation", "NASDAQ", "Technology"],
  ["CSCO", "Cisco Systems, Inc.", "NASDAQ", "Technology"],
  ["QCOM", "QUALCOMM Incorporated", "NASDAQ", "Technology"],
  ["TXN", "Texas Instruments Incorporated", "NASDAQ", "Technology"],
  ["IBM", "International Business Machines", "NYSE", "Technology"],
  ["NOW", "ServiceNow, Inc.", "NYSE", "Technology"],
  ["INTU", "Intuit Inc.", "NASDAQ", "Technology"],
  ["AMAT", "Applied Materials, Inc.", "NASDAQ", "Technology"],
  ["ISRG", "Intuitive Surgical, Inc.", "NASDAQ", "Healthcare"],
  ["MU", "Micron Technology, Inc.", "NASDAQ", "Technology"],
  ["LRCX", "Lam Research Corporation", "NASDAQ", "Technology"],
  ["KLAC", "KLA Corporation", "NASDAQ", "Technology"],
  ["SNPS", "Synopsys, Inc.", "NASDAQ", "Technology"],
  ["CDNS", "Cadence Design Systems", "NASDAQ", "Technology"],
  ["MRVL", "Marvell Technology, Inc.", "NASDAQ", "Technology"],
  ["PANW", "Palo Alto Networks, Inc.", "NASDAQ", "Technology"],
  ["CRWD", "CrowdStrike Holdings", "NASDAQ", "Technology"],
  // AI & Cloud
  ["PLTR", "Palantir Technologies Inc.", "NYSE", "Technology"],
  ["SNOW", "Snowflake Inc.", "NYSE", "Technology"],
  ["ARM", "Arm Holdings plc", "NASDAQ", "Technology"],
  ["SMCI", "Super Micro Computer, Inc.", "NASDAQ", "Technology"],
  ["NET", "Cloudflare, Inc.", "NYSE", "Technology"],
  ["DDOG", "Datadog, Inc.", "NASDAQ", "Technology"],
  ["ZS", "Zscaler, Inc.", "NASDAQ", "Technology"],
  ["MDB", "MongoDB, Inc.", "NASDAQ", "Technology"],
  ["TEAM", "Atlassian Corporation", "NASDAQ", "Technology"],
  ["WDAY", "Workday, Inc.", "NASDAQ", "Technology"],
  // Finance
  ["JPM", "JPMorgan Chase & Co.", "NYSE", "Financial Services"],
  ["V", "Visa Inc.", "NYSE", "Financial Services"],
  ["MA", "Mastercard Incorporated", "NYSE", "Financial Services"],
  ["BAC", "Bank of America Corporation", "NYSE", "Financial Services"],
  ["WFC", "Wells Fargo & Company", "NYSE", "Financial Services"],
  ["GS", "The Goldman Sachs Group", "NYSE", "Financial Services"],
  ["MS", "Morgan Stanley", "NYSE", "Financial Services"],
  ["BLK", "BlackRock, Inc.", "NYSE", "Financial Services"],
  ["AXP", "American Express Company", "NYSE", "Financial Services"],
  ["C", "Citigroup Inc.", "NYSE", "Financial Services"],
  ["SCHW", "Charles Schwab Corporation", "NYSE", "Financial Services"],
  ["COIN", "Coinbase Global, Inc.", "NASDAQ", "Financial Services"],
  ["SQ", "Block, Inc.", "NYSE", "Financial Services"],
  ["PYPL", "PayPal Holdings, Inc.", "NASDAQ", "Financial Services"],
  ["SOFI", "SoFi Technologies, Inc.", "NASDAQ", "Financial Services"],
  // Healthcare
  ["UNH", "UnitedHealth Group", "NYSE", "Healthcare"],
  ["JNJ", "Johnson & Johnson", "NYSE", "Healthcare"],
  ["LLY", "Eli Lilly and Company", "NYSE", "Healthcare"],
  ["PFE", "Pfizer Inc.", "NYSE", "Healthcare"],
  ["ABBV", "AbbVie Inc.", "NYSE", "Healthcare"],
  ["MRK", "Merck & Co., Inc.", "NYSE", "Healthcare"],
  ["TMO", "Thermo Fisher Scientific", "NYSE", "Healthcare"],
  ["ABT", "Abbott Laboratories", "NYSE", "Healthcare"],
  ["DHR", "Danaher Corporation", "NYSE", "Healthcare"],
  ["BMY", "Bristol-Myers Squibb", "NYSE", "Healthcare"],
  ["AMGN", "Amgen Inc.", "NASDAQ", "Healthcare"],
  ["GILD", "Gilead Sciences, Inc.", "NASDAQ", "Healthcare"],
  ["MRNA", "Moderna, Inc.", "NASDAQ", "Healthcare"],
  // Consumer
  ["WMT", "Walmart Inc.", "NYSE", "Consumer Defensive"],
  ["PG", "The Procter & Gamble Company", "NYSE", "Consumer Defensive"],
  ["KO", "The Coca-Cola Company", "NYSE", "Consumer Defensive"],
  ["PEP", "PepsiCo, Inc.", "NASDAQ", "Consumer Defensive"],
  ["COST", "Costco Wholesale Corporation", "NASDAQ", "Consumer Defensive"],
  ["HD", "The Home Depot, Inc.", "NYSE", "Consumer Cyclical"],
  ["MCD", "McDonald's Corporation", "NYSE", "Consumer Cyclical"],
  ["NKE", "NIKE, Inc.", "NYSE", "Consumer Cyclical"],
  ["SBUX", "Starbucks Corporation", "NASDAQ", "Consumer Cyclical"],
  ["TGT", "Target Corporation", "NYSE", "Consumer Defensive"],
  ["LOW", "Lowe's Companies, Inc.", "NYSE", "Consumer Cyclical"],
  // Industrials & Energy
  ["CAT", "Caterpillar Inc.", "NYSE", "Industrials"],
  ["GE", "GE Aerospace", "NYSE", "Industrials"],
  ["BA", "The Boeing Company", "NYSE", "Industrials"],
  ["RTX", "RTX Corporation", "NYSE", "Industrials"],
  ["HON", "Honeywell International", "NASDAQ", "Industrials"],
  ["UPS", "United Parcel Service", "NYSE", "Industrials"],
  ["DE", "Deere & Company", "NYSE", "Industrials"],
  ["XOM", "Exxon Mobil Corporation", "NYSE", "Energy"],
  ["CVX", "Chevron Corporation", "NYSE", "Energy"],
  ["COP", "ConocoPhillips", "NYSE", "Energy"],
  ["SLB", "Schlumberger Limited", "NYSE", "Energy"],
  // Communications
  ["DIS", "The Walt Disney Company", "NYSE", "Communication Services"],
  ["CMCSA", "Comcast Corporation", "NASDAQ", "Communication Services"],
  ["T", "AT&T Inc.", "NYSE", "Communication Services"],
  ["VZ", "Verizon Communications", "NYSE", "Communication Services"],
  ["TMUS", "T-Mobile US, Inc.", "NASDAQ", "Communication Services"],
  ["SPOT", "Spotify Technology S.A.", "NYSE", "Communication Services"],
  // Real Estate & Utilities
  ["AMT", "American Tower Corporation", "NYSE", "Real Estate"],
  ["PLD", "Prologis, Inc.", "NYSE", "Real Estate"],
  ["NEE", "NextEra Energy, Inc.", "NYSE", "Utilities"],
  ["DUK", "Duke Energy Corporation", "NYSE", "Utilities"],
  ["SO", "The Southern Company", "NYSE", "Utilities"],
  // EV & Mobility
  ["RIVN", "Rivian Automotive, Inc.", "NASDAQ", "Consumer Cyclical"],
  ["LCID", "Lucid Group, Inc.", "NASDAQ", "Consumer Cyclical"],
  ["UBER", "Uber Technologies, Inc.", "NYSE", "Technology"],
  ["LYFT", "Lyft, Inc.", "NASDAQ", "Technology"],
  ["ABNB", "Airbnb, Inc.", "NASDAQ", "Consumer Cyclical"],
  // E-commerce & Retail
  ["SHOP", "Shopify Inc.", "NYSE", "Technology"],
  ["SQ", "Block, Inc.", "NYSE", "Financial Services"],
  ["MELI", "MercadoLibre, Inc.", "NASDAQ", "Consumer Cyclical"],
  ["SE", "Sea Limited", "NYSE", "Communication Services"],
  ["BABA", "Alibaba Group", "NYSE", "Consumer Cyclical"],
  // Crypto & Fintech
  ["MSTR", "MicroStrategy Incorporated", "NASDAQ", "Technology"],
  ["MARA", "Marathon Digital Holdings", "NASDAQ", "Financial Services"],
  ["RIOT", "Riot Platforms, Inc.", "NASDAQ", "Financial Services"],
  // Materials
  ["LIN", "Linde plc", "NASDAQ", "Basic Materials"],
  ["APD", "Air Products and Chemicals", "NYSE", "Basic Materials"],
  ["FCX", "Freeport-McMoRan Inc.", "NYSE", "Basic Materials"],
  ["NEM", "Newmont Corporation", "NYSE", "Basic Materials"],
];

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  let inserted = 0;
  let updated = 0;

  // 1. Upsert core tickers list
  for (const [symbol, name, exchange, sector] of CORE_TICKERS) {
    const { data: existing } = await supabase
      .from("tickers")
      .select("id")
      .eq("symbol", symbol)
      .single();

    if (existing) {
      await supabase
        .from("tickers")
        .update({ company_name: name, sector, exchange })
        .eq("id", existing.id);
      updated++;
    } else {
      const { error } = await supabase.from("tickers").insert({
        symbol,
        company_name: name,
        exchange,
        sector,
      });
      if (!error) inserted++;
    }
  }

  // 2. Try FMP stock list for additional tickers
  if (FMP_KEY) {
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/api/v3/stock/list?apikey=${FMP_KEY}`
      );
      if (res.ok) {
        const stocks = await res.json();
        const usStocks = (stocks || [])
          .filter(
            (s: any) =>
              s.exchangeShortName &&
              ["NASDAQ", "NYSE", "AMEX"].includes(s.exchangeShortName) &&
              s.type === "stock" &&
              s.price > 5 &&
              s.name
          )
          .sort((a: any, b: any) => (b.marketCap || 0) - (a.marketCap || 0))
          .slice(0, 300);

        for (const s of usStocks) {
          const { data: existing } = await supabase
            .from("tickers")
            .select("id")
            .eq("symbol", s.symbol)
            .single();

          if (!existing) {
            const { error } = await supabase.from("tickers").insert({
              symbol: s.symbol,
              company_name: s.name,
              exchange: s.exchangeShortName,
            });
            if (!error) inserted++;
          }
        }
      }
    } catch {}
  }

  // 3. Backfill CIK numbers
  try {
    const { data: noCik } = await supabase
      .from("tickers")
      .select("id, symbol")
      .is("cik", null)
      .limit(200);

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
