-- Supabase tables for Water Pollution A Silent Crisis.
--
-- These tables are a COPY of the Google Sheet, filled by
--   python3 tools/export_data.py --supabase
-- (run by .github/workflows/sync-supabase.yml). The sheet always wins:
-- never edit these tables by hand.
--
-- Phase 3 website reads web/data/*.json, not Supabase. The tables exist so
-- Phase 4 (photo reports with a review queue) has somewhere to grow.
--
-- Security: Row Level Security is ON for every table. The only policy is
-- "anyone may read". Nobody can insert, update or delete with the public
-- (anon) key. Only the service key can write, and it is kept as a GitHub
-- secret, never in website code.
--
-- How to run: Supabase dashboard -> SQL Editor -> paste this file -> Run.

create table if not exists sources (
  id          text primary key,           -- SRC-01
  title       text not null,
  publisher   text,
  date        text,                       -- free text: "2026-01", "March 2026 (monthly report)"
  url         text
);

create table if not exists authorities (
  id            text primary key,         -- AU-01
  role          text not null,
  office        text not null,
  area          text,
  contact       text,                     -- office contacts only, never personal numbers
  handle        text,
  source_url    text,
  verified      boolean not null default false,
  last_verified date,
  verified_by   text,
  prabhag       int,
  ward_office   text,
  assembly      text,
  lok_sabha     text,
  scope         text check (scope in ('local', 'general'))
);

create table if not exists routing_rules (
  problem_type    text primary key,       -- "Sewage outfall or nalla"
  what_you_see    text,
  first_contact   text,
  how_to_reach    text,
  also_inform     text,
  escalate        jsonb not null default '[]',
  what_to_include text,
  why_this_office text,
  source_ids      jsonb not null default '[]',
  status          text,
  confirmed       text,
  template        text
);

create table if not exists projects (
  id                text primary key,     -- PRJ-01
  name              text not null,
  capacity_mld      numeric,
  capacity_text     text,
  type              text,
  scheme            text,
  original_deadline text,
  current_target    text,
  label             text,                 -- "Announced (not confirmed)" etc.
  status_text       text,
  status_date       text,
  source_ids        jsonb not null default '[]',
  confirmed_by      text,
  confirmed_date    date
);

create table if not exists project_dates (
  id          text primary key,           -- PRJ-01-01
  project_id  text not null references projects(id) on delete cascade,
  reported_on text not null,
  promised    text,
  text        text,
  source_id   text references sources(id),
  kind        text,
  notes       text
);

create table if not exists hotspots (
  id            text primary key,         -- HS-01
  name          text not null,
  lat           double precision not null check (lat between 18.3 and 18.8),
  lng           double precision not null check (lng between 73.6 and 74.1),
  type          text not null check (type in ('outfall', 'nalla', 'dumping', 'weir')),
  problem_type  text references routing_rules(problem_type),
  date_seen     date,
  photo_url     text,
  description   text,
  source        text not null,
  last_verified date,
  prabhags      jsonb not null default '[]',
  ward_offices  jsonb not null default '[]',
  assembly      jsonb not null default '[]',
  lok_sabha     jsonb not null default '[]',
  to_confirm    jsonb not null default '[]',
  authority_ids jsonb not null default '[]',
  project_ids   jsonb not null default '[]',
  project_link  text
);

-- Row Level Security: public read-only.
do $$
declare t text;
begin
  foreach t in array array['sources', 'authorities', 'routing_rules', 'projects', 'project_dates', 'hotspots'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "public read" on %I', t);
    execute format('create policy "public read" on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
