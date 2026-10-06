-- Call log: a permanent, append-only record of every AI call so the app can
-- measure its own prediction accuracy. One row per (run, symbol, timeframe).
-- Rows are never edited — outcomes are computed from market data at read time.

create table if not exists public.call_log (
  id bigint generated always as identity primary key,
  run_id text not null,               -- normalized ISO timestamp of the generation run
  generated_at timestamptz not null,
  symbol text not null,
  timeframe text not null,            -- 'short-term' | 'long-term'
  action text not null,               -- 'BUY' | 'SELL'
  conviction int not null,
  ref_price numeric,                  -- live price when the call was made
  entry_price numeric,
  target_price numeric,
  stop_price numeric,
  signals jsonb,                      -- ⚡/⏰ flags attached to the call
  source text not null default 'live',-- 'live' | 'backfill' (imported from history)
  created_at timestamptz not null default now(),
  unique (run_id, symbol, timeframe)
);

create index if not exists idx_call_log_generated
  on public.call_log (generated_at desc);

-- Append-only: block edits so the track record can't be rewritten after the fact.
create or replace function public.call_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'call_log is append-only';
end;
$$;

drop trigger if exists call_log_no_update on public.call_log;
create trigger call_log_no_update
  before update on public.call_log
  for each row execute function public.call_log_immutable();

-- Written by the service role and read via server routes only.
alter table public.call_log enable row level security;
