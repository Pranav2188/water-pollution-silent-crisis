-- Migration 002 (21 Oct 2026): resident photo reports, Phase 4. Plan: docs/phase-4.md.
-- Safe to run again. How to run: see supabase/README.md.
--
-- Who can do what:
--   * Nobody can add a report with the public key. Reports come in only through the
--     submit-report Edge Function, which checks the spam puzzle, rate limits, zone, problem
--     type and photo, and writes with Supabase's secret key (inside Supabase, never in code).
--   * The public can read APPROVED reports only, and only the columns granted below.
--   * Logged-in reviewers (listed in public.reviewers) can read every report, see the
--     private photos, publish cleaned photos and change a report's status.

-- ---------------------------------------------------------------- reviewers

create table if not exists public.reviewers (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  added_at     timestamptz not null default now()
);

-- true when the logged-in account is a reviewer. security definer so that policies can
-- check the reviewers table without exposing it.
create or replace function public.is_reviewer() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.reviewers r where r.user_id = (select auth.uid()))
$$;
revoke all on function public.is_reviewer() from public;
grant execute on function public.is_reviewer() to anon, authenticated, service_role;

-- ---------------------------------------------------------------- reports

create table if not exists public.reports (
  id               bigint generated always as identity primary key,
  ref              text unique,                          -- RPT-00001, set by the trigger below
  created_at       timestamptz not null default now(),
  status           text not null default 'waiting'
                   check (status in ('waiting', 'approved', 'rejected', 'needs_visit', 'promoted')),
  area_id          text not null,                        -- AREA-01 ... (checked by the function)
  problem_type     text not null,                        -- a Routing Rules problem type
  lat              double precision not null check (lat between 18.3 and 18.8),
  lng              double precision not null check (lng between 73.6 and 74.1),
  location_source  text not null check (location_source in ('stamp', 'photo', 'device', 'pin')),
  location_flags   jsonb not null default '[]',          -- warnings for the reviewer
  taken_at         timestamptz,                          -- from the stamp or the photo, if known
  note             text check (char_length(note) <= 500),
  photo_path       text not null,                        -- in the private report-photos folder
  thumb_path       text not null,
  public_photo_url text,                                 -- set when a reviewer publishes it
  public_thumb_url text,
  reviewed_at      timestamptz,
  reviewed_by      uuid references auth.users(id) on delete set null,
  reject_reason    text,
  hotspot_id       text,                                 -- HS-xx once promoted after a team visit
  constraint approved_needs_public_photo
    check (status not in ('approved', 'promoted') or (public_photo_url is not null and public_thumb_url is not null))
);
create index if not exists reports_status_created on public.reports (status, created_at desc);

-- RPT-00001 from the id; and who reviewed it and when, whenever a reviewer changes the status.
create or replace function public.reports_before_write() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.ref := 'RPT-' || lpad(new.id::text, 5, '0');
  elsif new.status is distinct from old.status and (select auth.uid()) is not null then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;
  return new;
end
$$;
revoke all on function public.reports_before_write() from public, anon, authenticated;
drop trigger if exists reports_before_write on public.reports;
create trigger reports_before_write before insert or update on public.reports
  for each row execute function public.reports_before_write();

alter table public.reports enable row level security;
drop policy if exists "public reads approved reports" on public.reports;
create policy "public reads approved reports" on public.reports
  for select to anon, authenticated using (status = 'approved');
drop policy if exists "reviewers read all reports" on public.reports;
create policy "reviewers read all reports" on public.reports
  for select to authenticated using ((select public.is_reviewer()));
drop policy if exists "reviewers update reports" on public.reports;
create policy "reviewers update reports" on public.reports
  for update to authenticated using ((select public.is_reviewer())) with check ((select public.is_reviewer()));

-- Column rights. The public sees only what the map needs; reviewers may change only the
-- review fields (and correct the pin, problem type or note). Nobody but the function inserts.
revoke all on public.reports from anon, authenticated;
grant select (ref, created_at, area_id, problem_type, lat, lng, taken_at, note,
              public_photo_url, public_thumb_url) on public.reports to anon;
grant select on public.reports to authenticated;
grant update (status, reject_reason, hotspot_id, public_photo_url, public_thumb_url,
              lat, lng, area_id, problem_type, note, location_flags) on public.reports to authenticated;
grant all on public.reports to service_role;

-- ---------------------------------------------------------------- abuse protection
-- Only the function uses these. RLS is on with no policies, so the public keys cannot see them.

create table if not exists public.report_attempts (
  ip_hash    text not null,                              -- keyed hash, changes daily; never the address
  created_at timestamptz not null default now()
);
create index if not exists report_attempts_hash_time on public.report_attempts (ip_hash, created_at);

create table if not exists public.used_challenges (
  signature  text primary key,                           -- a spent ALTCHA puzzle
  expires_at timestamptz not null
);

alter table public.report_attempts enable row level security;
alter table public.used_challenges enable row level security;
alter table public.reviewers enable row level security;
revoke all on public.report_attempts, public.used_challenges from anon, authenticated;
revoke all on public.reviewers from anon;
revoke insert, update, delete on public.reviewers from authenticated;
grant all on public.report_attempts, public.used_challenges, public.reviewers to service_role;

drop policy if exists "reviewers see themselves" on public.reviewers;
create policy "reviewers see themselves" on public.reviewers
  for select to authenticated using (user_id = (select auth.uid()));

-- One call from the function, before it stores anything: refuses a reused puzzle, applies the
-- rate limits (3 an hour and 10 a day per connection, 150 a day for the whole site), records
-- the attempt and clears old records. Returns 'ok' or the reason for refusing.
create or replace function public.claim_report_slot(p_ip_hash text, p_signature text, p_expires timestamptz)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  n_hour int;
  n_day  int;
  n_site int;
begin
  delete from public.report_attempts where created_at < now() - interval '2 days';
  delete from public.used_challenges where expires_at < now();

  insert into public.used_challenges (signature, expires_at) values (p_signature, p_expires)
    on conflict (signature) do nothing;
  if not found then
    return 'replayed';
  end if;

  select count(*) filter (where created_at > now() - interval '1 hour'), count(*)
    into n_hour, n_day
    from public.report_attempts
   where ip_hash = p_ip_hash and created_at > now() - interval '1 day';
  if n_hour >= 3 then return 'rate_hour'; end if;
  if n_day >= 10 then return 'rate_day'; end if;

  select count(*) into n_site from public.reports where created_at > now() - interval '1 day';
  if n_site >= 150 then return 'rate_site'; end if;

  insert into public.report_attempts (ip_hash) values (p_ip_hash);
  return 'ok';
end
$$;
revoke all on function public.claim_report_slot(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_report_slot(text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------- photo folders

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('report-photos', 'report-photos', false, 2621440, array['image/jpeg', 'image/webp']),
  ('report-public', 'report-public', true,  2621440, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Waiting photos: reviewers may look at them and remove them. The function adds them.
drop policy if exists "reviewers read waiting photos" on storage.objects;
create policy "reviewers read waiting photos" on storage.objects
  for select to authenticated using (bucket_id = 'report-photos' and (select public.is_reviewer()));
drop policy if exists "reviewers remove waiting photos" on storage.objects;
create policy "reviewers remove waiting photos" on storage.objects
  for delete to authenticated using (bucket_id = 'report-photos' and (select public.is_reviewer()));

-- Published photos: everyone can open them by their public link; only reviewers add,
-- replace or remove them.
drop policy if exists "reviewers publish photos" on storage.objects;
create policy "reviewers publish photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'report-public' and (select public.is_reviewer()));
drop policy if exists "reviewers replace published photos" on storage.objects;
create policy "reviewers replace published photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'report-public' and (select public.is_reviewer()))
  with check (bucket_id = 'report-public' and (select public.is_reviewer()));
drop policy if exists "reviewers remove published photos" on storage.objects;
create policy "reviewers remove published photos" on storage.objects
  for delete to authenticated using (bucket_id = 'report-public' and (select public.is_reviewer()));
