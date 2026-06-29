-- Daily AI (Gemini) call budget counter.
--
-- Belt-and-suspenders cost guard for the on-demand AI routes (chat, portfolio
-- advice, penny, ipo, fresh daily picks). The authoritative hard cost cap is
-- the Generative Language API daily quota set in Google Cloud Console; this
-- table just lets the app stop calling Gemini once a daily request ceiling is
-- reached, so a runaway/abuse loop can't run up the bill.

create table if not exists public.ai_usage (
  usage_date date primary key,
  call_count integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Atomically increment the counter for the given day and return the new total.
-- Using INSERT ... ON CONFLICT keeps it race-safe under concurrent calls.
create or replace function public.increment_ai_usage(p_date date)
returns integer
language plpgsql
security definer
as $$
declare
  new_count integer;
begin
  insert into public.ai_usage (usage_date, call_count, updated_at)
  values (p_date, 1, now())
  on conflict (usage_date)
  do update set
    call_count = public.ai_usage.call_count + 1,
    updated_at = now()
  returning call_count into new_count;
  return new_count;
end;
$$;

-- Counter is only ever touched by the service role (server-side). Enable RLS
-- with no policies so anon/auth clients cannot read or write it.
alter table public.ai_usage enable row level security;
