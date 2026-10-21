# How the project fits together

This page is the map of the repo: what each folder does, how data gets from the Google Sheet to the website, and where the planned features plug in. For step-by-step recipes (add an area, a translation, a page), see [adding-features.md](adding-features.md).

## Folder map

```
data/                    CSV copies of the sheet tabs + areas.csv (repo-managed) + ward boundaries
tools/
  export_data.py         command: CSV -> web/data/*.json (and optional Supabase copy)
  kml_to_geojson.py      command: prabhag outlines -> web/data/wards.geojson
  ward_lookup.py         command: which prabhag is this lat/lng in?
  pipeline/              the code behind export_data.py
    io.py                  read CSVs, write JSON
    parse.py               dates, numbers, lists ("4 / 15", "AU-01, AU-02")
    report.py              collects errors and warnings
    build.py               one build_* function per data set + export()
    supabase.py            one-way copy into Supabase
  tests/                 python3 -m unittest discover -s tools/tests
web/                     the website (GitHub Pages publishes this folder as it is)
  index.html, projects.html, privacy.html, disclaimer.html
  assets/css/            tokens.css (colours) · base.css · components.css · map.css · main.css (imports all)
  assets/vendor/         Leaflet 1.9.4
  i18n/                  en.json (all UI text) · mr.json (Marathi, being translated)
  js/core/               shared by every page: config, data loading, formatting, translation
  js/features/           one file per feature (map, panel, areas, responsibility, complaint, projects)
  js/pages/              one small entry file per HTML page that wires features together
  data/                  GENERATED json – never edit by hand
  photos/                field photos (no faces)
tests/js/                node --test tests/js/*.test.mjs, plus check-i18n.mjs
supabase/                migrations/ (run in order), functions/submit-report/, setup steps and status
.github/workflows/       checks.yml (every PR) · pages.yml (deploy) · sync-supabase.yml
```

## Data flow

```
Google Sheet ──download CSV──► data/*.csv ─┐
data/areas.csv (in the repo) ──────────────┤
                                           ▼
                              tools/export_data.py  ──checks fail?──► stops, nothing published
                                           │
                     ┌─────────────────────┴───────────────────┐
                     ▼                                         ▼
     web/data/*.json (hotspots, areas, authorities,     Supabase tables
     routing, projects, sources, meta)                   (copy for Phase 4)
                     │
data/boundaries/*.kml ── tools/kml_to_geojson.py ──► web/data/wards.geojson
                     │
                     ▼
     js/core/data.js loadData() ──► js/pages/*.js ──► js/features/*.js ──► the page
```

The website never talks to the sheet or (until Phase 4) to Supabase. It only reads the JSON files next to it, so it works on GitHub Pages with no server.

## The website in layers

| Layer | Folder | Rule |
|---|---|---|
| Settings | `js/core/config.js` | Feature switches, languages, Supabase public key. The only file to edit to turn something on. |
| Core | `js/core/` | No HTML of any one page. `data.js` loads JSON, `format.js` has `esc()` and `niceDate()`, `i18n.js` has `t()`. |
| Features | `js/features/` | One feature per file. Gets the element and the data passed in; does not look up page elements by itself. Logic that doesn't touch the page (e.g. `responsibility.js`, `complaint.js`) is kept separate so it can be tested with Node. |
| Pages | `js/pages/` | One per HTML page. Loads data, finds the elements, calls features. Short. |
| Text | `i18n/*.json` | Every word the visitor sees. HTML pages are written in English and carry `data-i18n` keys for the parts that change language. |
| Styles | `assets/css/` | Colours only in `tokens.css`. New components go in `components.css`; map-only rules in `map.css`. |

## Where the planned features plug in

| Feature | Switch in `config.js` | Logic (done, tested) | Where it shows | Still needed |
|---|---|---|---|---|
| Several areas on one site | `areaFilter: true` (on) | `pipeline/build.py` (`area_for`, `build_comparison_sites`), `features/areas.js` | buttons above the map | done: 3 areas live (Alandi since 16 Oct 2026); an Alandi ward map would add outlines |
| Responsibility panel (Week 6) | `responsibilityPanel: true` (on) | `features/responsibility.js` (`responsibleFor`, `checkStatus`), `features/contacts.js` (`channelsIn`, `routeChannels`) | "What to do about it" box in the side panel (`features/respond-panel.js`) | done 16 Oct 2026; the routing rules are still drafts until the team agrees them (Progress P2-05), and contacts move from "checked against sources" to "confirmed" as the team calls them |
| Complaint helper (Week 7) | `complaintHelper` | `features/complaint.js` → `fillTemplate`, `openPlaceholders`, `whatsappLink`, `xLink` | marked spot in `features/hotspot-panel.js` | PMC CARE number confirmed by a test message (Progress P3-01; desk check done 16 Oct 2026); the form |
| Marathi | add `"mr"` to `languages` | `core/i18n.js`, `i18n/mr.json` | header language switch; `?lang=mr` to test early | the translations; `name_mr` in `areas.csv` |
| Photo reports (Phase 4, [plan](phase-4.md)) | `photoReports`, `supabase.url`/`anonKey` | `features/report-rules.js` (place, stamp, photo and note checks, shared with the server); `supabase/migrations/002`–`003` (reports table, review rules, photo folders, rate limits); `supabase/functions/submit-report` (deployed 21 Oct 2026) | new pages `report.html` and `review.html` | Milestones 2–5: upload page, review page, map layer, pilot |

## Checks that protect the live site

- `tools/export_data.py` refuses to write anything if a rule in [data-model.md](data-model.md) fails.
- `.github/workflows/checks.yml` runs on every pull request: Python pipeline tests, the data check, the report-zones check, `node --check` on every script, the JS unit tests (including "the function's copies match the website's"), and the translation key check.
- `tools/report_zones.py --check` also runs before every website deploy, so the site never accepts reports in places the server's copy of the zones would refuse.
- `pages.yml` runs the tests and the export again before it deploys, so a broken `main` is not published.
