-- Migration 006 (24 Oct 2026): "Report this photo" (Phase 4, Milestone 4, docs/phase-4.md).
-- Safe to run again. How to run: see supabase/README.md (SQL Editor -> paste -> Run).
--
-- Anyone looking at a published resident photo can say it still shows a face, a number plate or
-- other private details. The flag-report Edge Function then, at once:
--   1. moves the published copy from report-public back into the private report-photos folder,
--   2. puts the report back in the review queue (status "waiting") with the reason and time,
--   3. removes the public copy, so it disappears from the map straight away.
-- A reviewer then decides it again on review.html, exactly like a new report.
-- No new status is needed: a flagged report is a waiting report with flagged_at set.

alter table public.reports add column if not exists flag_reason text
  check (flag_reason in ('face', 'plate', 'personal', 'not_pollution', 'other'));
alter table public.reports add column if not exists flagged_at timestamptz;
-- The public does not see these two columns (migration 002 grants the public only the map
-- columns). Reviewers see every column.

-- One row per flag, for limits only. Like report_attempts: the connection address is never
-- stored, only a keyed hash that changes daily, and rows go after 2 days.
create table if not exists public.report_flags (
  ip_hash    text not null,
  ref        text not null,
  created_at timestamptz not null default now()
);
create index if not exists report_flags_hash_time on public.report_flags (ip_hash, created_at);
alter table public.report_flags enable row level security;
revoke all on public.report_flags from anon, authenticated;
grant all on public.report_flags to service_role;

-- One call from the function before it changes anything. Limits: the same photo once per
-- connection a day, 5 photos per connection a day, 50 flags a day for the whole site.
-- Returns 'ok' or the reason for refusing.
create or replace function public.claim_flag_slot(p_ip_hash text, p_ref text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  n_mine int;
  n_site int;
begin
  delete from public.report_flags where created_at < now() - interval '2 days';

  if exists (select 1 from public.report_flags
              where ip_hash = p_ip_hash and ref = p_ref and created_at > now() - interval '1 day') then
    return 'already_flagged';
  end if;
  select count(*) into n_mine from public.report_flags
   where ip_hash = p_ip_hash and created_at > now() - interval '1 day';
  if n_mine >= 5 then return 'rate_day'; end if;
  select count(*) into n_site from public.report_flags where created_at > now() - interval '1 day';
  if n_site >= 50 then return 'rate_site'; end if;

  insert into public.report_flags (ip_hash, ref) values (p_ip_hash, p_ref);
  return 'ok';
end
$$;
revoke all on function public.claim_flag_slot(text, text) from public, anon, authenticated;
grant execute on function public.claim_flag_slot(text, text) to service_role;
