import { createServiceClient } from "./server";
import type { Signal, SignalBreakdown, Holding } from "../types";

export async function getActiveCalls(): Promise<Signal[]> {
  const supabase = createServiceClient();

  const { data: calls, error } = await supabase
    .from("calls")
    .select(
      `
      id,
      call,
      conviction,
      horizon,
      entry_price,
      target_price,
      stop_price,
      risk_reward,
      why,
      ai_reasoning,
      signal_ids,
      created_at,
      ticker_id,
      tickers!inner (
        symbol,
        company_name,
        exchange
      )
    `
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !calls?.length) return [];

  const result: Signal[] = [];

  for (const c of calls) {
    const ticker = (c as any).tickers;
    const signalRows = await getSignalsForCall(
      supabase,
      c.signal_ids || [],
      c.ticker_id
    );

    result.push({
      id: String(c.id),
      ticker: ticker.symbol,
      company: ticker.company_name,
      exchange: ticker.exchange,
      price: 0,
      change: 0,
      changePercent: 0,
      call: c.call,
      conviction: c.conviction,
      horizon: c.horizon || "",
      entry: c.entry_price ?? undefined,
      target: c.target_price ?? undefined,
      stop: c.stop_price ?? undefined,
      riskReward: c.risk_reward ?? undefined,
      why: c.why,
      tags: signalRows.map((s) => s.type.replace("_", " ")),
      signals: signalRows,
      sparkline: [],
      timestamp: c.created_at,
    });
  }

  return result;
}

async function getSignalsForCall(
  supabase: any,
  signalIds: number[],
  tickerId: number
): Promise<SignalBreakdown[]> {
  if (signalIds.length === 0) {
    const { data } = await supabase
      .from("signals")
      .select("source, title, detail, sentiment")
      .eq("ticker_id", tickerId)
      .order("signal_date", { ascending: false })
      .limit(5);

    return (data || []).map(mapSignalRow);
  }

  const { data } = await supabase
    .from("signals")
    .select("source, title, detail, sentiment")
    .in("id", signalIds)
    .limit(10);

  return (data || []).map(mapSignalRow);
}

const SOURCE_TO_TYPE: Record<string, string> = {
  insider_trade: "INSIDER_BUY",
  sec_filing: "SEC_FILING",
  analyst_action: "UPGRADE",
  earnings: "EARNINGS",
  guidance: "GUIDANCE",
  options_flow: "OPTIONS_FLOW",
  news_sentiment: "NEWS",
  technical: "TECHNICAL",
};

function mapSignalRow(row: any): SignalBreakdown {
  return {
    type: (SOURCE_TO_TYPE[row.source] || "NEWS") as any,
    title: row.title,
    detail: row.detail || "",
    sentiment: row.sentiment,
  };
}

export async function getCallById(id: string): Promise<Signal | null> {
  const supabase = createServiceClient();

  const { data: c, error } = await supabase
    .from("calls")
    .select(
      `
      *,
      tickers!inner (symbol, company_name, exchange)
    `
    )
    .eq("id", parseInt(id))
    .single();

  if (error || !c) return null;

  const ticker = (c as any).tickers;
  const signalRows = await getSignalsForCall(
    supabase,
    c.signal_ids || [],
    c.ticker_id
  );

  return {
    id: String(c.id),
    ticker: ticker.symbol,
    company: ticker.company_name,
    exchange: ticker.exchange,
    price: 0,
    change: 0,
    changePercent: 0,
    call: c.call,
    conviction: c.conviction,
    horizon: c.horizon || "",
    entry: c.entry_price ?? undefined,
    target: c.target_price ?? undefined,
    stop: c.stop_price ?? undefined,
    riskReward: c.risk_reward ?? undefined,
    why: c.why,
    tags: signalRows.map((s) => s.type.replace("_", " ")),
    signals: signalRows,
    sparkline: [],
    timestamp: c.created_at,
  };
}

export async function storeIngestionResults(
  tickerSymbol: string,
  signals: {
    source: string;
    title: string;
    detail: string;
    sentiment: string;
  }[],
  aiResult: {
    call: string;
    conviction: number;
    horizon: string;
    entryPrice: number | null;
    targetPrice: number | null;
    stopPrice: number | null;
    riskReward: string | null;
    why: string;
    reasoning: string;
  },
  modelUsed: string
) {
  const supabase = createServiceClient();

  const { data: ticker } = await supabase
    .from("tickers")
    .select("id")
    .eq("symbol", tickerSymbol)
    .single();

  if (!ticker) return;

  await supabase
    .from("calls")
    .update({ is_active: false })
    .eq("ticker_id", ticker.id)
    .eq("is_active", true);

  const signalIds: number[] = [];
  for (const s of signals) {
    const { data: inserted } = await supabase
      .from("signals")
      .insert({
        ticker_id: ticker.id,
        source: s.source,
        sentiment: s.sentiment === "positive" ? "positive" : s.sentiment === "negative" ? "negative" : "neutral",
        title: s.title,
        detail: s.detail,
      })
      .select("id")
      .single();

    if (inserted) signalIds.push(inserted.id);
  }

  await supabase.from("calls").insert({
    ticker_id: ticker.id,
    call: aiResult.call,
    conviction: aiResult.conviction,
    horizon: aiResult.horizon,
    entry_price: aiResult.entryPrice,
    target_price: aiResult.targetPrice,
    stop_price: aiResult.stopPrice,
    risk_reward: aiResult.riskReward,
    why: aiResult.why,
    ai_reasoning: aiResult.reasoning,
    signal_ids: signalIds,
    model_used: modelUsed,
  });
}

export async function storeInsiderTrade(
  tickerSymbol: string,
  trade: {
    filerName: string;
    filerRole: string;
    tradeType: string;
    shares: number;
    pricePerShare: number;
    totalValue: number;
    sharesOwnedAfter: number;
    filingDate: string;
    transactionDate: string;
    accessionNumber: string;
  }
) {
  const supabase = createServiceClient();

  const { data: ticker } = await supabase
    .from("tickers")
    .select("id")
    .eq("symbol", tickerSymbol)
    .single();

  if (!ticker) return;

  await supabase
    .from("insider_trades")
    .upsert(
      {
        ticker_id: ticker.id,
        filer_name: trade.filerName,
        filer_role: trade.filerRole,
        trade_type: trade.tradeType,
        shares: trade.shares,
        price_per_share: trade.pricePerShare,
        total_value: trade.totalValue,
        shares_owned_after: trade.sharesOwnedAfter,
        filing_date: trade.filingDate,
        transaction_date: trade.transactionDate || trade.filingDate,
        accession_number: trade.accessionNumber,
      },
      { onConflict: "accession_number" }
    );
}

export async function getUserPortfolio(userId: string): Promise<Holding[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("portfolio")
    .select(
      `
      shares,
      avg_cost,
      tickers!inner (symbol, company_name)
    `
    )
    .eq("user_id", userId);

  if (error || !data?.length) return [];

  return data.map((row: any) => ({
    ticker: row.tickers.symbol,
    company: row.tickers.company_name,
    shares: row.shares,
    avgCost: row.avg_cost,
    currentPrice: 0,
    change: 0,
    changePercent: 0,
    totalValue: 0,
    pnl: 0,
    pnlPercent: 0,
    hasActiveSignal: false,
    sparkline: [],
  }));
}

export async function getUserAlerts(userId: string) {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("user_alerts")
    .select("*")
    .eq("user_id", userId)
    .single();

  return data;
}

export async function saveUserAlerts(userId: string, settings: any) {
  const supabase = createServiceClient();

  await supabase.from("user_alerts").upsert({
    user_id: userId,
    push_enabled: settings.channels.push,
    whatsapp_enabled: settings.channels.whatsapp,
    email_enabled: settings.channels.email,
    min_conviction: settings.minConviction,
    track_insider_trades: settings.signals.insiderTrades,
    track_sec_filings: settings.signals.secFilings,
    track_analyst_changes: settings.signals.analystChanges,
    track_earnings: settings.signals.earningsGuidance,
    track_options_flow: settings.signals.optionsFlow,
    track_news_sentiment: settings.signals.newsSentiment,
    track_technical: settings.signals.technicalSignals,
  });
}

export async function saveUserProfile(
  userId: string,
  profile: { goal: string; risk: string; capital: string }
) {
  const supabase = createServiceClient();

  await supabase.from("user_profiles").upsert({
    id: userId,
    goal: profile.goal,
    risk_tolerance: profile.risk,
    capital_range: profile.capital,
    onboarding_completed: true,
  });
}

export async function logIngestion(
  source: string,
  status: string,
  records: number,
  errorMsg?: string
) {
  const supabase = createServiceClient();

  await supabase.from("ingestion_log").insert({
    source,
    status,
    records_processed: records,
    error_message: errorMsg,
    finished_at: status !== "running" ? new Date().toISOString() : null,
  });
}
