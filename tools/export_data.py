#!/usr/bin/env python3
"""Turn the sheet's CSV downloads (data/*.csv) into the website's JSON files.

    python3 tools/export_data.py              # writes web/data/*.json
    python3 tools/export_data.py --check      # only validates, writes nothing
    python3 tools/export_data.py --supabase   # also copies the data to Supabase

The sheet is the source of truth. This script only reads data/*.csv, checks it,
and writes web/data/. See docs/data-model.md for the field list and the rules.

--supabase needs two environment variables, SUPABASE_URL and
SUPABASE_SERVICE_KEY. They live as GitHub secrets and must never be written
into any file in this repository.

Standard library only, so it runs anywhere Python 3.9+ runs.
"""

import argparse
import csv
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "web" / "data"

HOTSPOT_TYPES = {"outfall", "nalla", "dumping", "weir"}
DEFAULT_PROBLEM = {
    "outfall": "Sewage outfall or nalla",
    "nalla": "Sewage outfall or nalla",
    "dumping": "Garbage dumping",
    "weir": "Froth or foam at the weir",
}
LAT_RANGE = (18.3, 18.8)
LNG_RANGE = (73.6, 74.1)

errors = []
warnings = []


def read(name):
    path = DATA / f"{name}.csv"
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = [{k.strip(): (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(f)]
    # skip rows that are completely empty
    return [r for r in rows if any(r.values())]


def iso_date(text):
    """'2026-09-29' -> '2026-09-29'; anything else -> None."""
    try:
        return dt.date.fromisoformat(text[:10]).isoformat() if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text[:10]) else None
    except ValueError:
        return None


def number(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def split_list(text, sep=" / "):
    """'A / B (confirm)' -> (['A', 'B'], True)."""
    if not text:
        return [], False
    confirm = "(confirm)" in text.lower()
    clean = re.sub(r"\s*\(confirm\)", "", text, flags=re.I)
    return [p.strip() for p in clean.split(sep) if p.strip()], confirm


def split_ids(text, prefix):
    return [t for t in re.findall(rf"{prefix}-\d+", text or "")]


def unique(rows, key, label):
    seen = set()
    for r in rows:
        k = r.get(key, "")
        if not k:
            errors.append(f"{label}: a row has no {key}")
        elif k in seen:
            errors.append(f"{label}: {k} appears twice")
        seen.add(k)
    return seen


# --------------------------------------------------------------------------- build


def build_sources(rows):
    unique(rows, "ID", "Sources")
    out = []
    for r in rows:
        if not r.get("URL"):
            warnings.append(f"Sources: {r['ID']} has no URL")
        out.append({
            "id": r["ID"],
            "title": r.get("Title", ""),
            "publisher": r.get("Publisher", ""),
            "date": r.get("Date", ""),
            "url": r.get("URL", ""),
        })
    return out


def build_authorities(rows):
    unique(rows, "ID", "Authorities")
    out = []
    for r in rows:
        office = r.get("Office", "")
        role = r.get("Role", "")
        m_prabhag = re.match(r"Prabhag (\d+)", office)
        m_ward = re.match(r"(.+?) Ward Office", office)
        m_assembly = re.match(r"(.+?) Assembly:", office)
        m_ls = re.match(r"(.+?) Lok Sabha:", office)
        last = r.get("Last Verified", "")
        local = bool(m_prabhag or (role == "Ward office" and m_ward) or m_assembly or m_ls)
        out.append({
            "id": r["ID"],
            "role": role,
            "office": office,
            "area": r.get("Area Covered", ""),
            "contact": r.get("Contact", ""),
            "handle": r.get("Official Handle", ""),
            "source_url": r.get("Source URL", ""),
            "verified": iso_date(last) is not None,
            "last_verified": iso_date(last),
            "verified_by": r.get("Verified By", ""),
            "prabhag": int(m_prabhag.group(1)) if m_prabhag else None,
            "ward_office": m_ward.group(1) if (role == "Ward office" and m_ward) else None,
            "assembly": m_assembly.group(1) if m_assembly else None,
            "lok_sabha": m_ls.group(1) if m_ls else None,
            "scope": "local" if local else "general",
        })
    return out


def build_routing(rows, source_ids):
    out = []
    names = set()
    for r in rows:
        name = r.get("Problem Type", "")
        if not name:
            errors.append("Routing Rules: a row has no Problem Type")
            continue
        if name in names:
            errors.append(f"Routing Rules: '{name}' appears twice")
        names.add(name)
        ids = split_ids(r.get("Source IDs"), "SRC")
        for s in ids:
            if s not in source_ids:
                errors.append(f"Routing Rules: '{name}' cites {s}, which is not in Sources")
        esc = r.get("Escalate If No Action", "")
        steps = [s.strip(" .") for s in re.split(r"\s*\d\)\s*", esc) if s.strip(" .")]
        if not r.get("Complaint Template"):
            warnings.append(f"Routing Rules: '{name}' has no complaint template yet")
        out.append({
            "problem_type": name,
            "what_you_see": r.get("What You See", ""),
            "first_contact": r.get("First Contact", ""),
            "how_to_reach": r.get("How to Reach", ""),
            "also_inform": r.get("Also Inform", ""),
            "escalate": steps,
            "what_to_include": r.get("What to Include", ""),
            "why_this_office": r.get("Why This Office", ""),
            "source_ids": ids,
            "status": r.get("Status", ""),
            "confirmed": r.get("Confirmed By / Date", ""),
            "template": r.get("Complaint Template", ""),
        })
    return out


def build_projects(rows, date_rows, source_ids):
    ids = unique(rows, "ID", "Projects")
    dates = {}
    for n, d in enumerate(date_rows, start=2):
        pid = d.get("Project ID", "")
        if pid not in ids:
            errors.append(f"Project Dates row {n}: project {pid or '(blank)'} is not in Projects")
            continue
        sid = d.get("Source ID", "")
        if sid and sid not in source_ids:
            errors.append(f"Project Dates row {n}: {sid} is not in Sources")
        if not sid:
            errors.append(f"Project Dates row {n}: every date needs a source")
        dates.setdefault(pid, []).append({
            "reported_on": d.get("Reported On", ""),
            "promised": d.get("Promised Date", "") or None,
            "text": d.get("What Was Promised or Reported", ""),
            "source_id": sid,
            "kind": d.get("Type", ""),
            "notes": d.get("Notes", ""),
        })
    out = []
    for r in rows:
        src = split_ids(r.get("Source IDs"), "SRC")
        for s in src:
            if s not in source_ids:
                errors.append(f"Projects: {r['ID']} cites {s}, which is not in Sources")
        cap = number(r.get("Capacity (MLD)"))
        out.append({
            "id": r["ID"],
            "name": r.get("Project", ""),
            "capacity_mld": int(cap) if cap is not None and cap.is_integer() else cap,
            "capacity_text": r.get("Capacity (MLD)", ""),
            "type": r.get("Type", ""),
            "scheme": r.get("Scheme / Funding", ""),
            "original_deadline": r.get("Original Deadline", ""),
            "current_target": r.get("Current Target", ""),
            "label": r.get("Website Label", ""),
            "status_text": r.get("Latest Reported Status", ""),
            "status_date": r.get("Status Date", ""),
            "source_ids": src,
            "confirmed_by": r.get("Confirmed By", ""),
            "confirmed_date": iso_date(r.get("Confirmed Date", "")),
            "dates": sorted(dates.get(r["ID"], []), key=lambda x: x["reported_on"]),
        })
    return out


def build_hotspots(rows, authorities, project_ids):
    unique(rows, "ID", "Hotspots")
    published = []
    for r in rows:
        hid = r.get("ID", "?")
        lat, lng = number(r.get("Latitude")), number(r.get("Longitude"))
        htype = r.get("Type", "").lower()
        if htype not in HOTSPOT_TYPES:
            errors.append(f"Hotspots: {hid} has type '{htype}' (allowed: {', '.join(sorted(HOTSPOT_TYPES))})")
            continue
        if lat is None or lng is None:
            warnings.append(f"Hotspots: {hid} held back (no GPS yet)")
            continue
        if not (LAT_RANGE[0] <= lat <= LAT_RANGE[1] and LNG_RANGE[0] <= lng <= LNG_RANGE[1]):
            errors.append(f"Hotspots: {hid} at {lat}, {lng} is outside the Pune area; check the numbers")
            continue
        if not r.get("Source"):
            warnings.append(f"Hotspots: {hid} held back (no source)")
            continue
        if not r.get("Photo Link"):
            warnings.append(f"Hotspots: {hid} has no photo link (published without a photo)")

        prabhags = [int(p) for p in re.findall(r"\d+", r.get("Prabhag", ""))]
        wards, ward_c = split_list(r.get("Ward Office", ""))
        assembly, asm_c = split_list(r.get("Assembly Constituency", ""))
        lok_sabha, ls_c = split_list(r.get("Lok Sabha Constituency", ""))
        to_confirm = [n for n, c in (("ward_offices", ward_c), ("assembly", asm_c), ("lok_sabha", ls_c)) if c]
        if "(confirm)" in r.get("Prabhag", "").lower():
            to_confirm.insert(0, "prabhags")

        linked = []
        for a in authorities:
            if (a["prabhag"] in prabhags
                    or (a["ward_office"] and a["ward_office"] in wards)
                    or (a["assembly"] and a["assembly"] in assembly)
                    or (a["lok_sabha"] and a["lok_sabha"] in lok_sabha)):
                linked.append(a["id"])

        proj_text = r.get("Project That Should Fix It", "")
        projs = split_ids(proj_text, "PRJ")
        for p in projs:
            if p not in project_ids:
                errors.append(f"Hotspots: {hid} names {p}, which is not in Projects")

        published.append({
            "id": hid,
            "name": r.get("Name", ""),
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "type": htype,
            "problem_type": DEFAULT_PROBLEM[htype],
            "date_seen": iso_date(r.get("Date Seen", "")),
            "photo_url": r.get("Photo Link") or None,
            "description": r.get("Description", ""),
            "source": r.get("Source", ""),
            "last_verified": iso_date(r.get("Last Verified", "")),
            "prabhags": prabhags,
            "ward_offices": wards,
            "assembly": assembly,
            "lok_sabha": lok_sabha,
            "to_confirm": to_confirm,
            "authority_ids": linked,
            "project_ids": projs,
            "project_link": proj_text if not projs else ", ".join(projs),
        })
    return published


# --------------------------------------------------------------------------- supabase


def supabase_sync(tables):
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("Supabase: SUPABASE_URL or SUPABASE_SERVICE_KEY not set; skipped.")
        return
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

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

    # 1) add or update, parents first
    for table, key_col, rows in tables:
        if rows:
            call("POST", f"{table}?on_conflict={key_col}", rows,
                 {"Prefer": "resolution=merge-duplicates,return=minimal"})
    # 2) remove rows that are no longer in the sheet, children first
    for table, key_col, rows in reversed(tables):
        keep = ",".join(urllib.parse.quote(f'"{r[key_col]}"') for r in rows)
        call("DELETE", f"{table}?{key_col}=not.in.({keep})" if rows else f"{table}?{key_col}=not.is.null",
             extra={"Prefer": "return=minimal"})
        print(f"Supabase: {table} now has {len(rows)} rows")


def supabase_rows(sources, authorities, routing, projects, hotspots):
    project_rows, date_rows = [], []
    for p in projects:
        project_rows.append({k: v for k, v in p.items() if k != "dates"})
        for n, d in enumerate(p["dates"], start=1):
            date_rows.append({"id": f"{p['id']}-{n:02d}", "project_id": p["id"], **d})
    # order matters: sources and projects before the tables that point at them
    return [
        ("sources", "id", sources),
        ("authorities", "id", authorities),
        ("routing_rules", "problem_type", routing),
        ("projects", "id", project_rows),
        ("project_dates", "id", date_rows),
        ("hotspots", "id", hotspots),
    ]


# --------------------------------------------------------------------------- main


def write_json(name, payload):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="validate only, write nothing")
    ap.add_argument("--supabase", action="store_true", help="also copy to Supabase (needs env vars)")
    args = ap.parse_args()

    sources = build_sources(read("sources"))
    source_ids = {s["id"] for s in sources}
    authorities = build_authorities(read("authorities"))
    routing = build_routing(read("routing_rules"), source_ids)
    projects = build_projects(read("projects"), read("project_dates"), source_ids)
    hotspots = build_hotspots(read("hotspots"), authorities, {p["id"] for p in projects})

    problem_names = {r["problem_type"] for r in routing}
    for h in hotspots:
        if h["problem_type"] not in problem_names:
            errors.append(f"Hotspots: {h['id']} maps to '{h['problem_type']}', which is not in Routing Rules")

    for w in warnings:
        print(f"warning: {w}")
    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(f"{len(errors)} problem(s) found; nothing was written. Fix the sheet and download the CSVs again.")

    print(f"ok: {len(hotspots)} hotspot(s) published, {len(authorities)} authorities, "
          f"{len(routing)} problem types, {len(projects)} projects, {len(sources)} sources")
    if args.check:
        return

    write_json("hotspots", hotspots)
    write_json("authorities", authorities)
    write_json("routing", routing)
    write_json("projects", projects)
    write_json("sources", sources)
    write_json("meta", {
        "exported_on": dt.date.today().isoformat(),
        "counts": {
            "hotspots_published": len(hotspots),
            "authorities": len(authorities),
            "problem_types": len(routing),
            "projects": len(projects),
            "sources": len(sources),
        },
        "note": "Generated from the team's Google Sheet by tools/export_data.py. Do not edit by hand.",
    })

    if args.supabase:
        supabase_sync(supabase_rows(sources, authorities, routing, projects, hotspots))


if __name__ == "__main__":
    main()
