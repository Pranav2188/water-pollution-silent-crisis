#!/usr/bin/env python3
"""Make web/data/wards.geojson (prabhag outlines for the map) from the PMC KML.

    python3 tools/kml_to_geojson.py                 # study-area prabhags + any with a hotspot
    python3 tools/kml_to_geojson.py --all           # every prabhag in the file

By default only the five study-area prabhags plus every prabhag named in the
Prabhag column of data/hotspots.csv are exported, which keeps the file small.
Rerun this after hotspots are added in a new ward. Coordinates are rounded to
5 decimals (about 1 metre).
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ward_lookup import load_kml  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KML = ROOT / "data" / "boundaries" / "pmc-electoral-wards-2025-labelled.kml"
OUT = ROOT / "web" / "data" / "wards.geojson"
HOTSPOTS = ROOT / "data" / "hotspots.csv"
STUDY_AREA = {3, 4, 5, 14, 15}  # Kharadi–Mundhwa stretch and its neighbours
SOURCE = "PMC electoral wards 2025 (via OpenCity); see data/boundaries/README.md"


def hotspot_prabhags():
    """Prabhag numbers mentioned in data/hotspots.csv (e.g. '4 / 15 (confirm)' -> {4, 15})."""
    if not HOTSPOTS.exists():
        return set()
    with HOTSPOTS.open(encoding="utf-8") as f:
        return {int(n) for r in csv.DictReader(f) for n in re.findall(r"\d+", r.get("Prabhag", ""))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="export every prabhag")
    args = ap.parse_args()

    wanted = STUDY_AREA | hotspot_prabhags()
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
        features.append({"type": "Feature", "properties": {"prabhag": num, "name": f"Prabhag {num}"}, "geometry": geom})

    features.sort(key=lambda f: f["properties"]["prabhag"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"type": "FeatureCollection", "source": SOURCE, "features": features},
                              separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: prabhags {[f['properties']['prabhag'] for f in features]}")


if __name__ == "__main__":
    main()
