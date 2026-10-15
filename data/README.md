# data/

The inputs for `tools/export_data.py`. The website is built from these files; see [docs/data-model.md](../docs/data-model.md) for every column and rule.

| File | Comes from | How to update |
|---|---|---|
| `hotspots.csv` | Sheet tab **Hotspots** | File → Download → CSV, save here with this name |
| `authorities.csv` | Sheet tab **Authorities** | same |
| `routing_rules.csv` | Sheet tab **Routing Rules** | same |
| `projects.csv` | Sheet tab **Projects** | same |
| `project_dates.csv` | Sheet tab **Project Dates** | same |
| `sources.csv` | Sheet tab **Sources** | same |
| `areas.csv` | **This repo** (not in the sheet) | Edit here in a pull request. One row per river stretch; lists the prabhags that belong to it. |
| `boundaries/` | OpenCity (PMC ward maps) | See [boundaries/README.md](boundaries/README.md) |

The sheet always wins for the six sheet files: don't edit them here, edit the sheet and download again.

## areas.csv columns

| Column | Example | Notes |
|---|---|---|
| ID | `AREA-01` | Never reuse an ID |
| Name | Kharadi–Mundhwa stretch | Shown on the map buttons |
| Name (Marathi) | | Shown when the site is in Marathi; empty falls back to Name |
| River | Mula-Mutha | |
| Prabhags | `3 / 4 / 5 / 14 / 15` | A hotspot belongs to the area that lists its first prabhag (or the one named in the Hotspots tab's optional Area column). A prabhag may be in only one area. |
| Local Body | Pune Municipal Corporation | |
| Status | `Live` or `Planned` | Only `Live` areas with hotspots get a button |
| Description | | One line on what the area covers and when it was visited |
