# Phase 4: photo reports from residents

Residents send a photo of a pollution spot from their phone. The team reviews it, and approved reports appear on the map as **resident reports**. This page is the plan: what is decided, how it works, what each part is built with, and the order of work.

Status (21 Oct 2026): **Milestone 1 (foundation) built.** Migrations 002 and 003 are run, `submit-report` is deployed (version 2, 11 report zones) and passed 20 local tests; its two puzzle secrets are added by Pranav in the dashboard ([supabase/README.md](../supabase/README.md#the-submit-report-function)). The feature is switched off on the live site (`photoReports: false` in `web/js/core/config.js`) until the pilot.

## Decisions

| Question | Decision (21 Oct 2026) |
|---|---|
| Who can upload | Anyone, without signing in. No names, phone numbers or emails are collected |
| What approval does | The report shows automatically on a separate **Resident reports** map layer, labelled "not verified by the team". The team may later **promote** it to an official `HS-xx` hotspot, but only after a team visit |
| Where reports are accepted | The three live areas only (Kharadi–Mundhwa, central Pune, Alandi). Built so that "anywhere along Pune's rivers" later is a data change, not new code |
| How admins approve | A review page on the site (`review.html`), with email login for reviewers only (Option 2) |
| Where the location comes from | The printed GPS stamp first, then the photo's hidden GPS, then "Use my location", always ending with a pin the resident confirms |
| When | Milestone 1 started 21 Oct 2026; the rest is scheduled by the team |

## How a report travels

```
Resident's phone (report.html)                      Supabase                         Team (review.html)
─────────────────────────────                       ────────                         ──────────────────
1 pick photo
2 find location: stamp ▸ photo GPS ▸ device ▸ pin
3 inside a report zone?  (same check runs again on the server)
4 blur faces (pass 1), resident can blur more
5 redraw: removes hidden data, 1600 px + 400 px
6 spam puzzle (ALTCHA) solves in the background
7 send ───────────────────────────────►  submit-report function
                                          · puzzle valid and not reused
                                          · rate limit per connection
                                          · zone, problem type, sizes, no hidden data
                                          · photo ▸ private folder, row ▸ "waiting"
                                                                     ◄──────────────  8 reviewer logs in (email link)
                                                                                     9 checks photo and note,
                                                                                       blurs anything missed (pass 2)
                                          public folder ◄──────────────────────────  10 Approve / Reject / Needs a visit
11 map shows approved reports  ◄────────  approved rows only (database rules)
```

Nothing a resident sends is public until a person approves it. Waiting and rejected photos stay in a private folder.

## Technology

| Step | Where | Built with | Notes |
|---|---|---|---|
| Location from the printed stamp | Phone | **Tesseract.js** (Apache-2.0), text recognition in the browser | Tested 21 Oct on six Alandi photos: 5 of 6 read exactly; tuning (find the dark stamp box first) to fix the rest. Reads "Lat … Long …" and the day/month/year date |
| Location from hidden photo data | Phone | **exifr** (MIT) | Usually missing: Android 10+ and iPhone (unless the user allows it) remove GPS on web uploads, and WhatsApp removes it always |
| Location from the phone | Phone | Browser location, only when the resident taps "Use my location" | Changes the privacy page: the site asks for location on the report page only |
| Final location | Phone | A draggable pin on the Leaflet map | What gets saved is the confirmed pin |
| Report zones | Phone + server | Point-in-polygon on `web/data/report-zones.geojson` (`tools/report_zones.py`) | **Interim** zones: the prabhag outlines of the Pune areas and a box around Alandi. To be replaced by **river corridors** (150 m either side of the river, from OpenStreetMap) |
| Face blur, pass 1 | Phone | **MediaPipe Face Detector** (`@mediapipe/tasks-vision`, Apache-2.0) | The standard web model is short-range (selfie distance) and misses small distant faces; test the full-range model (P4-06). No number-plate detection |
| Resize and strip hidden data | Phone | The browser's canvas | Redrawing drops all hidden data and fixes rotation; 1600 px photo and 400 px thumbnail, WebP (JPEG fallback) |
| Spam check | Phone + server | **ALTCHA** (MIT): widget `altcha@3.2.4`, server `altcha-lib@2.5.0` | A small proof-of-work puzzle, no cookies. Tested 21 Oct: tampered answers, challenges and reused answers on other challenges are rejected; **the same answer can be replayed**, so the server records every used challenge |
| Upload gate | Server | Supabase Edge Function `submit-report` (Deno, `@supabase/supabase-js@2.117.2`) | The only way in. Uses the secret key from Supabase's own environment; nothing to paste |
| Storage | Server | Supabase Storage: `report-photos` (private), `report-public` (public) | Free plan: 1 GB storage, 5 GB downloads a month, 50 MB per file. Image resizing is a Pro feature, so thumbnails are made on the phone |
| Face blur, pass 2 | Review page | Blur brush in the browser + a check by eye | Approve saves the cleaned copy to `report-public` |
| Monthly audit | Team laptop | EgoBlur (faces and number plates) or deface (faces) over all published photos | Confirm their licences when set up |

Library versions are pinned to releases at least two weeks old, and kept in `web/assets/vendor/` (no outside scripts), loaded only on the report and review pages.

## Data

Migration `supabase/migrations/002_resident_reports.sql`:

| Table / folder | What it holds | Who can read | Who can change |
|---|---|---|---|
| `reports` | One row per report: `ref` (RPT-00001), status, area, problem type, lat/lng, where the location came from, flags for the reviewer, date taken, note, photo paths, review fields, promoted hotspot | The public: **approved rows only, and only the safe columns**. Reviewers: everything | Only the `submit-report` function inserts. Reviewers update status and review fields |
| `reviewers` | Which logged-in accounts may review | The reviewer themself | Added by Pranav in the Supabase dashboard |
| `report_attempts` | Scrambled connection fingerprint + time, for rate limits; deleted after 2 days | Nobody | The function only |
| `used_challenges` | Spent ALTCHA puzzles, to stop replays; deleted after they expire | Nobody | The function only |
| `report-photos` folder | Waiting photos and thumbnails | Reviewers | The function adds; reviewers delete |
| `report-public` folder | Approved, cleaned photos | Everyone | Reviewers |

Statuses: `waiting` → `approved` / `rejected` / `needs_visit` → (`promoted` once a team visit adds an `HS-xx` hotspot to the sheet).

Flags the function adds for the reviewer: `pin_far_from_stamp`, `pin_far_from_photo_gps`, `pin_far_from_device` (more than 200 m apart), `pin_only` (no location evidence), `old_photo` (taken more than 90 days ago), `note_has_contact` (the note seems to contain a phone number or email).

## Limits

| Limit | Value |
|---|---|
| Photo / thumbnail | at most 2.5 MB / 300 KB, JPEG or WebP, long side at most 2000 / 500 px, no hidden data |
| Note | at most 500 characters |
| Per connection | 3 reports an hour, 10 a day |
| Whole site | 150 reports a day (protects the 1 GB storage) |
| Spam puzzle | valid 10 minutes, usable once |

## Privacy

- Stored: the photo after blurring and redrawing, the confirmed location, the date taken, the problem type and the note. Never: name, phone, email, the original file, phone make and model.
- The connection address is only used scrambled (keyed hash, changes daily) for rate limits and deleted after 2 days.
- Retention (to agree): rejected photos deleted after 30 days, unreviewed after 60 days.
- Every published photo gets a "report this photo" link that sends it back to the review queue.
- Before launch, the privacy page and `web/README.md` change: the report page asks for location when the resident taps "Use my location".

## Milestones

| # | Milestone | Contents | Owner |
|---|---|---|---|
| 1 | Foundation | This plan; migrations folder; reports database, folders and rules; interim report zones; shared report rules with tests; `submit-report` function deployed and tested | Pranav |
| 2 | Upload page | `report.html`: photo, stamp reading, location, pin, area check, blur, redraw, spam puzzle, send; Marathi strings | Sanskar (+ Pranav) |
| 3 | Review page | `review.html`: email login, queue, blur brush, approve / reject / needs a visit; reviewer guidelines | Sanskar + Pranav; guidelines Shweta |
| 4 | Map and privacy | Resident reports layer; privacy and disclaimer updates; "report this photo"; promote-to-hotspot routine; retention clean-up | Sanskar, Vaishnavi, Shweta |
| 5 | Test and pilot | Team photos through the whole chain; blur test on riverbank photos (P4-06); pilot with Jeevitnadi / Keshav Nagar association; then switch on | Siddhesh, Vaishnavi |

Later: river corridors (needs the river lines exported once from OpenStreetMap, see below), expansion to all of Pune's rivers, daily email to reviewers when reports are waiting.

### Exporting river lines (for river corridors)

This workspace cannot reach OpenStreetMap, so a team member exports once:

1. Open https://overpass-turbo.eu
2. Paste and run:
   ```
   [out:json][timeout:60];
   (
     way["waterway"="river"]["name"~"Mula|Mutha|Indrayani|Pawana",i](18.40,73.70,18.75,74.05);
   );
   out geom;
   ```
3. **Export → GeoJSON → download**, and save it as `data/boundaries/rivers-osm.geojson`.
4. Keep the credit "© OpenStreetMap contributors" (the data is under the ODbL licence).

## Open questions

1. Who reviews after the course ends (without a reviewer, reports wait forever).
2. Retention periods (30 / 60 days proposed).
3. Daily email to reviewers when reports are waiting.
4. Width of the river corridors (150 m proposed).
