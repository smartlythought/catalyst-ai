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

  const [incomeRes, balanceRes, cashFlowRes] = await Promise.all([
    fetch(
      `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&period=annual&limit=5&apikey=${FMP_KEY}`,
      { next: { revalidate: 86400 } }
    ).catch(() => null),
    fetch(
      `https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${symbol}&period=annual&limit=5&apikey=${FMP_KEY}`,
      { next: { revalidate: 86400 } }
    ).catch(() => null),
    fetch(
      `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${symbol}&period=annual&limit=5&apikey=${FMP_KEY}`,
      { next: { revalidate: 86400 } }
    ).catch(() => null),
  ]);

  const income = incomeRes?.ok ? await incomeRes.json() : [];
  const balance = balanceRes?.ok ? await balanceRes.json() : [];
  const cashFlow = cashFlowRes?.ok ? await cashFlowRes.json() : [];

  const incArr = Array.isArray(income) ? income : [];
  const balArr = Array.isArray(balance) ? balance : [];
  const cfArr = Array.isArray(cashFlow) ? cashFlow : [];

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
