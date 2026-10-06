-- Job run log: one row per scheduled (cron) or manual (admin) job run, so the
-- app can show when each piece of data was last refreshed and whether the
-- automatic runs are healthy.

create table if not exists public.job_runs (
  id bigint generated always as identity primary key,
  job text not null,                    -- 'picks' | 'radar' | 'ingest' | ...
  trigger text not null,                -- 'cron' | 'admin'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  status int,                           -- HTTP status from the job route
  summary text,                         -- human-readable one-liner
  result jsonb                          -- small machine-readable bits (e.g. nextOffset)
);

create index if not exists idx_job_runs_job_started
  on public.job_runs (job, started_at desc);

-- Written by the service role and read via server routes only.
alter table public.job_runs enable row level security;
