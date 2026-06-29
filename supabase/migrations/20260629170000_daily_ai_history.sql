-- Daily AI history: a durable snapshot of each day's AI outputs (picks, penny
-- high-yield, IPO analysis) so results are never lost and can be reviewed /
-- back-tested later. One row per (kind, day); same-day regenerations upsert.

create table if not exists public.daily_ai_history (
  id bigint generated always as identity primary key,
  kind text not null,                 -- 'picks' | 'penny' | 'ipo'
  snapshot_date date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (kind, snapshot_date)
);

create index if not exists idx_ai_history_date
  on public.daily_ai_history (snapshot_date desc);

-- Written by the service role and read via a server route, so lock it down:
-- enable RLS with no policies (service role bypasses; anon/auth get nothing).
alter table public.daily_ai_history enable row level security;
