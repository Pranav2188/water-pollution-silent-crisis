-- Migration 003 (21 Oct 2026): move is_reviewer() out of the public web API.
-- Supabase's security advisor warned that public.is_reviewer(), a security definer helper, could
-- be called at /rest/v1/rpc/is_reviewer. It only says whether the caller is a reviewer, but a
-- privileged helper should not be a public endpoint. The web API only exposes the "public"
-- schema, so the helper moves to "private", and only logged-in users may run it (every rule that
-- uses it applies to logged-in users only). Safe to run again.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_reviewer() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.reviewers r where r.user_id = (select auth.uid()))
$$;
revoke all on function private.is_reviewer() from public, anon;
grant execute on function private.is_reviewer() to authenticated, service_role;

-- The same rules as migration 002, now using private.is_reviewer().
drop policy if exists "reviewers read all reports" on public.reports;
create policy "reviewers read all reports" on public.reports
  for select to authenticated using ((select private.is_reviewer()));
drop policy if exists "reviewers update reports" on public.reports;
create policy "reviewers update reports" on public.reports
  for update to authenticated using ((select private.is_reviewer())) with check ((select private.is_reviewer()));

drop policy if exists "reviewers read waiting photos" on storage.objects;
create policy "reviewers read waiting photos" on storage.objects
  for select to authenticated using (bucket_id = 'report-photos' and (select private.is_reviewer()));
drop policy if exists "reviewers remove waiting photos" on storage.objects;
create policy "reviewers remove waiting photos" on storage.objects
  for delete to authenticated using (bucket_id = 'report-photos' and (select private.is_reviewer()));
drop policy if exists "reviewers publish photos" on storage.objects;
create policy "reviewers publish photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'report-public' and (select private.is_reviewer()));
drop policy if exists "reviewers replace published photos" on storage.objects;
create policy "reviewers replace published photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'report-public' and (select private.is_reviewer()))
  with check (bucket_id = 'report-public' and (select private.is_reviewer()));
drop policy if exists "reviewers remove published photos" on storage.objects;
create policy "reviewers remove published photos" on storage.objects
  for delete to authenticated using (bucket_id = 'report-public' and (select private.is_reviewer()));

-- Nothing uses the public copy any more.
drop function if exists public.is_reviewer();
