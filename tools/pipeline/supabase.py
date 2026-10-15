"""Optional one-way copy of the built data into Supabase (the sheet always wins).

Needs SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment. They live as GitHub
secrets and must never be written into any file in this repository."""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def rows_for(tables):
    """Table rows in the order Supabase needs them: parents before the tables that point at them."""
    project_rows, date_rows = [], []
    for p in tables["projects"]:
        project_rows.append({k: v for k, v in p.items() if k != "dates"})
        for n, d in enumerate(p["dates"], start=1):
            date_rows.append({"id": f"{p['id']}-{n:02d}", "project_id": p["id"], **d})
    areas = [{k: v for k, v in a.items() if k not in ("hotspot_count", "bounds")} for a in tables["areas"]]
    return [
        ("sources", "id", tables["sources"]),
        ("areas", "id", areas),
        ("authorities", "id", tables["authorities"]),
        ("routing_rules", "problem_type", tables["routing"]),
        ("projects", "id", project_rows),
        ("project_dates", "id", date_rows),
        ("hotspots", "id", tables["hotspots"]),
    ]


def sync(tables):
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("Supabase: SUPABASE_URL or SUPABASE_SERVICE_KEY not set; skipped.")
        return
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def call(method, path, body=None, extra=None):
        req = urllib.request.Request(
            f"{url}/rest/v1/{path}",
            data=json.dumps(body).encode() if body is not None else None,
            headers={**headers, **(extra or {})},
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.status
        except urllib.error.HTTPError as e:
            sys.exit(f"Supabase {method} {path} failed: {e.code} {e.read().decode()[:300]}")

    ordered = rows_for(tables)
    # 1) add or update, parents first
    for table, key_col, rows in ordered:
        if rows:
            call("POST", f"{table}?on_conflict={key_col}", rows,
                 {"Prefer": "resolution=merge-duplicates,return=minimal"})
    # 2) remove rows that are no longer in the sheet, children first
    for table, key_col, rows in reversed(ordered):
        keep = ",".join(urllib.parse.quote(f'"{r[key_col]}"') for r in rows)
        call("DELETE", f"{table}?{key_col}=not.in.({keep})" if rows else f"{table}?{key_col}=not.is.null",
             extra={"Prefer": "return=minimal"})
        print(f"Supabase: {table} now has {len(rows)} rows")
