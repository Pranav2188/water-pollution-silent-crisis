# Data model

The website never reads the Google Sheet directly. Data flows one way:

```
Google Sheet (team edits)
   │  File → Download → CSV, one file per tab, saved in data/
   ▼
data/*.csv  ──  tools/export_data.py  ──►  web/data/*.json   (the website reads these)
                                     └─►  Supabase tables     (copy for later phases; optional)
```

`tools/export_data.py` is a thin command; the work is done by the `tools/pipeline/` package (one `build_*` function per data set, tested by `tools/tests/`).

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
| Comparison Sites | `comparison_sites.csv` | inside `hotspots.json` (IDs `CS-xx`) | `hotspots` |
| Comparison Authorities | `comparison_authorities.csv` | inside `authorities.json` (IDs `CA-xx`) | `authorities` |
| *(not in the sheet)* | `areas.csv` | `areas.json` | `areas` |

The two Comparison tabs hold sites outside the Pune study stretch (so far the Indrayani at Alandi, AREA-03). Their spots go on the map with the hotspots, but they link only to Comparison Authorities, never to PMC offices. The Comparison Projects tab is not exported yet.

`data/areas.csv` is the one file kept in the repo instead of the sheet: it lists the river stretches the site covers and which prabhags belong to each. It changes rarely (when the project adds a new stretch), so a pull request is the right place to review it. See `data/README.md`.

`meta.json` holds the export date and the counts shown in the footer.

Internal tabs (Progress, Verification Log, Research Log, RTI Tracker, Map Pins, Comparison Projects) are **not** exported. They stay in the sheet.

`web/data/wards.geojson` (prabhag outlines) is made separately by `tools/kml_to_geojson.py` from `data/boundaries/pmc-electoral-wards-2025-labelled.kml`.

## Rules the script checks

The script stops with an error if any of these fail, so a bad sheet edit can't reach the website:

- IDs are unique (`HS-xx`, `AU-xx`, `PRJ-xx`, `SRC-xx`).
- Every source ID mentioned anywhere exists in Sources.
- Every project ID mentioned by a hotspot or a project date exists in Projects.
- Hotspot types are one of: `outfall`, `nalla`, `dumping`, `weir`.
- Published hotspots lie inside the Pune area (latitude 18.3–18.8, longitude 73.6–74.1).
- Every published hotspot belongs to an area: its first prabhag is listed in `data/areas.csv` (or the optional "Area" column in the Hotspots tab names an area that exists).
- No prabhag is listed in two areas, and area status is `Live` or `Planned`.
- Every ID in an area's General Authorities exists in the Authorities or Comparison Authorities tab.
- Every comparison site names an Area that exists, and its First Contact is a `CA-xx` in Comparison Authorities.
- No ID appears twice across Hotspots and Comparison Sites, or across Authorities and Comparison Authorities.

It warns (but continues) when a hotspot is held back because it has no coordinates yet, or has no photo link.

## Publishing rule for hotspots

A hotspot is published only when it has numeric latitude and longitude, a valid type and a source. Rows still marked `TO VERIFY` are held back automatically. A photo is shown when the Photo Link is filled in; photos must not show people's faces.

## hotspots.json

```json
{
  "id": "HS-01",
  "area_id": "AREA-01",
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
  "project_link": "To confirm",
  "jurisdiction": "",
  "first_contact_id": null,
  "notes": ""
}
```

- `area_id` is the area the hotspot belongs to (see `areas.json`). The map's area buttons use it.
- `problem_type` is the Routing Rules row for this hotspot. It comes from the sheet's "Problem Type (if not default)" column when that is filled in (for example "Construction debris in riverbed"); otherwise the default for the type is used (outfall and nalla → "Sewage outfall or nalla", dumping → "Garbage dumping", weir → "Froth or foam at the weir"). The user can pick another type in the complaint helper.
- `to_confirm` lists fields the sheet marks "(confirm)". The website shows these with a "to confirm" label.
- `authority_ids` are worked out by the script from the prabhags, ward offices and constituencies.

Comparison sites (`CS-xx`) use the same shape, with these differences:

- `prabhags` and `ward_offices` are empty; `jurisdiction` says who owns the spot (from "Jurisdiction (who owns this spot)"). The website shows it instead of the prabhag and ward office.
- `problem_type` is `null`: the Routing Rules are written for PMC, so Alandi has none yet. `first_contact_id` comes straight from the sheet's "First Contact (Authority ID)".
- `authority_ids` link only to `CA-xx` offices, by assembly and Lok Sabha constituency (the sheet's Assembly and Lok Sabha columns).
- `notes` is the sheet's "Notes / To Verify"; the website shows it under "Still to check".
- `to_confirm` can include `jurisdiction` when that text says "to confirm".

## areas.json

```json
{
  "id": "AREA-01",
  "name": "Kharadi–Mundhwa stretch",
  "name_mr": "",
  "river": "Mula-Mutha",
  "local_body": "Pune Municipal Corporation",
  "prabhags": [3, 4, 5, 14, 15],
  "general_authority_ids": ["AU-01", "AU-06", "AU-07"],
  "status": "Live",
  "description": "The original study stretch, ...",
  "hotspot_count": 9,
  "bounds": [[18.54373, 73.943934], [18.547827, 73.951499]]
}
```

`hotspot_count` and `bounds` (south-west and north-east corners of its hotspots) are worked out by the script. `Planned` areas are exported but not shown as buttons until they have hotspots and are switched to `Live`. `general_authority_ids` (the "General Authorities" column) are the main offices listed for every spot in the area, in order: PMC CARE and MPCB for Pune city, the council and MPCB Pune-II for Alandi. `name_mr` is shown when the site is in Marathi; empty falls back to `name`.

`wards.geojson` features carry `area_id` too, so the map shows only that area's prabhag outlines when an area is picked.

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

`verified` is false when Last Verified says "Not yet verified"; the website then shows "to verify". When it is true, the website tells two kinds of check apart from the Verified By column: a name followed by "(doc check)" means the details were matched against official pages or reports only (shown as "Checked against sources"); a plain name means someone called, wrote or visited the office (shown as "Confirmed with the office"). After contacting an office, log it in the Verification Log and replace "Pranav Patil (doc check)" with the name of the person who made contact. `scope` is `local` for rows tied to a prabhag, ward office or constituency (these are linked to hotspots), and `general` for city-wide offices such as PMC CARE and MPCB.

## routing.json

One entry per problem type, from the Routing Rules tab. `escalate` is split into steps at "1)", "2)" and so on (a step number is one digit at the start or after a space, so "(station 2192)" stays whole); `template` is the complaint text with `[placeholders]` the complaint helper fills in.

The responsibility panel turns the phone numbers, WhatsApp numbers, emails, websites and X handles in "How to Reach" and in each office's Contact and Official Handle into buttons. Write "(to verify)" next to any channel nobody has checked, and say "not a complaint line" for numbers that are something else (such as MPCB's online-services helpdesk): the website then leaves them out. Routes stay marked as drafts until Status says the team has agreed them.

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
