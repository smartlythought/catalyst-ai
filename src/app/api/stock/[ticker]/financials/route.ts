import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86400;

const FMP_KEY = process.env.FMP_API_KEY || "";

interface AnnualFinancial {
  year: number;
  revenue: number;
  netIncome: number;
  eps: number;
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  totalAssets: number;
  totalDebt: number;
  freeCashFlow: number;
  revenueGrowth: number | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  if (!FMP_KEY) {
    return NextResponse.json({ error: "FMP not configured" }, { status: 500 });
  }

  async function fetchFinancialSet(stableEndpoint: string, v3Endpoint: string) {
    const stableRes = await fetch(
      `https://financialmodelingprep.com/stable/${stableEndpoint}?symbol=${symbol}&period=annual&limit=5&apikey=${FMP_KEY}`,
      { next: { revalidate: 86400 } }
    ).catch(() => null);
    if (stableRes?.ok) {
      const data = await stableRes.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log(`[financials] ${symbol} ${stableEndpoint} stable OK: ${data.length} rows`);
        return data;
      }
      console.log(`[financials] ${symbol} ${stableEndpoint} stable empty`);
    } else {
      console.log(`[financials] ${symbol} ${stableEndpoint} stable ${stableRes?.status || "failed"}`);
    }
    const v3Res = await fetch(
      `https://financialmodelingprep.com/api/v3/${v3Endpoint}/${symbol}?period=annual&limit=5&apikey=${FMP_KEY}`,
      { next: { revalidate: 86400 } }
    ).catch(() => null);
    if (v3Res?.ok) {
      const data = await v3Res.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log(`[financials] ${symbol} ${v3Endpoint} v3 OK: ${data.length} rows`);
        return data;
      }
      console.log(`[financials] ${symbol} ${v3Endpoint} v3 empty`);
    } else {
      console.log(`[financials] ${symbol} ${v3Endpoint} v3 ${v3Res?.status || "failed"}`);
    }
    return [];
  }

  const [incArr, balArr, cfArr] = await Promise.all([
    fetchFinancialSet("income-statement", "income-statement"),
    fetchFinancialSet("balance-sheet-statement", "balance-sheet-statement"),
    fetchFinancialSet("cash-flow-statement", "cash-flow-statement"),
  ]);

  if (incArr.length === 0) {
    return NextResponse.json({ error: "No financial data available" }, { status: 404 });
  }

  const financials: AnnualFinancial[] = incArr.map((inc: any, i: number) => {
    const bal = balArr[i] || {};
    const cf = cfArr[i] || {};
    const year = parseInt(inc.calendarYear || inc.date?.split("-")[0] || "0");
    const revenue = inc.revenue || 0;
    const netIncome = inc.netIncome || 0;
    const prevRevenue = incArr[i + 1]?.revenue;

    return {
      year,
      revenue,
      netIncome,
      eps: inc.eps || inc.epsdiluted || 0,
      grossMargin: revenue > 0 ? ((inc.grossProfit || 0) / revenue) * 100 : 0,
      operatingMargin: revenue > 0 ? ((inc.operatingIncome || 0) / revenue) * 100 : 0,
      netMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
      totalAssets: bal.totalAssets || 0,
      totalDebt: bal.totalDebt || bal.longTermDebt || 0,
      freeCashFlow: cf.freeCashFlow || 0,
      revenueGrowth: prevRevenue && prevRevenue > 0
        ? ((revenue - prevRevenue) / prevRevenue) * 100
        : null,
    };
  });

  financials.sort((a, b) => a.year - b.year);

  return NextResponse.json({
    symbol,
    financials,
    yearsAvailable: financials.length,
  });
}
