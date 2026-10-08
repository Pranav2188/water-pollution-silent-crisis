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

| File | What it is | Who / when |
|---|---|---|
| `index.html`, `js/map.js` | Hotspot map with prabhag outlines; clicking a hotspot fills the side panel | Week 4 skeleton (done) |
| side panel in `js/map.js` | "Who is responsible here?" panel | Sanskar, Week 6 |
| side panel in `js/map.js` | Complaint helper: fills the Routing Rules template and opens WhatsApp or X | Sanskar, Week 7 (needs the PMC CARE number verified first) |
| `projects.html`, `js/projects.js` | Project list with every dated promise; becomes the Mundhwa/Kharadi tracker | Sanskar, Week 7 |
| `privacy.html`, `disclaimer.html` | Live from day one; drafts for Prof. Thombare to review | Vaishnavi reviews |
| `js/data.js` | Loads `data/*.json`, plus `esc()` for safe HTML and `niceDate()` | shared |
| `css/style.css` | All colours are tokens at the top (light and dark) | shared |
| `data/` | **Generated.** Never edit by hand; see `docs/data-model.md` | `tools/export_data.py` |
| `vendor/leaflet-1.9.4/` | Leaflet, copied from the npm package (BSD 2-Clause, licence included) so the site loads no outside scripts | – |

## Rules for website code

- Always pass sheet text through `esc()` before putting it into HTML.
- Show "to verify" / "to confirm" tags wherever the data says so; never hide them.
- Projects are "announced", never "complete", until the data says they are confirmed.
- No cookies, no analytics, no location permission, no outside scripts or fonts. If that ever changes, update `privacy.html` in the same pull request.
- Every page keeps the header notice and the footer links to Privacy and Disclaimer.
