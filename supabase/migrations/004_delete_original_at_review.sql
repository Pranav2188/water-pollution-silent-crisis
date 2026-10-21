-- Migration 004 (22 Oct 2026): the private original is deleted when a reviewer decides
-- (Phase 4, Milestone 3, docs/phase-4.md). Safe to run again.
-- How to run: see supabase/README.md (SQL Editor -> paste -> Run).
--
-- When a reviewer approves or rejects a report, the review page deletes the photo the resident
-- sent from the private report-photos folder (an approved report keeps only the cleaned copy in
-- report-public) and then clears photo_path / thumb_path. So:
--   * photo_path and thumb_path may be empty, but only once the report is decided;
--   * reviewers may empty them, and nothing else: they can never point a report at another file.
-- "Needs a visit" keeps the original until the team decides.

alter table public.reports alter column photo_path drop not null;
alter table public.reports alter column thumb_path drop not null;

alter table public.reports drop constraint if exists original_kept_until_decided;
alter table public.reports add constraint original_kept_until_decided
  check ((photo_path is not null and thumb_path is not null) or status in ('approved', 'rejected', 'promoted'));

grant update (photo_path, thumb_path) on public.reports to authenticated;

-- Same as migration 002, plus the rule that reviewers may only clear the photo paths.
create or replace function public.reports_before_write() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.ref := 'RPT-' || lpad(new.id::text, 5, '0');
    return new;
  end if;
  if (select auth.uid()) is not null then
    if (new.photo_path is distinct from old.photo_path and new.photo_path is not null)
       or (new.thumb_path is distinct from old.thumb_path and new.thumb_path is not null) then
      raise exception 'reviewers can only clear photo_path and thumb_path';
    end if;
    if new.status is distinct from old.status then
      new.reviewed_by := (select auth.uid());
      new.reviewed_at := now();
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.reports_before_write() from public, anon, authenticated;
