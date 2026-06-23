import { NextResponse } from "next/server";

export const revalidate = 60;

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const FMP_KEY = process.env.FMP_API_KEY || "";

const INDICES = [
  { symbol: "^GSPC", fmpSymbol: "^GSPC", name: "S&P 500", shortName: "S&P" },
  { symbol: "^DJI", fmpSymbol: "^DJI", name: "Dow Jones", shortName: "DOW" },
  { symbol: "^IXIC", fmpSymbol: "^IXIC", name: "NASDAQ", shortName: "NASDAQ" },
  { symbol: "^RUT", fmpSymbol: "^RUT", name: "Russell 2000", shortName: "R2K" },
  { symbol: "^VIX", fmpSymbol: "^VIX", name: "VIX", shortName: "VIX" },
];

interface IndexQuote {
  symbol: string;
  name: string;
  shortName: string;
  price: number;
  change: number;
  changePercent: number;
}

async function fetchViaFMP(): Promise<IndexQuote[]> {
  if (!FMP_KEY) return [];

  const symbols = INDICES.map((i) => i.fmpSymbol).join(",");
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/batch-quote?symbols=${encodeURIComponent(symbols)}&apikey=${FMP_KEY}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [];

    const results: IndexQuote[] = [];
    for (const idx of INDICES) {
      const q = arr.find(
        (d: any) => d.symbol === idx.fmpSymbol || d.symbol === idx.symbol
      );
      if (q && (q.price > 0 || q.lastPrice > 0)) {
        results.push({
          symbol: idx.symbol,
          name: idx.name,
          shortName: idx.shortName,
          price: q.price || q.lastPrice || 0,
          change: q.change ?? q.priceChange ?? 0,
          changePercent:
            q.changePercentage ?? q.changesPercentage ?? q.priceChangePercent ?? 0,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function fetchViaFinnhub(): Promise<IndexQuote[]> {
  if (!FINNHUB_KEY) return [];

  const finnhubIndices = [
    { symbol: "^GSPC", finnhub: "SPY", name: "S&P 500", shortName: "S&P", isETF: true },
    { symbol: "^DJI", finnhub: "DIA", name: "Dow Jones", shortName: "DOW", isETF: true },
    { symbol: "^IXIC", finnhub: "QQQ", name: "NASDAQ", shortName: "NASDAQ", isETF: true },
    { symbol: "^RUT", finnhub: "IWM", name: "Russell 2000", shortName: "R2K", isETF: true },
    { symbol: "^VIX", finnhub: "VIXY", name: "VIX", shortName: "VIX", isETF: true },
  ];

  const results: IndexQuote[] = [];
  const quotes = await Promise.all(
    finnhubIndices.map(async (idx) => {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${idx.finnhub}&token=${FINNHUB_KEY}`,
          { next: { revalidate: 60 } }
        );
        const d = await res.json();
        if (d.c > 0) {
          return {
            symbol: idx.symbol,
            name: idx.name,
            shortName: idx.shortName,
            price: d.c,
            change: d.d ?? 0,
            changePercent: d.dp ?? 0,
          };
        }
        return null;
      } catch {
        return null;
      }
    })
  );

  for (const q of quotes) {
    if (q) results.push(q);
  }
  return results;
}

export async function GET() {
  let indices = await fetchViaFMP();
  if (indices.length < 3) {
    indices = await fetchViaFinnhub();
  }

  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay();
  const timeET = hour * 60 + minute;

  let marketStatus: "pre" | "open" | "post" | "closed";
  if (day === 0 || day === 6) {
    marketStatus = "closed";
  } else if (timeET >= 240 && timeET < 570) {
    marketStatus = "pre";
  } else if (timeET >= 570 && timeET < 960) {
    marketStatus = "open";
  } else if (timeET >= 960 && timeET < 1200) {
    marketStatus = "post";
  } else {
    marketStatus = "closed";
  }

  return NextResponse.json({
    indices,
    marketStatus,
    timestamp: now.toISOString(),
  });
}
