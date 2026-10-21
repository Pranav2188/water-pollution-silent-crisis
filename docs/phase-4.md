# Phase 4: photo reports from residents

Residents send a photo of a pollution spot from their phone. The team reviews it, and approved reports appear on the map as **resident reports**. This page is the plan: what is decided, how it works, what each part is built with, and the order of work.

Status (21 Oct 2026): **Milestone 1 (foundation) built.** Migrations 002 and 003 are run, `submit-report` is deployed (version 2, 11 report zones) and passed 20 local tests; its two puzzle secrets are added by Pranav in the dashboard ([supabase/README.md](../supabase/README.md#the-submit-report-function)). The feature is switched off on the live site (`photoReports: false` in `web/js/core/config.js`) until the pilot.

Status (22 Oct 2026): **Milestone 2 (upload page) built.** `report.html` works end to end against a local copy of `submit-report` (results under "Tests" below). It is not linked from the menu and opens only with `?pilot` in the address (`report.html?pilot`), so the team can test it on their phones before the pilot.

Status (22 Oct 2026): **Milestone 3 (review page) built.** `review.html` works end to end against a stand-in for Supabase (results under "Tests"). Before it works live: migration 004 is run, sign-ups are switched off and reviewer accounts are made ([supabase/README.md](../supabase/README.md#reviewers-phase-4-reviewhtml)).

## Decisions

| Question | Decision (21 Oct 2026) |
|---|---|
| Who can upload | Anyone, without signing in. No names, phone numbers or emails are collected |
| What approval does | The report shows automatically on a separate **Resident reports** map layer, labelled "not verified by the team". The team may later **promote** it to an official `HS-xx` hotspot, but only after a team visit |
| Where reports are accepted | The three live areas only (Kharadi–Mundhwa, central Pune, Alandi). Built so that "anywhere along Pune's rivers" later is a data change, not new code |
| How admins approve | A review page on the site (`review.html`), with email login for reviewers only (Option 2) |
| Where the location comes from | The printed GPS stamp first, then the photo's hidden GPS, then "Use my location", always ending with a pin the resident confirms |
| When | Milestone 1 started 21 Oct 2026; the rest is scheduled by the team |
| Reading the printed stamp (22 Oct) | **Automatic when the photo looks stamped** (a quick check needing no download); a "Read the location printed on my photo" button stays as a backup. The text is read only from a cleaned-up strip of the bottom of the photo; **the photo sent is always the whole scene, stamp included** |
| Blurring faces (22 Oct, changed the same night) | **Both on the phone and on the review page.** Phone: faces found automatically and blurred; **residents do not draw or switch off boxes** (the reviewer handles anything missed). A phone blur is permanent, so a face found by mistake stays blurred: none was found by mistake in the 41-photo test at the setting used. Review page: automatic face finding again, plus **Blur** and **Clear blur** by hand |
| The private original (22 Oct) | **Deleted as soon as a reviewer approves or rejects.** An approved report keeps only the cleaned copy in `report-public`; nothing with unblurred faces stays stored. "Needs a team visit" keeps the original until the team decides. (Migration 004) |
| Number plates (22 Oct) | Found **automatically on the review page** (a plate detector is too large for residents' phones). Plates and other vehicle lettering (a painted registration on a dumper, "HYUNDAI" on an excavator) are **suggestions**: the reviewer must decide each one (Blur / Not private) before Approve works |
| Reviewer sign-in (22 Oct) | Email and password, accounts made by Pranav in the Supabase dashboard; public sign-ups off. No emails are sent (Supabase's built-in email only reaches Supabase team members) |
| GPS camera (22 Oct) | The page recommends the free **GPS Map Camera** app. Later the team may build its own camera app |

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
| Is there a stamp? | Phone | A pixel check on a 1280 px copy: white letters next to a dark box in the bottom 30% (`stampScore` in `features/report-form.js`) | No download. Tested 22 Oct on 41 field photos in Chromium: all 28 stamped photos scored 2.36 or more (limit 2.0); 11 of 13 unstamped scored under 1.3, the other 2 were bright white water from a pipe (they only cost a wasted download) |
| Location from the printed stamp | Phone | **Tesseract.js 7.0.0** (Apache-2.0) with the "fast" English model, in the browser | The bottom strip is cleaned to black letters on white, then read up to three times (three brightness limits). **A location or date counts only when two readings agree exactly**: in testing, one single reading turned 73.84 into 79.84. Tested 22 Oct: 27 of 28 locations and 27 of 28 dates right, **none wrong**, nothing read from unstamped photos; the one left unread falls back to the pin. About 1 s per photo on a laptop. Only the GPS Map Camera layout ("Lat … Long …", day/month/year) is understood |
| Location from hidden photo data | Phone | **exifr** (MIT) | Usually missing: Android 10+ and iPhone (unless the user allows it) remove GPS on web uploads, and WhatsApp removes it always |
| Location from the phone | Phone | Browser location, only when the resident taps "Use my location" | Changes the privacy page: the site asks for location on the report page only |
| Final location | Phone | A draggable pin on the Leaflet map | What gets saved is the confirmed pin |
| Report zones | Phone + server | Point-in-polygon on `web/data/report-zones.geojson` (`tools/report_zones.py`) | **Interim** zones: the prabhag outlines of the Pune areas and a box around Alandi. To be replaced by **river corridors** (150 m either side of the river, from OpenStreetMap) |
| Face blur, pass 1 | Phone | **MediaPipe Face Detection** full-range model (`@mediapipe/face_detection@0.4.1646425229`, Apache-2.0), confidence 0.7, whole photo + 3 × 3 overlapping tiles; mosaic blur | `@mediapipe/tasks-vision` was not used: it is twice the size and its face model has to be downloaded from a Google site this workspace cannot reach. Tested 22 Oct: found all 6 faces in a close group photo and the clear faces in our riverbank photos (a man on the bank, two workers at the cleanup); no bottle caps or rubble taken for faces at 0.7; **missed most people further back** and 45 of 57 faces in a class photo. So the resident's own boxes and the reviewer stay essential. No number-plate detection |
| Resize and strip hidden data | Phone | The browser's canvas | Redrawing drops all hidden data and fixes rotation; 1600 px photo and 400 px thumbnail, WebP (JPEG fallback). Tested 22 Oct: uploaded files had no EXIF or XMP (a test photo's phone make, model and GPS were gone), 250–320 KB per photo, 22–38 KB per thumbnail |
| Spam check | Phone + server | **ALTCHA** (MIT): widget `altcha@3.2.4`, server `altcha-lib@2.5.0` | A small proof-of-work puzzle, no cookies. Tested 21 Oct: tampered answers, challenges and reused answers on other challenges are rejected; **the same answer can be replayed**, so the server records every used challenge |
| Upload gate | Server | Supabase Edge Function `submit-report` (Deno, `@supabase/supabase-js@2.117.2`) | The only way in. Uses the secret key from Supabase's own environment; nothing to paste |
| Storage | Server | Supabase Storage: `report-photos` (private), `report-public` (public) | Free plan: 1 GB storage, 5 GB downloads a month, 50 MB per file. Image resizing is a Pro feature, so thumbnails are made on the phone |
| Face blur, pass 2 | Review page | The same face finder on the original, plus boxes the reviewer draws (tap a box to clear or restore its blur) and a check by eye | Approve saves the cleaned copy to `report-public` and deletes the original |
| Number plates | Review page | **YOLOv9 tiny plate detector** (`yolo-v9-t-640-license-plates-end2end` from open-image-models, MIT; 7.8 MB) run with **ONNX Runtime Web 1.30.0** (MIT), whole photo + 3 × 3 tiles, confidence 0.35 | Compared 22 Oct with EgoBlur (Apache-2.0, but about 400 MB per model and an email sign-up: kept for the monthly audit), Ultralytics YOLOv8 plate models (AGPL-3.0: avoided) and cloud plate services (would send residents' photos to a third party: avoided). Tests below. The plate models were trained with YOLOv9, whose original training code is GPL-3.0; the model files are published under the project's MIT licence |
| Reviewer sign-in and data | Review page | `@supabase/supabase-js@2.117.2` (MIT) with the publishable key; the database rules decide what a signed-in reviewer may do | Two reviewers cannot decide the same report twice: a decision only applies while the report is still waiting |
| Monthly audit | Team laptop | EgoBlur (faces and number plates) or deface (faces) over all published photos | Confirm their licences when set up |

Library versions are pinned to releases at least two weeks old, and kept in `web/assets/vendor/` (no outside scripts; versions, sources and licences in its README), loaded only on the report and review pages.

**What a resident downloads** the first time (the browser keeps it afterwards), measured on the live site 22 Oct (GitHub Pages compresses most files): about 0.2 MB for the page, spam puzzle and photo-GPS reader; about 2.5 MB for face finding, started as soon as the page opens; about 3.4 MB for stamp reading, only when the photo looks stamped. A reviewer's browser downloads about 10 MB more once for plate finding. First test on a phone (Pranav, 22 Oct): the first face check took about a minute on a slow connection, then a few seconds once the files were kept.

### Tests (22 Oct 2026, Chromium on a Pixel 7 and an iPhone 13 profile, against the local `submit-report` and a stand-in for Supabase)

- Three stamped photos (Alandi, central Pune, Kharadi) sent: stamp read, pin in the right area, `location_source` "stamp", date from the stamp, references RPT-00001 to 00003; the fourth in the same hour refused with the rate-limit message.
- A photo with hidden GPS, no stamp and rotation data: pin from the photo, "photo" as the source, date from the photo, upright; a phone number in the note flagged `note_has_contact` for the reviewer.
- "Use my location", drawing and switching off a blur box, a pin outside the areas (blocked with a message), sending with nothing filled in (lists what is missing).
- Two workers' faces blurred automatically in the uploaded photo; a drawn box blurred too.

### Tests of the plate detector (22 Oct 2026)

- 14 photos of Indian cars (MH, KA, TN, HR, AP plates; front and rear; a red temporary plate; from the MIT-licensed INPR project on GitHub): all three sizes of the model found every plate, with confidence 0.76 to 0.93.
- Distance: each car shrunk and placed into our riverbank photos so its plate is N px wide in a 1600 px photo; whole photo + 3 × 3 tiles at confidence 0.35:

  | Plate width (px) | 120 | 80 | 60 | 45 | 34 | 26 | 20 | 15 |
  |---|---|---|---|---|---|---|---|---|
  | Found | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | 13/14 | 8/14 | 2/14 |

  Roughly, 34 px is a car plate about 17 m from a phone camera and 26 px about 22 m; plates smaller than about 30 px cannot be read anyway. Searching the whole photo only found plates 60 px and wider.
- 39 river photos without plates: 5 got a box. One was a real catch (the registration painted on the dumper in the 10 Oct cleanup photo, missed without tiles); the others were the "Google" logo in the stamp's mini-map and "HYUNDAI" on an excavator arm.
- In Chromium with ONNX Runtime Web: the same boxes and scores as the Python test (within 1 px); about 0.5 to 1 s per photo, 5 to 9 s with tiles.

### Tests of the review page (22 Oct 2026, Chromium, against a stand-in for Supabase that applies the rules of migrations 002 to 004)

- Wrong password refused; a signed-in account that is not a reviewer sees nothing; the reviewer sees 2 waiting and 1 "needs a visit".
- A report with a car in a river scene: 1 plate suggestion; Approve blocked until it was decided; after Blur and a box drawn by hand, Approve published a 1600 px photo and thumbnail named after the reference, saved the edited note, set `reviewed_by`, and deleted the original; the published plate is unreadable.
- The cleanup photo: 3 faces blurred, the dumper lettering suggested; Reject refused without a reason, then deleted the original and published nothing.
- "Needs a team visit" kept the original. An approved report whose original had not been deleted (an interrupted decision) was tidied up when the page opened.

### First live review (22 Oct 2026)

- Pranav's reviewer account signed in; "Needs a team visit" on RPT-00002 recorded his account and time and kept the original.
- **Approve failed** with "new row violates row-level security policy": Supabase Storage needs a read rule as well as add and replace rules to upload with "upsert", and migration 002 gave reviewers no read rule on `report-public`. The stand-in used for testing did not enforce that rule. Nothing was changed by the failed attempt. Fixed by migration 005.

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

- Stored: the photo after the phone's face blurring and redrawing, the confirmed location, the date taken, the problem type and the note. Never: name, phone, email, the original file from the phone, phone make and model.
- Until review, that photo can still show faces the phone missed or number plates; it is private (reviewers only) and is **deleted when the report is approved or rejected**. Only the reviewer's cleaned copy is ever public.
- The connection address is only used scrambled (keyed hash, changes daily) for rate limits and deleted after 2 days.
- Retention: decided reports keep no original (above). Still to agree: what happens to reports nobody reviews (60 days proposed) and to "needs a team visit" reports after the visit.
- Every published photo gets a "report this photo" link that sends it back to the review queue.
- Before launch, the privacy page and `web/README.md` change: the report page asks for location when the resident taps "Use my location".

## Milestones

| # | Milestone | Contents | Owner |
|---|---|---|---|
| 1 | Foundation | This plan; migrations folder; reports database, folders and rules; interim report zones; shared report rules with tests; `submit-report` function deployed and tested | Pranav |
| 2 | Upload page (**built 22 Oct**, opens with `?pilot`) | `report.html`: photo, stamp reading, location, pin, area check, blur, redraw, spam puzzle, send; Marathi strings (keys added; translation by Vaishnavi) | Sanskar (+ Pranav) |
| 3 | Review page (**built 22 Oct**) | `review.html`: email + password sign-in, queue, faces and plates found automatically, blur / clear blur, approve / reject / needs a visit, original deleted at decision; migration 004; reviewer guidelines | Sanskar + Pranav; guidelines Shweta |
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
5. Reviewer guidelines (Shweta): what to approve, what "needs a visit" means, which rejection reason to use.
6. Vehicle lettering: suggestions for now; blur by default later if reviewers keep blurring it anyway.
