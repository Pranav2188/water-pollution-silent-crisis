# Water Pollution A Silent Crisis

A citizen awareness and accountability website for the Mula-Mutha river stretch from the Old Keshavnagar–Kharadi Bridge to Mundhwa Bridge, Pune.

The website maps pollution hotspots, shows which authority is responsible for each one, tracks the progress of government projects meant to fix them, and helps residents raise complaints through the correct official channels.

## Team

| Name | Role |
| --- | --- |
| Pranav Patil | Team Lead, Data & Research and Backend & GIS (Maps) Development |
| Shweta Telange | Data & Research and Log Book |
| Sanskar Dumbare | Frontend Development |
| Vaishnavi Jadhav | Outreach, Legal & Documentation |
| Siddhesh Kondhalkar | Field Survey & Testing |

**Project Guide:** Prof. Vikrant Thombare
**Academic Year:** 2026–27

## Folder structure

```
docs/          Proposal, reports, data model (docs/data-model.md)
data/          CSV copies of the Google Sheet tabs, plus ward boundary files
tools/         export_data.py (CSV -> website JSON, optional Supabase copy),
               kml_to_geojson.py (prabhag outlines), ward_lookup.py
web/           The website: plain HTML/CSS/JS + Leaflet, published by GitHub Pages
supabase/      Database schema and setup steps (copy of the sheet, for Phase 4)
.github/       Workflows: deploy the website, sync Supabase
```

## Updating the website data

1. Edit the Google Sheet.
2. Download each exported tab as CSV (File → Download → CSV) into `data/` with the same file name (see `docs/data-model.md`).
3. Run `python3 tools/export_data.py`. It stops with a clear error if a source or ID is missing, so a bad edit can't reach the website.
4. Open a pull request. Once it is merged, the website updates itself.

## Data rules

The team edits the data in the shared Google Sheet: [Water Pollution – Data Registers](https://docs.google.com/spreadsheets/d/1mS0hFPElNAasD1ZlwrTl49pDPwRgBvUZhkPnBJhppiw/edit). The CSV files in `data/` are copies of its Hotspots, Authorities, Routing Rules, Projects, Project Dates and Sources tabs, updated every two weeks or after a field visit.

The team's working map shows the hotspots on top of the PMC ward boundaries: [Mula-Mutha Hotspots – Working Map](https://www.google.com/maps/d/edit?mid=13H0TosD0uQL93O2BbMLaC0Y_TS2vtnQ&usp=sharing) (Google My Maps). Its hotspot layer is imported from the sheet's **Map Pins** tab; re-import it after each field visit.

1. Every hotspot and authority entry must have a source.
2. Every entry has a "last verified" date. Re-check anything older than 90 days.
3. No photos of people's faces. No personal phone numbers of officials.
4. Mark anything not yet confirmed as `to verify`.

## Field safety

Survey in groups of at least two, in daylight, from bridges and roads only. Never enter the riverbed or the weir area.
