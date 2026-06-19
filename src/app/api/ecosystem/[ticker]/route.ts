import { NextRequest, NextResponse } from "next/server";
import { getEcosystemMap, getEcosystemPicks, HARDCODED_ECOSYSTEM_TICKERS } from "@/lib/ingestion/ecosystem";
import { getBatchQuotes } from "@/lib/ingestion/market-data";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  const ecosystem = await getEcosystemMap(symbol);

  // Get live quotes for all ecosystem partners
  const partnerTickers = ecosystem.edges.map((e) => e.targetTicker);
  const quotes = await getBatchQuotes(partnerTickers);

  const quotesMap = new Map<string, { price: number; changePercent: number }>();
  quotes.forEach((q, sym) => {
    quotesMap.set(sym, { price: q.price, changePercent: q.changePercent });
  });

  const picks = await getEcosystemPicks(symbol, quotesMap);

  return NextResponse.json({
    ticker: symbol,
    totalRelationships: ecosystem.edges.length,
    isAiGenerated: !HARDCODED_ECOSYSTEM_TICKERS.includes(symbol),
    edges: ecosystem.edges.map((e) => ({
      ...e,
      quote: quotes.get(e.targetTicker) || null,
    })),
    picks,
    summary: ecosystem.summary,
  });
}
