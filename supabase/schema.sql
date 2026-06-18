-- Catalyst Database Schema
-- Run this in Supabase SQL Editor to set up all tables

-- Optional extensions (enable via Supabase Dashboard > Database > Extensions if needed)
-- pgvector: only needed later for AI embedding search
-- pg_cron: only needed for scheduled jobs on Supabase Pro

-- ============================================================
-- TICKERS: Master list of tracked US stocks
-- ============================================================
CREATE TABLE tickers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'NASDAQ',
  sector TEXT,
  industry TEXT,
  cik TEXT, -- SEC CIK number for EDGAR lookups
  market_cap BIGINT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickers_symbol ON tickers (symbol);
CREATE INDEX idx_tickers_cik ON tickers (cik);

-- ============================================================
-- PRICE_HISTORY: Daily OHLCV + intraday snapshots
-- ============================================================
CREATE TABLE price_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker_id BIGINT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  open NUMERIC(12,4),
  high NUMERIC(12,4),
  low NUMERIC(12,4),
  close NUMERIC(12,4) NOT NULL,
  volume BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticker_id, date)
);

CREATE INDEX idx_price_history_ticker_date ON price_history (ticker_id, date DESC);

-- ============================================================
-- SIGNALS: Raw signals from all data sources
-- ============================================================
CREATE TYPE signal_source AS ENUM (
  'insider_trade',
  'sec_filing',
  'analyst_action',
  'earnings',
  'guidance',
  'options_flow',
  'news_sentiment',
  'technical'
);

CREATE TYPE signal_sentiment AS ENUM ('positive', 'negative', 'neutral');

CREATE TABLE signals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker_id BIGINT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  source signal_source NOT NULL,
  sentiment signal_sentiment NOT NULL DEFAULT 'neutral',
  title TEXT NOT NULL,
  detail TEXT,
  raw_data JSONB, -- Original API/filing data
  source_url TEXT,
  signal_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signals_ticker ON signals (ticker_id, signal_date DESC);
CREATE INDEX idx_signals_source ON signals (source, signal_date DESC);

-- ============================================================
-- INSIDER_TRADES: Parsed Form 4 filings
-- ============================================================
CREATE TABLE insider_trades (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker_id BIGINT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  signal_id BIGINT REFERENCES signals(id) ON DELETE SET NULL,
  filer_name TEXT NOT NULL,
  filer_role TEXT, -- CEO, CFO, Director, 10% Owner, etc.
  trade_type TEXT NOT NULL, -- P (purchase), S (sale), A (award), etc.
  shares NUMERIC(14,2) NOT NULL,
  price_per_share NUMERIC(12,4),
  total_value NUMERIC(16,2),
  shares_owned_after NUMERIC(14,2),
  filing_date DATE NOT NULL,
  transaction_date DATE,
  accession_number TEXT UNIQUE, -- SEC filing ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_insider_trades_ticker ON insider_trades (ticker_id, filing_date DESC);
CREATE INDEX idx_insider_trades_filer ON insider_trades (filer_name);

-- ============================================================
-- ANALYST_ACTIONS: Upgrades, downgrades, PT changes
-- ============================================================
CREATE TABLE analyst_actions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker_id BIGINT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  signal_id BIGINT REFERENCES signals(id) ON DELETE SET NULL,
  firm TEXT NOT NULL,
  analyst_name TEXT,
  action TEXT NOT NULL, -- upgrade, downgrade, initiate, reiterate
  rating_from TEXT,
  rating_to TEXT,
  pt_from NUMERIC(12,2),
  pt_to NUMERIC(12,2),
  action_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analyst_actions_ticker ON analyst_actions (ticker_id, action_date DESC);

-- ============================================================
-- CALLS: AI-generated BUY/REDUCE/WATCH verdicts
-- ============================================================
CREATE TYPE call_type AS ENUM ('BUY', 'REDUCE', 'WATCH');

CREATE TABLE calls (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker_id BIGINT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  call call_type NOT NULL,
  conviction INTEGER NOT NULL CHECK (conviction BETWEEN 0 AND 100),
  horizon TEXT, -- e.g. "2-4 weeks", "1-3 months"
  entry_price NUMERIC(12,2),
  target_price NUMERIC(12,2),
  stop_price NUMERIC(12,2),
  risk_reward TEXT,
  why TEXT NOT NULL, -- AI-generated one-liner
  signal_ids BIGINT[], -- References to signals that drove this call
  ai_reasoning TEXT, -- Full AI chain-of-thought
  model_used TEXT, -- e.g. "gemini-2.5-flash"
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expired_at TIMESTAMPTZ
);

CREATE INDEX idx_calls_active ON calls (is_active, created_at DESC);
CREATE INDEX idx_calls_ticker ON calls (ticker_id, created_at DESC);

-- ============================================================
-- ECOSYSTEM_EDGES: Company relationship graph
-- ============================================================
CREATE TYPE edge_type AS ENUM (
  'supplier',
  'customer',
  'partner',
  'competitor',
  'subsidiary',
  'investor'
);

CREATE TABLE ecosystem_edges (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_ticker_id BIGINT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  target_ticker_id BIGINT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  relationship edge_type NOT NULL,
  description TEXT,
  confidence NUMERIC(5,2) DEFAULT 0.5,
  source_filing TEXT, -- Where this relationship was discovered
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_ticker_id, target_ticker_id, relationship)
);

CREATE INDEX idx_ecosystem_source ON ecosystem_edges (source_ticker_id);
CREATE INDEX idx_ecosystem_target ON ecosystem_edges (target_ticker_id);

-- ============================================================
-- WEEKLY_PICKS: Top 5 short-term + Top 5 long-term
-- ============================================================
CREATE TABLE weekly_picks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  week_start DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('short_term', 'long_term')),
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 10),
  ticker_id BIGINT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  call_id BIGINT REFERENCES calls(id) ON DELETE SET NULL,
  entry_price NUMERIC(12,2),
  target_price NUMERIC(12,2),
  stop_price NUMERIC(12,2),
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, category, rank)
);

CREATE INDEX idx_weekly_picks_week ON weekly_picks (week_start DESC);

-- ============================================================
-- USER_PROFILES: Auth + preferences
-- ============================================================
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  goal TEXT CHECK (goal IN ('grow_wealth', 'generate_income', 'trade_actively')),
  risk_tolerance TEXT CHECK (risk_tolerance IN ('conservative', 'balanced', 'aggressive')),
  capital_range TEXT,
  whatsapp_number TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- USER_ALERTS: Notification preferences per user
-- ============================================================
CREATE TABLE user_alerts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  min_conviction INTEGER NOT NULL DEFAULT 70 CHECK (min_conviction BETWEEN 50 AND 95),
  track_insider_trades BOOLEAN NOT NULL DEFAULT true,
  track_sec_filings BOOLEAN NOT NULL DEFAULT true,
  track_analyst_changes BOOLEAN NOT NULL DEFAULT true,
  track_earnings BOOLEAN NOT NULL DEFAULT true,
  track_options_flow BOOLEAN NOT NULL DEFAULT true,
  track_news_sentiment BOOLEAN NOT NULL DEFAULT true,
  track_technical BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- ============================================================
-- PORTFOLIO: User holdings
-- ============================================================
CREATE TABLE portfolio (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  ticker_id BIGINT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  shares NUMERIC(14,4) NOT NULL,
  avg_cost NUMERIC(12,4) NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker_id)
);

CREATE INDEX idx_portfolio_user ON portfolio (user_id);

-- ============================================================
-- WATCHLIST: Tickers user is watching
-- ============================================================
CREATE TABLE watchlist (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  ticker_id BIGINT NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker_id)
);

-- ============================================================
-- NEWS_CACHE: Cached news articles per ticker
-- ============================================================
CREATE TABLE IF NOT EXISTS news_cache (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker_id BIGINT REFERENCES tickers(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT NOT NULL UNIQUE,
  sentiment signal_sentiment DEFAULT 'neutral',
  image_url TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_cache_ticker ON news_cache (ticker_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_cache_published ON news_cache (published_at DESC);

-- ============================================================
-- INGESTION_LOG: Track data pipeline runs
-- ============================================================
CREATE TABLE ingestion_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source TEXT NOT NULL, -- 'sec_form4', 'sec_8k', 'finnhub', 'fmp', etc.
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'error'
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users read own alerts" ON user_alerts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own alerts" ON user_alerts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users read own portfolio" ON portfolio
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own portfolio" ON portfolio
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users read own watchlist" ON watchlist
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own watchlist" ON watchlist
  FOR ALL USING (auth.uid() = user_id);

-- Public read access for market data
ALTER TABLE tickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE insider_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyst_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecosystem_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read tickers" ON tickers FOR SELECT USING (true);
CREATE POLICY "Public read prices" ON price_history FOR SELECT USING (true);
CREATE POLICY "Public read signals" ON signals FOR SELECT USING (true);
CREATE POLICY "Public read calls" ON calls FOR SELECT USING (true);
CREATE POLICY "Public read insider_trades" ON insider_trades FOR SELECT USING (true);
CREATE POLICY "Public read analyst_actions" ON analyst_actions FOR SELECT USING (true);
CREATE POLICY "Public read ecosystem" ON ecosystem_edges FOR SELECT USING (true);
CREATE POLICY "Public read weekly_picks" ON weekly_picks FOR SELECT USING (true);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tickers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON portfolio
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED: Initial top tickers
-- ============================================================
INSERT INTO tickers (symbol, company_name, exchange, sector, cik) VALUES
  ('NVDA', 'NVIDIA Corporation', 'NASDAQ', 'Technology', '1045810'),
  ('AAPL', 'Apple Inc.', 'NASDAQ', 'Technology', '320193'),
  ('MSFT', 'Microsoft Corporation', 'NASDAQ', 'Technology', '789019'),
  ('GOOGL', 'Alphabet Inc.', 'NASDAQ', 'Technology', '1652044'),
  ('META', 'Meta Platforms, Inc.', 'NASDAQ', 'Technology', '1326801'),
  ('TSLA', 'Tesla, Inc.', 'NASDAQ', 'Consumer Cyclical', '1318605'),
  ('AMZN', 'Amazon.com, Inc.', 'NASDAQ', 'Consumer Cyclical', '1018724'),
  ('AMD', 'Advanced Micro Devices, Inc.', 'NASDAQ', 'Technology', '2488'),
  ('NFLX', 'Netflix, Inc.', 'NASDAQ', 'Communication Services', '1065280'),
  ('CRM', 'Salesforce, Inc.', 'NYSE', 'Technology', '1108524'),
  ('AVGO', 'Broadcom Inc.', 'NASDAQ', 'Technology', '1649338'),
  ('PLTR', 'Palantir Technologies Inc.', 'NYSE', 'Technology', '1321655'),
  ('SNOW', 'Snowflake Inc.', 'NYSE', 'Technology', '1640147'),
  ('ARM', 'Arm Holdings plc', 'NASDAQ', 'Technology', '1973239'),
  ('SMCI', 'Super Micro Computer, Inc.', 'NASDAQ', 'Technology', '1375365'),
  ('COIN', 'Coinbase Global, Inc.', 'NASDAQ', 'Financial Services', '1679788'),
  ('MSTR', 'MicroStrategy Incorporated', 'NASDAQ', 'Technology', '1050446'),
  ('UBER', 'Uber Technologies, Inc.', 'NYSE', 'Technology', '1543151'),
  ('SQ', 'Block, Inc.', 'NYSE', 'Financial Services', '1512673'),
  ('SHOP', 'Shopify Inc.', 'NYSE', 'Technology', '1594805')
ON CONFLICT (symbol) DO NOTHING;
