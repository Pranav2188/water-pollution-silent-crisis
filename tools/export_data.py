#!/usr/bin/env python3
"""Turn the sheet's CSV downloads (data/*.csv) into the website's JSON files.

    python3 tools/export_data.py              # checks the data, writes web/data/*.json
    python3 tools/export_data.py --check      # only checks, writes nothing
    python3 tools/export_data.py --supabase   # also copies the data to Supabase

The sheet is the source of truth. This script only reads data/*.csv (plus the
repo-managed data/areas.csv), checks it and writes web/data/. The work is done by
the modules in tools/pipeline/; see docs/data-model.md for the fields and rules.

--supabase needs SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment. They
live as GitHub secrets and must never be written into any file in this repository.

Standard library only, so it runs anywhere Python 3.9+ runs.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline import export  # noqa: E402
from pipeline import supabase  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="validate only, write nothing")
    ap.add_argument("--supabase", action="store_true", help="also copy to Supabase (needs env vars)")
    args = ap.parse_args()

    rep, tables = export(write=not args.check)
    for w in rep.warnings:
        print(f"warning: {w}")
    if not rep.ok:
        for e in rep.errors:
            print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(f"{len(rep.errors)} problem(s) found; nothing was written. Fix the sheet and download the CSVs again.")

    print(f"ok: {len(tables['hotspots'])} hotspot(s) published in {sum(1 for a in tables['areas'] if a['hotspot_count'])} area(s), "
          f"{len(tables['authorities'])} authorities, {len(tables['routing'])} problem types, "
          f"{len(tables['projects'])} projects, {len(tables['sources'])} sources")
    if not args.check:
        print("wrote web/data/*.json")
    if args.supabase:
        supabase.sync(tables)


if __name__ == "__main__":
    main()
