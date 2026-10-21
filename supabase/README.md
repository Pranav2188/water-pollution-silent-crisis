# Supabase

The Phase 3 website does **not** need Supabase. It reads `web/data/*.json`. Supabase holds a copy of the registers (synced from the sheet) and, from Phase 4, the photo reports residents send ([docs/phase-4.md](../docs/phase-4.md)).

```
Google Sheet ─► data/*.csv ─► tools/export_data.py ─┬─► web/data/*.json  (website)
                                                    └─► Supabase tables   (copy)

Resident's phone ─► submit-report function ─► reports table + report-photos folder ─► review page (Phase 4)
```

The sheet always wins for the registers. Those tables are overwritten from the sheet on every sync, and rows deleted from the sheet are deleted from Supabase too. The Phase 4 tables (`reports`, `reviewers`, ...) are **not** touched by the sync.

## What is in this folder

| Path | What it is |
|---|---|
| `migrations/001_registers.sql` | The 7 register tables and their "public read" rules (was `schema.sql`) |
| `migrations/002_resident_reports.sql` | Phase 4: `reports`, `reviewers`, `report_attempts`, `used_challenges`, the `claim_report_slot` rate-limit function, the `report-photos` and `report-public` folders and their rules |
| `migrations/003_private_reviewer_check.sql` | Moves the "is this person a reviewer?" check into a schema the public API cannot reach |
| `migrations/004_delete_original_at_review.sql` | Lets the review page delete the resident's original when a report is approved or rejected: the photo paths may then be empty, and reviewers may only empty them |
| `migrations/005_reviewers_read_published.sql` | Lets reviewers read the published-photos folder, which Supabase Storage needs for replacing ("upsert") and removing files there; without it the first live approval failed |
| `functions/submit-report/` | The only way a report gets in: checks the spam puzzle, the place, the photo and the limits, then stores it as `waiting`. `report-rules.js` and `report-zones.json` are **copies** made from the website's files (see below) |

## Status

| | |
|---|---|
| Organization | Pranav2188 (free plan) |
| Project | `water-pollution-silent-crisis` |
| Region | South Asia (Mumbai), `ap-south-1` |
| Project URL | `https://enungxucvdqqeyzpyyxl.supabase.co` (not a secret; also stored as the `SUPABASE_URL` GitHub secret) |
| Migrations run | 001 on 16 Oct 2026 (plus the Alandi columns the same day); 002 and 003 on 21 Oct 2026; 004 on 22 Oct 2026; 005 not yet |
| GitHub secrets | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (added 16 Oct 2026) |
| Registers | 50 sources, 3 areas, 43 authorities (31 `AU` + 12 `CA`), 9 problem types, 6 projects, 15 project dates, 18 spots (14 `HS` + 4 `CS`) |
| `submit-report` | Version 2 deployed 21 Oct 2026, 11 report zones. Function secrets: see "The submit-report function" |
| Checked | Registers matched `web/data/*.json`; public key cannot write; 002 dress rehearsal 19/19; after 003: the public sees no waiting reports, a reviewer sees and updates them, a non-reviewer sees none; security advisor: only a note that `report_attempts` and `used_challenges` have no rules (on purpose: nobody but the function may touch them) |

## Keys

Supabase has two kinds of key. Only one of them may ever leave Supabase and GitHub.

| Key | Looks like | Where it may go |
|---|---|---|
| **Secret key** (or the legacy `service_role` key) | `sb_secret_…` (legacy: a long `eyJ…` text) | **Only** the `SUPABASE_SERVICE_KEY` GitHub secret. Supabase gives it to the function by itself. Never in website code, a CSV, the sheet, a chat message or a commit. If it leaks, rotate it in Supabase straight away (Project Settings → API Keys). |
| **Publishable key** (or the legacy `anon` key) | `sb_publishable_…` | The website (`supabase` in `web/js/core/config.js`). With the rules in the migrations it can read the registers and approved reports, and nothing else. |

The sync script (`tools/pipeline/supabase.py`) works with either the new secret key or the legacy `service_role` key.

## Running a migration

Each file in `migrations/` is run once, in number order, in the SQL Editor. Every file is safe to run again.

1. Supabase dashboard → **SQL Editor → New query**.
2. Paste the **whole** file and click **Run**.
3. Supabase may warn about a "destructive operation" (the `drop policy if exists` / `drop function if exists` lines, which only replace rules) or "tables without Row Level Security" (it can't see that a later line turns it on). Click **Run and enable RLS**.
4. You should see "Success. No rows returned". Add the date to "Migrations run" above.

A change to the database is a **new** file (`004_...sql`), never an edit to one that has been run. Run it **before** the change reaches `main`, or the next sync or report fails.

## The submit-report function

Deployed with "Verify JWT" **off**: residents don't sign in, so the spam puzzle, the rate limits and the checks in the function are what protect it.

**Secrets** (Supabase dashboard → Edge Functions → Secrets). Supabase provides `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` by itself. Add two more, each a different random string of 40+ characters from a password manager:

| Name | Used for |
|---|---|
| `ALTCHA_HMAC_SECRET` | Signing the spam puzzles, and scrambling connection addresses for the rate limits |
| `ALTCHA_KEY_SECRET` | Signing the puzzle keys |

Don't write the values down anywhere else. If one leaks, replace it in the dashboard; the only effect is that puzzles handed out in the last 10 minutes stop working.

**Is it working?** Open in a browser:

- `https://enungxucvdqqeyzpyyxl.supabase.co/functions/v1/submit-report?about` shows the zones the deployed function carries. `zones_sha256` must equal the fingerprint of the repo's file:
  ```bash
  node -e 'const fs=require("fs"),c=require("crypto");console.log(c.createHash("sha256").update(JSON.stringify(JSON.parse(fs.readFileSync("web/data/report-zones.geojson","utf8")))).digest("hex"))'
  ```
  On 21 Oct 2026: 11 zones, `25b99acab3ff48448897b57d70556cc6cbd88ea2d36fe5bbc9ba4d7fd02a1121`.
- `https://enungxucvdqqeyzpyyxl.supabase.co/functions/v1/submit-report` shows a new puzzle. `{"error":"not_configured"}` means a secret is missing.

**Changing it.** The function keeps copies of two website files, because a Supabase function can only use files from its own folder:

```bash
cp web/js/features/report-rules.js supabase/functions/submit-report/   # after changing the rules
python3 tools/report_zones.py                                          # after an area, prabhag or spot changes
node --test tests/js/*.test.mjs                                        # fails if a copy is out of date
```

Then redeploy all three files (`index.ts`, `report-rules.js`, `report-zones.json`) in the dashboard (Edge Functions → submit-report → Code) or with `supabase functions deploy submit-report --no-verify-jwt`, and check that `?about` shows the new fingerprint. The checks on GitHub stop a merge, and the website deploy, if the zones in the repo are out of date, but they cannot see what is deployed: that is what `?about` is for.

## Reviewers (Phase 4, `review.html`)

Reviewers sign in with **email and password**. No emails are sent: Supabase's built-in email service only delivers to members of the Supabase team and only a few an hour, so invitation and magic-link emails would not reach most reviewers.

**Once, before the first reviewer:** Dashboard → **Authentication → Sign In / Providers** → turn **off** "Allow new users to sign up". Accounts are then made only by Pranav. (Even if someone made an account, the database rules give it nothing unless it is in `public.reviewers`.)

**Adding a reviewer:**

1. Dashboard → **Authentication → Users → Add user → Create new user**: the team member's email and a long password (from a password manager), with **Auto Confirm User** ticked.
2. Give them the password in person or by phone, never in the sheet, a chat group or the repo.
3. SQL Editor:
   ```sql
   insert into public.reviewers (user_id, display_name)
   select id, 'Shweta' from auth.users where email = 'their.email@example.com';
   ```
4. They open `https://pranav2188.github.io/water-pollution-silent-crisis/review.html` (not linked from the menu) and sign in.

**Changing a password:** Authentication → Users → the user → **Reset password** sends an email, which only works for Supabase team members; otherwise delete the user and add them again with a new password (then repeat step 3).

**Removing a reviewer:** delete their user in Authentication; the reviewer row goes with it.

## Setting it up again (new project or new account)

1. Sign in at supabase.com with the team account and create a project:
   - Name: `water-pollution-silent-crisis`
   - Region: **South Asia (Mumbai)**
   - Plan: Free. Save the database password in the team's password manager, not in the sheet or the repo.
2. Run every file in `migrations/` in number order (see "Running a migration").
3. On GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_URL` = the Project URL (shown under the **Connect** button at the top of the dashboard)
   - `SUPABASE_SERVICE_KEY` = the secret key (Project Settings → API Keys → Secret keys)
4. On GitHub: **Actions → Sync Supabase → Run workflow** (branch `main`). The tables fill within a minute.
5. Deploy `functions/submit-report` with Verify JWT off and add its two secrets (see above). Update `supabase` in `web/js/core/config.js` with the new URL and publishable key.
6. Check: **Table Editor** should show the row counts listed in "Status" above (or the current numbers from `python3 tools/export_data.py`), and `?about` should show the right fingerprint.

## Rules

- Never edit the register tables by hand. Change the sheet (or `data/areas.csv`) and let the sync copy it.
- Never change a report's photo or status from the Table Editor; use the review page (Phase 4), so `reviewed_by` and `reviewed_at` are filled in.
- Free projects pause after 7 days without activity. The daily sync (06:00 IST) keeps the project active. If it does pause, restore it from the dashboard; nothing is lost.
- Free plan limits (checked September 2026): 2 projects, 500 MB database, 1 GB file storage. The registers use well under 1 MB; 1 GB holds about 2,300 reports (photo + thumbnail), which is why the whole site takes at most 150 a day.

## Running a sync by hand

```bash
export SUPABASE_URL=https://enungxucvdqqeyzpyyxl.supabase.co
export SUPABASE_SERVICE_KEY=...        # paste, don't save in a file
python3 tools/export_data.py --supabase
```
