import { NextRequest, NextResponse } from "next/server";
import { getCompanyNews, getNewsSentiment } from "@/lib/ingestion/news";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const days = parseInt(request.nextUrl.searchParams.get("days") || "7");

  const [news, sentiment] = await Promise.all([
    getCompanyNews(ticker.toUpperCase(), days),
    getNewsSentiment(ticker.toUpperCase()),
  ]);

  return NextResponse.json({ news, sentiment });
}
