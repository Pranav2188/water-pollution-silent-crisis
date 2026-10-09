# Data model

The website never reads the Google Sheet directly. Data flows one way:

```
Google Sheet (team edits)
   │  File → Download → CSV, one file per tab, saved in data/
   ▼
data/*.csv  ──  tools/export_data.py  ──►  web/data/*.json   (the website reads these)
                                     └─►  Supabase tables     (copy for later phases; optional)
```

The sheet always wins. Never edit the JSON files or the Supabase tables by hand: change the sheet, download the CSVs again and rerun the script.

## Which sheet tabs are exported

| Sheet tab | CSV file in `data/` | JSON file in `web/data/` | Supabase table |
|---|---|---|---|
| Hotspots | `hotspots.csv` | `hotspots.json` | `hotspots` |
| Authorities | `authorities.csv` | `authorities.json` | `authorities` |
| Routing Rules | `routing_rules.csv` | `routing.json` | `routing_rules` |
| Projects | `projects.csv` | `projects.json` (with its dates inside) | `projects` |
| Project Dates | `project_dates.csv` | inside `projects.json` | `project_dates` |
| Sources | `sources.csv` | `sources.json` | `sources` |

Internal tabs (Progress, Verification Log, Research Log, RTI Tracker, Map Pins) are **not** exported. They stay in the sheet.

`web/data/wards.geojson` (prabhag outlines) is made separately by `tools/kml_to_geojson.py` from `data/boundaries/pmc-electoral-wards-2025-labelled.kml`.

## Rules the script checks

The script stops with an error if any of these fail, so a bad sheet edit can't reach the website:

- IDs are unique (`HS-xx`, `AU-xx`, `PRJ-xx`, `SRC-xx`).
- Every source ID mentioned anywhere exists in Sources.
- Every project ID mentioned by a hotspot or a project date exists in Projects.
- Hotspot types are one of: `outfall`, `nalla`, `dumping`, `weir`.
- Published hotspots lie inside the Pune area (latitude 18.3–18.8, longitude 73.6–74.1).

It warns (but continues) when a hotspot is held back because it has no coordinates yet, or has no photo link.

## Publishing rule for hotspots

A hotspot is published only when it has numeric latitude and longitude, a valid type and a source. Rows still marked `TO VERIFY` are held back automatically. A photo is shown when the Photo Link is filled in; photos must not show people's faces.

## hotspots.json

```json
{
  "id": "HS-01",
  "name": "Old Keshavnagar–Kharadi Bridge weir (bandhara)",
  "lat": 18.546297,
  "lng": 73.951499,
  "type": "weir",
  "problem_type": "Froth or foam at the weir",
  "date_seen": "2026-09-29",
  "photo_url": null,
  "description": "Thick white froth below the weir ...",
  "source": "Team field visit 29 Sep 2026 (GPS Map Camera photo)",
  "last_verified": "2026-09-29",
  "prabhags": [4, 15],
  "ward_offices": ["Nagar Road–Vadgaonsheri", "Hadapsar–Mundhwa"],
  "assembly": ["Vadgaon Sheri", "Hadapsar"],
  "lok_sabha": ["Pune", "Shirur"],
  "to_confirm": ["ward_offices", "assembly"],
  "authority_ids": ["AU-02", "AU-03", "AU-08", "AU-12", "AU-14", "AU-15", "AU-16", "AU-17"],
  "project_ids": [],
  "project_link": "To confirm"
}
```

- `problem_type` is the Routing Rules row for this hotspot. It comes from the sheet's "Problem Type (if not default)" column when that is filled in (for example "Construction debris in riverbed"); otherwise the default for the type is used (outfall and nalla → "Sewage outfall or nalla", dumping → "Garbage dumping", weir → "Froth or foam at the weir"). The user can pick another type in the complaint helper.
- `to_confirm` lists fields the sheet marks "(confirm)". The website shows these with a "to confirm" label.
- `authority_ids` are worked out by the script from the prabhags, ward offices and constituencies.

## authorities.json

```json
{
  "id": "AU-08",
  "role": "Corporators (4)",
  "office": "Prabhag 4 Kharadi–Wagholi: Shailjeet Bansode (A, SC), ...",
  "area": "Kharadi",
  "contact": "Through the ward office (no personal numbers)",
  "handle": "",
  "source_url": "https://data.opencity.in/dataset/pmc-election-results-2026",
  "verified": true,
  "last_verified": "2026-10-09",
  "verified_by": "Pranav Patil (doc check)",
  "prabhag": 4,
  "ward_office": null,
  "assembly": null,
  "lok_sabha": null,
  "scope": "local"
}
```

`verified` is false when Last Verified says "Not yet verified"; the website then shows "to verify". `scope` is `local` for rows tied to a prabhag, ward office or constituency (these are linked to hotspots), and `general` for city-wide offices such as PMC CARE and MPCB.

## routing.json

One entry per problem type, from the Routing Rules tab. `escalate` is split into steps; `template` is the complaint text with `[placeholders]` the complaint helper fills in.

## projects.json

```json
{
  "id": "PRJ-02",
  "name": "Kharadi sewage plant (new, JICA project)",
  "capacity_mld": 30,
  "label": "Announced (not confirmed)",
  "status_text": "Not reported running. ...",
  "status_date": "2026-08-12",
  "source_ids": ["SRC-03", "SRC-12", "SRC-02", "SRC-16"],
  "dates": [
    {"reported_on": "2016-01-13", "promised": "2022-01", "text": "...", "source_id": "SRC-01", "kind": "Original deadline", "notes": "..."}
  ]
}
```

`dates` comes from the Project Dates tab, oldest first. It is what the project tracker draws as "promises over time". Labels follow the Projects tab rule: nothing is shown as complete until confirmed by the office, an RTI reply or a site visit.

## sources.json

`id`, `title`, `publisher`, `date`, `url`. Every fact on the website links to one of these.
