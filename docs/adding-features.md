# Adding things

Short recipes for the changes the project expects. Each one ends with the same check:

```bash
python3 -m unittest discover -s tools/tests     # pipeline tests
python3 tools/export_data.py                    # rebuild web/data/*.json
node --test tests/js/*.test.mjs                 # website logic tests
node tests/js/check-i18n.mjs                    # translation keys
cd web && python3 -m http.server 8000           # look at it: http://localhost:8000
```

Open a pull request; `checks.yml` runs the same checks on GitHub.

## A new area (river stretch)

Two ways, depending on where the stretch is:

- **Inside PMC** (another Mula-Mutha stretch): add a row to `data/areas.csv` with its **Prabhags**, add the hotspots to the Hotspots tab as usual, and use `AU-01 / AU-06 / AU-07` as its **General Authorities**.
- **Outside PMC** (another town, like Alandi, AREA-03): add the spots to the **Comparison Sites** tab with the new area's ID in the **Area** column, and its offices to **Comparison Authorities** (`CA-xx`). In `data/areas.csv` leave Prabhags empty and list the town's main offices as **General Authorities** (Alandi uses `CA-01 / CA-03 / CA-04`).

Then:

1. Download the changed tabs as CSVs into `data/`.
2. Set the area's **Status** to `Live`.
3. If the area is outside the PMC ward file, the map shows the hotspots without prabhag outlines. That is fine; add a boundary file to `data/boundaries/` later if one exists.
4. If its hotspots are outside latitude 18.3–18.8 / longitude 73.6–74.1, widen `LAT_RANGE` / `LNG_RANGE` in `tools/pipeline/build.py`, and add a new migration in `supabase/migrations/` that widens the matching `check` on `hotspots` and on `reports`.
5. Run `python3 tools/report_zones.py` so residents can send photo reports there, then redeploy the `submit-report` function and check its `?about` fingerprint ([supabase/README.md](../supabase/README.md#the-submit-report-function)).

A prabhag can belong to only one area; the script stops if it is listed twice.

## A translation (Marathi)

1. Fill the empty values in `web/i18n/mr.json`. Keep the keys and the `{placeholders}` exactly as they are. Keys ending in `.html` may contain links; copy the `<a ...>` tags from `en.json` unchanged.
2. Test any time with `?lang=mr` at the end of the address. Empty values show in English.
3. Fill the **Name (Marathi)** column in `data/areas.csv`.
4. When it is complete and checked by a Marathi reader, add `"mr"` to `languages` in `web/js/core/config.js`. The language switch appears in the header.

Sheet text (hotspot descriptions, authority names) stays in English for now. Translating it would need Marathi columns in the sheet and is a separate decision.

**A new language** works the same way: copy `en.json` to `xx.json`, clear the values, add `lang.xx` to every file, and add `"xx"` to `languages`.

## A new piece of UI text

Don't type visible words straight into JavaScript. Add a key to `web/i18n/en.json` **and** the same key with `""` to `mr.json`, then use `t("your.key")` (or `t("your.key", { n: 3 })` for `{n}` in the text). In HTML, put `data-i18n="your.key"` on the element and leave the English text inside it. `check-i18n.mjs` fails if the keys don't match.

## A new page

1. Copy `privacy.html` as a starting point (it has the header, notice and footer with their `data-i18n` keys).
2. Add a link to it in the `<nav>` of every page and a `nav.yourpage` key to the i18n files.
3. Create `web/js/pages/yourpage.js` that calls `initI18n()`, then `loadData()`, then your feature functions. Load it with `<script type="module" src="js/pages/yourpage.js"></script>`.

## A new feature

1. Put the logic that doesn't touch the page (working something out from the data) in a function in `web/js/features/yourfeature.js` and export it. Add a test in `tests/js/yourfeature.test.mjs`; it can read the real `web/data/*.json` (see `responsibility.test.mjs`).
2. Put the part that draws on the page in a `render...(element, data)` function in the same file.
3. Add a switch to `features` in `config.js`, set to `false`, and check it where the feature is called. The site can then be merged and deployed before the feature is finished.
4. Styles go in `assets/css/components.css` using the colour tokens from `tokens.css`.
5. Pass any text that comes from the sheet through `esc()`.

## A new hotspot type

1. Add it to `HOTSPOT_TYPES` and `DEFAULT_PROBLEM` in `tools/pipeline/build.py`, and to the `type in (...)` check on `hotspots` with a new migration in `supabase/migrations/`.
2. Add a colour token `--yourtype` in `assets/css/tokens.css` (the type colours are shared by light and dark mode).
3. Add it to `TYPES` in `web/js/features/map-view.js` and add `type.yourtype` to the i18n files.
4. Make sure the Routing Rules tab has a row for its default problem type.

## A new sheet tab on the website

1. Download it as `data/your_tab.csv` and describe it in `docs/data-model.md`.
2. Write `build_your_tab(rows, rep)` in `tools/pipeline/build.py` with the checks it needs, call it from `export()` and add it to the `tables` dictionary there (every entry is written as `web/data/<name>.json`).
3. Add its name to `FILES` in `web/js/core/data.js`.
4. Add a test for at least one rule in `tools/tests/test_pipeline.py`.
5. If it should go to Supabase, add the table in a new migration in `supabase/migrations/` (run it before merging) and a line to `rows_for()` in `tools/pipeline/supabase.py`.
