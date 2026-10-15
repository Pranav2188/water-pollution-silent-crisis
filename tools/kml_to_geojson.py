#!/usr/bin/env python3
"""Make web/data/wards.geojson (prabhag outlines for the map) from the PMC KML.

    python3 tools/kml_to_geojson.py                 # prabhags of every area + any with a hotspot
    python3 tools/kml_to_geojson.py --all           # every prabhag in the file

By default only the prabhags listed in data/areas.csv, plus any prabhag named in
the Prabhag column of data/hotspots.csv, are exported, which keeps the file small.
Each outline carries the ID of the area it belongs to. Rerun this after adding an
area or a hotspot in a new ward. Coordinates are rounded to 5 decimals (about 1 metre).
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline.io import DATA, OUT, read_csv  # noqa: E402
from pipeline.parse import numbers  # noqa: E402
from ward_lookup import load_kml  # noqa: E402

KML = DATA / "boundaries" / "pmc-electoral-wards-2025-labelled.kml"
SOURCE = "PMC electoral wards 2025 (via OpenCity); see data/boundaries/README.md"


def area_of_prabhag():
    """{prabhag number: area ID} from data/areas.csv."""
    return {p: a["ID"] for a in read_csv("areas") for p in numbers(a.get("Prabhags"))}


def hotspot_prabhags():
    """Prabhag numbers mentioned in data/hotspots.csv (e.g. '4 / 15 (confirm)' -> {4, 15})."""
    return {p for r in read_csv("hotspots") for p in numbers(r.get("Prabhag"))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="export every prabhag")
    args = ap.parse_args()

    areas = area_of_prabhag()
    wanted = set(areas) | hotspot_prabhags()
    features = []
    for name, rings in load_kml(KML):
        m = re.search(r"(\d+)", name)
        if not m:
            continue
        num = int(m.group(1))
        if not args.all and num not in wanted:
            continue
        polys = [[[[round(x, 5), round(y, 5)] for x, y in ring]] for ring in rings]
        geom = ({"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1
                else {"type": "MultiPolygon", "coordinates": polys})
        features.append({"type": "Feature",
                         "properties": {"prabhag": num, "name": f"Prabhag {num}", "area_id": areas.get(num)},
                         "geometry": geom})

    features.sort(key=lambda f: f["properties"]["prabhag"])
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / "wards.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "source": SOURCE, "features": features},
                              separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {out.relative_to(OUT.parent.parent)}: prabhags {[f['properties']['prabhag'] for f in features]}")


if __name__ == "__main__":
    main()
