# Supabase (set up now, used from Phase 4)

The Phase 3 website does **not** need Supabase. It reads `web/data/*.json`. Supabase is set up alongside it so the photo-report feature in Phase 4 has a database ready, and so the team learns it early.

```
Google Sheet ─► data/*.csv ─► tools/export_data.py ─┬─► web/data/*.json  (website, Phase 3)
                                                    └─► Supabase tables   (copy, for Phase 4)
```

The sheet always wins. The tables are overwritten from the sheet on every sync, and rows deleted from the sheet are deleted from Supabase too.

## One-time setup (Pranav)

1. Sign in at supabase.com with the team account and create a project:
   - Name: `water-pollution-silent-crisis`
   - Region: **South Asia (Mumbai)**
   - Plan: Free. Save the database password in the team's password manager, not in the sheet or the repo.
2. Open **SQL Editor**, paste [`schema.sql`](schema.sql), and run it.
3. Open **Project Settings → API** and copy:
   - the **Project URL**
   - the **service_role** key (secret)
4. On GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_SERVICE_KEY` = the service_role key
5. On GitHub: **Actions → Sync Supabase → Run workflow**. The tables should fill within a minute.

## Rules

- The **service_role key** never goes into website code, a CSV, the sheet, a chat message or a commit. It lives only in GitHub secrets. If it leaks, rotate it in Supabase straight away.
- The website may later use the **anon (public) key**. With the policies in `schema.sql` it can only read.
- Free projects pause after 7 days without activity. The daily sync workflow keeps the project active. If it does pause, restore it from the dashboard; nothing is lost.
- Free plan limits (checked September 2026): 2 projects, 500 MB database, 1 GB file storage. The registers use well under 1 MB.

## Running a sync by hand

```bash
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_KEY=...        # paste, don't save in a file
python3 tools/export_data.py --supabase
```
