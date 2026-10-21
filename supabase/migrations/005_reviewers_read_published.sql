-- Migration 005 (22 Oct 2026): reviewers may read the published-photos folder. Safe to run again.
-- How to run: see supabase/README.md (SQL Editor -> paste -> Run).
--
-- Approving a report uploads the cleaned photo with "upsert" (so approving again replaces it),
-- and Supabase Storage needs SELECT as well as INSERT and UPDATE for that; removing files needs
-- SELECT too. Migration 002 gave reviewers insert / update / delete on report-public but no select,
-- so the first live approval failed with "new row violates row-level security policy" (22 Oct).
-- Anyone can already open a published photo by its public link; this only lets reviewers use the
-- storage API on that folder.

drop policy if exists "reviewers read published photos" on storage.objects;
create policy "reviewers read published photos" on storage.objects
  for select to authenticated using (bucket_id = 'report-public' and (select private.is_reviewer()));
