"""Find which ward each hotspot falls in.

Usage:
    python tools/ward_lookup.py data/hotspots.csv data/boundaries/pmc-electoral-wards-2025.kml [more.kml ...]

For every hotspot with numeric Latitude and Longitude, prints the name of the
ward polygon that contains it in each KML file. A hotspot on a river that forms
a ward boundary may fall in one ward, both (on the line) or none (in a gap), so
the script also reports the nearest ward and its distance. The team confirms
every result on the shared map before it goes into the Google Sheet.

Uses only the Python standard library.
"""

import csv
import math
import sys
import xml.etree.ElementTree as ET

NS = {"k": "http://www.opengis.net/kml/2.2"}


def _text(el):
    return (el.text or "").strip() if el is not None else ""


def _placemark_name(pm):
    """Name of a placemark: its <name>, else the first useful ExtendedData value."""
    name = _text(pm.find("k:name", NS))
    if name:
        return name
    parts = []
    for d in pm.iter():
        tag = d.tag.split("}")[-1]
        if tag in ("Data", "SimpleData"):
            key = d.get("name", "")
            val = _text(d.find("k:value", NS)) if tag == "Data" else _text(d)
            if val:
                try:
                    num = float(val)
                    val = str(int(num)) if num.is_integer() else val
                except ValueError:
                    pass
                parts.append(f"{key}={val}")
    if len(parts) == 1 and parts[0].split("=", 1)[1].isdigit():
        return f"Ward {parts[0].split('=', 1)[1]}"
    return "; ".join(parts[:3]) or "(unnamed)"


def _rings(pm):
    """Outer boundary rings of every polygon in a placemark, as [(lon, lat), ...]."""
    rings = []
    for poly in pm.iter("{http://www.opengis.net/kml/2.2}Polygon"):
        outer = poly.find("k:outerBoundaryIs/k:LinearRing/k:coordinates", NS)
        if outer is None:
            continue
        pts = []
        for tok in _text(outer).split():
            bits = tok.split(",")
            if len(bits) >= 2:
                pts.append((float(bits[0]), float(bits[1])))
        if len(pts) >= 3:
            rings.append(pts)
    return rings


def load_kml(path):
    root = ET.parse(path).getroot()
    wards = []
    for pm in root.iter("{http://www.opengis.net/kml/2.2}Placemark"):
        rings = _rings(pm)
        if rings:
            wards.append((_placemark_name(pm), rings))
    return wards


def point_in_ring(lon, lat, ring):
    """Ray casting: True if the point is inside the ring."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat):
            x_cross = (xj - xi) * (lat - yi) / (yj - yi) + xi
            if lon < x_cross:
                inside = not inside
        j = i
    return inside


def _metres(lon1, lat1, lon2, lat2):
    """Approximate distance in metres (fine for a few kilometres)."""
    k = 111_320
    dx = (lon2 - lon1) * k * math.cos(math.radians((lat1 + lat2) / 2))
    dy = (lat2 - lat1) * k
    return math.hypot(dx, dy)


def distance_to_ring(lon, lat, ring):
    """Shortest distance in metres from the point to the ring's edge."""
    best = float("inf")
    for i in range(len(ring)):
        (x1, y1), (x2, y2) = ring[i - 1], ring[i]
        dx, dy = x2 - x1, y2 - y1
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((lon - x1) * dx + (lat - y1) * dy) / (dx * dx + dy * dy)))
        best = min(best, _metres(lon, lat, x1 + t * dx, y1 + t * dy))
    return best


def lookup(lon, lat, wards):
    inside = [name for name, rings in wards if any(point_in_ring(lon, lat, r) for r in rings)]
    nearest = sorted((min(distance_to_ring(lon, lat, r) for r in rings), name) for name, rings in wards)
    return inside, nearest[:2]


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    hotspots_csv, kml_paths = argv[1], argv[2:]
    layers = [(p, load_kml(p)) for p in kml_paths]
    for path, wards in layers:
        print(f"# {path}: {len(wards)} wards")
    with open(hotspots_csv, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        try:
            lat, lon = float(row["Latitude"]), float(row["Longitude"])
        except (KeyError, ValueError):
            print(f"{row.get('ID', '?')}: no coordinates yet, skipped")
            continue
        print(f"{row['ID']} ({lat}, {lon}) {row.get('Name', '')}")
        for path, wards in layers:
            inside, nearest = lookup(lon, lat, wards)
            near = "; ".join(f"{n} {d:.0f} m" for d, n in nearest)
            flag = "" if len(inside) == 1 else "  <-- CHECK ON MAP"
            print(f"   {path.split('/')[-1]}: inside={inside or 'none'} | nearest edges: {near}{flag}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
