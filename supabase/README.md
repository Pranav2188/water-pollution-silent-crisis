# Supabase (set up now, used from Phase 4)

The Phase 3 website does **not** need Supabase. It reads `web/data/*.json`. Supabase is set up alongside it so the photo-report feature in Phase 4 has a database ready, and so the team learns it early.

```
Google Sheet ─► data/*.csv ─► tools/export_data.py ─┬─► web/data/*.json  (website, Phase 3)
                                                    └─► Supabase tables   (copy, for Phase 4)
```

The sheet always wins. The tables are overwritten from the sheet on every sync, and rows deleted from the sheet are deleted from Supabase too.

## Status

Set up and syncing since 16 Oct 2026.

| | |
|---|---|
| Organization | Pranav2188 (free plan) |
| Project | `water-pollution-silent-crisis` |
| Region | South Asia (Mumbai), `ap-south-1` |
| Project URL | `https://enungxucvdqqeyzpyyxl.supabase.co` (not a secret; also stored as the `SUPABASE_URL` GitHub secret) |
| Schema | `schema.sql` run on 16 Oct 2026: 7 tables, Row Level Security on, one "public read" rule each |
| GitHub secrets | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (added 16 Oct 2026) |
| First sync | 16 Oct 2026: 50 sources, 3 areas, 31 authorities, 9 problem types, 6 projects, 15 project dates, 14 hotspots (9 in AREA-01, 5 in AREA-02) |
| Checked | Every hotspot value matched `web/data/hotspots.json`; a test write with the public key was refused; Supabase security advisor: no issues |

## Keys

Supabase has two kinds of key. Only one of them may ever leave Supabase and GitHub.

| Key | Looks like | Where it may go |
|---|---|---|
| **Secret key** (or the legacy `service_role` key) | `sb_secret_…` (legacy: a long `eyJ…` text) | **Only** the `SUPABASE_SERVICE_KEY` GitHub secret. Never in website code, a CSV, the sheet, a chat message or a commit. If it leaks, rotate it in Supabase straight away (Project Settings → API Keys). |
| **Publishable key** (or the legacy `anon` key) | `sb_publishable_…` | The website, from Phase 4 (`supabase` in `web/js/core/config.js`). With the rules in `schema.sql` it can only read. |

The sync script (`tools/pipeline/supabase.py`) works with either the new secret key or the legacy `service_role` key.

## Setting it up again (new project or new account)

1. Sign in at supabase.com with the team account and create a project:
   - Name: `water-pollution-silent-crisis`
   - Region: **South Asia (Mumbai)**
   - Plan: Free. Save the database password in the team's password manager, not in the sheet or the repo.
2. Open **SQL Editor → New query**, paste the whole of [`schema.sql`](schema.sql) and click **Run**.
   - Supabase warns about a "destructive operation" (the `drop policy if exists` line) and "tables without Row Level Security" (it can't see that the last block of the file turns it on). Click **Run and enable RLS**.
   - You should see "Success. No rows returned".
3. On GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_URL` = the Project URL (shown under the **Connect** button at the top of the dashboard)
   - `SUPABASE_SERVICE_KEY` = the secret key (Project Settings → API Keys → Secret keys)
4. On GitHub: **Actions → Sync Supabase → Run workflow** (branch `main`). The tables fill within a minute.
5. Check: in Supabase, **Table Editor** should show the row counts listed in "Status" above (or the current numbers from `python3 tools/export_data.py`).

## When `schema.sql` changes

Paste the new file into the SQL Editor and run it the same way. It is safe to run again: existing tables and data are kept, new tables and columns are added, and the read rules are recreated. Run it **before** the change reaches `main`, or the next sync fails because a column is missing.

## Rules

- Never edit the tables by hand. Change the sheet (or `data/areas.csv`) and let the sync copy it.
- Free projects pause after 7 days without activity. The daily sync (06:00 IST) keeps the project active. If it does pause, restore it from the dashboard; nothing is lost.
- Free plan limits (checked September 2026): 2 projects, 500 MB database, 1 GB file storage. The registers use well under 1 MB.

## Running a sync by hand

```bash
export SUPABASE_URL=https://enungxucvdqqeyzpyyxl.supabase.co
export SUPABASE_SERVICE_KEY=...        # paste, don't save in a file
python3 tools/export_data.py --supabase
```
