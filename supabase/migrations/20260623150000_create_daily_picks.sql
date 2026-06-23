CREATE TABLE IF NOT EXISTS daily_picks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_date DATE NOT NULL,
  picks JSONB NOT NULL DEFAULT '[]'::jsonb,
  stocks_scanned INT DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(generated_date)
);

ALTER TABLE daily_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read picks" ON daily_picks
  FOR SELECT USING (true);

CREATE POLICY "Service role can insert/update" ON daily_picks
  FOR ALL USING (true) WITH CHECK (true);
