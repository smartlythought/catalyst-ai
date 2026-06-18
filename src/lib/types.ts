export type CallType = "BUY" | "REDUCE" | "WATCH";

export type SignalType =
  | "INSIDER_BUY"
  | "INSIDER_SELL"
  | "UPGRADE"
  | "DOWNGRADE"
  | "EARNINGS"
  | "GUIDANCE"
  | "OPTIONS_FLOW"
  | "SEC_FILING"
  | "NEWS"
  | "TECHNICAL";

export interface Signal {
  id: string;
  ticker: string;
  company: string;
  exchange: string;
  price: number;
  change: number;
  changePercent: number;
  call: CallType;
  conviction: number;
  horizon: string;
  entry?: number;
  target?: number;
  stop?: number;
  riskReward?: string;
  why: string;
  tags: string[];
  signals: SignalBreakdown[];
  sparkline: number[];
  timestamp: string;
}

export interface SignalBreakdown {
  type: SignalType;
  title: string;
  detail: string;
  sentiment: "positive" | "negative" | "neutral";
}

export interface Holding {
  ticker: string;
  company: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  change: number;
  changePercent: number;
  totalValue: number;
  pnl: number;
  pnlPercent: number;
  hasActiveSignal: boolean;
  sparkline: number[];
}

export interface StockDeepDive {
  ticker: string;
  company: string;
  exchange: string;
  price: number;
  change: number;
  changePercent: number;
  call: CallType;
  conviction: number;
  entry?: number;
  target?: number;
  stop?: number;
  stats: {
    marketCap: number;
    pe: number;
    week52Range: string;
    avgVolume: string;
  };
  chartData: { date: string; price: number }[];
  events: TimelineEvent[];
  insiders: InsiderTrade[];
  analysts: AnalystConsensus;
}

export interface TimelineEvent {
  date: string;
  type: string;
  title: string;
  detail: string;
  sentiment: "positive" | "negative" | "neutral" | "info";
}

export interface InsiderTrade {
  name: string;
  role: string;
  date: string;
  action: "BUY" | "SELL";
  amount: number;
}

export interface AnalystConsensus {
  buy: number;
  hold: number;
  sell: number;
  avgTarget: number;
}

export interface AlertSettings {
  channels: {
    push: boolean;
    whatsapp: boolean;
    email: boolean;
  };
  minConviction: number;
  signals: {
    insiderTrades: boolean;
    secFilings: boolean;
    analystChanges: boolean;
    earningsGuidance: boolean;
    optionsFlow: boolean;
    newsSentiment: boolean;
    technicalSignals: boolean;
  };
}
