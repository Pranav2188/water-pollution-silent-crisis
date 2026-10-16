"""Reading the CSVs in data/ and writing the JSON files in web/data/."""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
OUT = ROOT / "web" / "data"


def read_csv(name, folder=DATA):
    """Rows of data/<name>.csv as dicts with trimmed keys and values; blank rows dropped."""
    path = Path(folder) / f"{name}.csv"
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = [{k.strip(): (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(f)]
    return [r for r in rows if any(r.values())]


def read_optional(name, folder=DATA):
    """Like read_csv, but an absent file means no rows (for tabs a project may not use)."""
    return read_csv(name, folder) if (Path(folder) / f"{name}.csv").exists() else []


def write_json(name, payload, folder=OUT):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return path
