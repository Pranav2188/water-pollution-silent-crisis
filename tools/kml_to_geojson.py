#!/usr/bin/env python3
"""Make web/data/wards.geojson (prabhag outlines for the map) from the PMC KML.

    python3 tools/kml_to_geojson.py                 # the five study-area prabhags
    python3 tools/kml_to_geojson.py --all           # every prabhag in the file

Only the prabhags near the study site are exported by default, which keeps the
file small. Coordinates are rounded to 5 decimals (about 1 metre).
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ward_lookup import load_kml  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KML = ROOT / "data" / "boundaries" / "pmc-electoral-wards-2025-labelled.kml"
OUT = ROOT / "web" / "data" / "wards.geojson"
STUDY_AREA = {3, 4, 5, 14, 15}
SOURCE = "PMC electoral wards 2025 (via OpenCity); see data/boundaries/README.md"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="export every prabhag")
    args = ap.parse_args()

    features = []
    for name, rings in load_kml(KML):
        m = re.search(r"(\d+)", name)
        if not m:
            continue
        num = int(m.group(1))
        if not args.all and num not in STUDY_AREA:
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
