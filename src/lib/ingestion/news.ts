const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const FMP_KEY = process.env.FMP_API_KEY || "";

export interface NewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: "positive" | "negative" | "neutral";
  ticker?: string;
  imageUrl?: string;
}

export interface NewsSentiment {
  ticker: string;
  bullishPercent: number;
  bearishPercent: number;
  newsScore: number;
  sectorAvgScore: number;
  articlesInLastWeek: number;
}

const POSITIVE_WORDS = [
  "upgrade", "beat", "growth", "surge", "rally", "record", "strong",
  "outperform", "bullish", "raised", "exceeded", "profit", "gains",
  "buy", "overweight", "accelerat", "momentum", "breakout", "boost",
];
const NEGATIVE_WORDS = [
  "downgrade", "miss", "decline", "fall", "drop", "loss", "weak",
  "underperform", "bearish", "lowered", "cut", "warning", "lawsuit",
  "sell", "underweight", "slowdown", "crash", "plunge", "risk",
];

export function classifySentiment(
  text: string
): "positive" | "negative" | "neutral" {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) score++;
  for (const w of NEGATIVE_WORDS) if (lower.includes(w)) score--;
  return score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
}

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchFinnhubNews(
  ticker: string,
  days: number
): Promise<NewsItem[]> {
  if (!FINNHUB_KEY) return [];
  try {
    const from = daysAgoISO(days);
    const to = todayISO();
    const res = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${FINNHUB_KEY}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).slice(0, 20).map((item: any) => ({
      title: item.headline,
      summary: item.summary || "",
      url: item.url,
      source: item.source || "finnhub",
      publishedAt: new Date(item.datetime * 1000).toISOString(),
      sentiment: classifySentiment(
        `${item.headline} ${item.summary || ""}`
      ),
      ticker,
      imageUrl: item.image || undefined,
    }));
  } catch {
    return [];
  }
}

async function fetchFMPNews(
  ticker: string,
  limit = 20
): Promise<NewsItem[]> {
  if (!FMP_KEY) return [];
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/news/stock?tickers=${ticker}&limit=${limit}&apikey=${FMP_KEY}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((item: any) => ({
      title: item.title,
      summary: item.text?.slice(0, 300) || "",
      url: item.url,
      source: item.site || "fmp",
      publishedAt: item.publishedDate || new Date().toISOString(),
      sentiment: classifySentiment(`${item.title} ${item.text || ""}`),
      ticker: item.symbol || ticker,
      imageUrl: item.image || undefined,
    }));
  } catch {
    return [];
  }
}

export async function getCompanyNews(
  ticker: string,
  days = 7
): Promise<NewsItem[]> {
  const [finnhub, fmp] = await Promise.all([
    fetchFinnhubNews(ticker, days),
    fetchFMPNews(ticker),
  ]);

  const seen = new Set<string>();
  const merged: NewsItem[] = [];

  for (const item of [...finnhub, ...fmp]) {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      merged.push(item);
    }
  }

  merged.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return merged;
}

export async function getMarketNews(limit = 20): Promise<NewsItem[]> {
  if (!FINNHUB_KEY) {
    if (!FMP_KEY) return [];
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/news/stock?limit=${limit}&apikey=${FMP_KEY}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data || []).map((item: any) => ({
        title: item.title,
        summary: item.text?.slice(0, 300) || "",
        url: item.url,
        source: item.site || "fmp",
        publishedAt: item.publishedDate || new Date().toISOString(),
        sentiment: classifySentiment(`${item.title} ${item.text || ""}`),
        ticker: item.symbol || undefined,
        imageUrl: item.image || undefined,
      }));
    } catch {
      return [];
    }
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).slice(0, limit).map((item: any) => ({
      title: item.headline,
      summary: item.summary || "",
      url: item.url,
      source: item.source || "finnhub",
      publishedAt: new Date(item.datetime * 1000).toISOString(),
      sentiment: classifySentiment(
        `${item.headline} ${item.summary || ""}`
      ),
      ticker: item.related || undefined,
      imageUrl: item.image || undefined,
    }));
  } catch {
    return [];
  }
}

export async function getNewsSentiment(
  ticker: string
): Promise<NewsSentiment | null> {
  if (!FINNHUB_KEY) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news-sentiment?symbol=${ticker}&token=${FINNHUB_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.sentiment) return null;
    return {
      ticker,
      bullishPercent: data.sentiment.bullishPercent || 0,
      bearishPercent: data.sentiment.bearishPercent || 0,
      newsScore: data.companyNewsScore || 0,
      sectorAvgScore: data.sectorAverageNewsScore || 0,
      articlesInLastWeek: data.buzz?.articlesInLastWeek || 0,
    };
  } catch {
    return null;
  }
}

export async function getBatchNews(
  tickers: string[]
): Promise<Map<string, NewsItem[]>> {
  const result = new Map<string, NewsItem[]>();
  for (const ticker of tickers) {
    const news = await getCompanyNews(ticker, 3);
    result.set(ticker, news.slice(0, 5));
    await delay(150);
  }
  return result;
}
