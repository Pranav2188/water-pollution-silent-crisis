# web/

The website. Plain HTML, CSS and JavaScript with [Leaflet](https://leafletjs.com/) 1.9.4 and OpenStreetMap tiles. No build step, no framework, no logins. GitHub Pages publishes this folder on every push to `main` (`.github/workflows/pages.yml`).

## Run it on your laptop

```bash
python3 tools/export_data.py      # from the repo root: rebuild web/data/*.json from data/*.csv
python3 tools/kml_to_geojson.py   # only when the ward boundaries change
cd web && python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` directly from the folder will not work, because browsers block loading the JSON files that way.)

## Files

How the parts fit together, and where the planned features plug in: [docs/architecture.md](../docs/architecture.md). Recipes: [docs/adding-features.md](../docs/adding-features.md).

| File | What it is | Who / when |
|---|---|---|
| `index.html`, `js/pages/map.js` | Hotspot map page: area buttons, map, side panel | Week 4 skeleton (done) |
| `projects.html`, `js/pages/projects.js` | Project list with every dated promise; becomes the Mundhwa/Kharadi tracker | Sanskar, Week 7 |
| `privacy.html`, `disclaimer.html` | Live from day one; drafts for Prof. Thombare to review | Vaishnavi reviews |
| `js/core/config.js` | Feature switches, languages, Supabase public key. **Turn features on here.** | shared |
| `js/core/data.js` | Loads `data/*.json` and adds lookups (`authorityById`, `areaById`, …) | shared |
| `js/core/format.js` | `esc()` for safe HTML, `niceDate()`, `sourceLink()` | shared |
| `js/core/i18n.js` | `t("key")` for every visible word; language from `?lang=` or the header switch | shared |
| `js/features/map-view.js` | Leaflet map, prabhag outlines, markers, legend, `showArea()` | done |
| `js/features/areas.js` | Area buttons above the map (from `data/areas.csv`) | done |
| `js/features/hotspot-panel.js` | The side panel. The responsibility panel and complaint helper go at the marked spots | Sanskar, Weeks 6–7 |
| `js/features/responsibility.js` | `responsibleFor(hotspot, data)`: first contact, escalation, local and general offices (tested) | ready for Week 6 |
| `js/features/complaint.js` | Fills the Routing Rules template; WhatsApp and X links (tested) | ready for Week 7 (needs the PMC CARE number verified) |
| `js/features/project-list.js` | Project cards with dated promises | Sanskar, Week 7 |
| `i18n/en.json`, `i18n/mr.json` | All website text. `mr.json` is empty until translated; empty values show in English | Vaishnavi translates |
| `assets/css/` | `tokens.css` (all colours, light and dark) · `base.css` · `components.css` · `map.css`; pages load `main.css` | shared |
| `assets/vendor/leaflet-1.9.4/` | Leaflet, copied from the npm package (BSD 2-Clause, licence included) so the site loads no outside scripts | – |
| `data/` | **Generated.** Never edit by hand; see `docs/data-model.md` | `tools/export_data.py` |
| `photos/` | Field photos, no faces (see `photos/README.md`) | Siddhesh, Vaishnavi |

## Tests

```bash
node --test tests/js/*.test.mjs     # from the repo root (Node 22)
node tests/js/check-i18n.mjs        # every language file has the same keys as en.json
```

## Rules for website code

- Always pass sheet text through `esc()` before putting it into HTML.
- Visible words come from `i18n/*.json` through `t()`, not typed into the JavaScript.
- A new feature starts switched off in `js/core/config.js`, so it can be merged before it is finished.
- Show "to verify" / "to confirm" tags wherever the data says so; never hide them.
- Projects are "announced", never "complete", until the data says they are confirmed.
- No cookies, no analytics, no location permission, no outside scripts or fonts. If that ever changes, update `privacy.html` in the same pull request.
- Every page keeps the header notice and the footer links to Privacy and Disclaimer.
