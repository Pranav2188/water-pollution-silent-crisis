"""One build_* function per data set. Each takes CSV rows and a Report and returns
the JSON-ready list for the website. The rules are listed in docs/data-model.md."""

import datetime as dt
import re

from .io import DATA, OUT, read_csv, read_optional, write_json
from .parse import iso_date, number, numbers, split_ids, split_list
from .report import Report

HOTSPOT_TYPES = {"outfall", "nalla", "dumping", "weir"}
DEFAULT_PROBLEM = {
    "outfall": "Sewage outfall or nalla",
    "nalla": "Sewage outfall or nalla",
    "dumping": "Garbage dumping",
    "weir": "Froth or foam at the weir",
}
AREA_STATUSES = {"Live", "Planned"}
LAT_RANGE = (18.3, 18.8)   # Pune district, roughly; catches swapped or mistyped numbers
LNG_RANGE = (73.6, 74.1)


def unique(rows, key, label, rep):
    seen = set()
    for r in rows:
        k = r.get(key, "")
        if not k:
            rep.error(f"{label}: a row has no {key}")
        elif k in seen:
            rep.error(f"{label}: {k} appears twice")
        seen.add(k)
    return seen


# --------------------------------------------------------------------------- sources


def build_sources(rows, rep):
    unique(rows, "ID", "Sources", rep)
    out = []
    for r in rows:
        if not r.get("URL"):
            rep.warn(f"Sources: {r['ID']} has no URL")
        out.append({
            "id": r["ID"],
            "title": r.get("Title", ""),
            "publisher": r.get("Publisher", ""),
            "date": r.get("Date", ""),
            "url": r.get("URL", ""),
        })
    return out


# --------------------------------------------------------------------------- areas


def build_areas(rows, rep):
    """Areas group hotspots on the site (one river stretch or town each).
    data/areas.csv is kept in the repository, not the sheet (see data/README.md)."""
    unique(rows, "ID", "Areas", rep)
    out = []
    owner = {}
    for r in rows:
        status = r.get("Status", "")
        if status not in AREA_STATUSES:
            rep.error(f"Areas: {r['ID']} has status '{status}' (allowed: {', '.join(sorted(AREA_STATUSES))})")
        prabhags = numbers(r.get("Prabhags"))
        for p in prabhags:
            if p in owner:
                rep.error(f"Areas: prabhag {p} is in both {owner[p]} and {r['ID']}")
            owner[p] = r["ID"]
        out.append({
            "id": r["ID"],
            "name": r.get("Name", ""),
            "name_mr": r.get("Name (Marathi)", ""),
            "river": r.get("River", ""),
            "local_body": r.get("Local Body", ""),
            "prabhags": prabhags,
            "general_authority_ids": split_ids(r.get("General Authorities", ""), "(?:AU|CA)"),
            "status": status,
            "description": r.get("Description", ""),
        })
    return out


def area_for(row, prabhags, areas):
    """An explicit 'Area' column wins (for places without PMC prabhags, such as Alandi);
    otherwise the first prabhag decides."""
    explicit = row.get("Area", "")
    if explicit:
        return explicit
    for p in prabhags:
        for a in areas:
            if p in a["prabhags"]:
                return a["id"]
    return None


# --------------------------------------------------------------------------- authorities


def authority(r, rep, contact_col="Contact", handle_col="Official Handle"):
    """One authority in the shape the website and Supabase use. Works for both the
    Authorities tab (AU-xx) and the Comparison Authorities tab (CA-xx)."""
    office = r.get("Office", "")
    role = r.get("Role", "")
    m_prabhag = re.match(r"Prabhag (\d+)", office)
    m_ward = re.match(r"(.+?) Ward Office", office)
    m_assembly = re.match(r"(.+?) Assembly:", office)
    m_ls = re.match(r"(.+?) Lok Sabha:", office)
    last = r.get("Last Verified", "")
    local = bool(m_prabhag or (role == "Ward office" and m_ward) or m_assembly or m_ls)
    return {
        "id": r["ID"],
        "role": role,
        "office": office,
        "area": r.get("Area Covered", ""),
        "contact": r.get(contact_col, ""),
        "handle": r.get(handle_col, ""),
        "source_url": r.get("Source URL", ""),
        "verified": iso_date(last) is not None,
        "last_verified": iso_date(last),
        "verified_by": r.get("Verified By", ""),
        "prabhag": int(m_prabhag.group(1)) if m_prabhag else None,
        "ward_office": m_ward.group(1) if (role == "Ward office" and m_ward) else None,
        "assembly": m_assembly.group(1) if m_assembly else None,
        "lok_sabha": m_ls.group(1) if m_ls else None,
        "scope": "local" if local else "general",
    }


def build_authorities(rows, rep):
    unique(rows, "ID", "Authorities", rep)
    return [authority(r, rep) for r in rows]


def build_comparison_authorities(rows, rep):
    """The Comparison Authorities tab (CA-xx): offices for the comparison sites such as Alandi."""
    unique(rows, "ID", "Comparison Authorities", rep)
    for r in rows:
        if not r.get("ID", "").startswith("CA-"):
            rep.error(f"Comparison Authorities: '{r.get('ID')}' should start with CA-")
    return [authority(r, rep, contact_col="Contact (office only)", handle_col="Other Official Channels")
            for r in rows]


def check_general_authorities(areas, authorities, rep):
    ids = {a["id"] for a in authorities}
    for a in areas:
        for i in a["general_authority_ids"]:
            if i not in ids:
                rep.error(f"Areas: {a['id']} lists general authority {i}, which is in neither Authorities tab")
        if a["status"] == "Live" and not a["general_authority_ids"]:
            rep.warn(f"Areas: {a['id']} has no general authorities; its hotspots will list only local offices")


# --------------------------------------------------------------------------- routing rules


def build_routing(rows, source_ids, rep):
    out = []
    names = set()
    for r in rows:
        name = r.get("Problem Type", "")
        if not name:
            rep.error("Routing Rules: a row has no Problem Type")
            continue
        if name in names:
            rep.error(f"Routing Rules: '{name}' appears twice")
        names.add(name)
        ids = split_ids(r.get("Source IDs"), "SRC")
        for s in ids:
            if s not in source_ids:
                rep.error(f"Routing Rules: '{name}' cites {s}, which is not in Sources")
        esc = r.get("Escalate If No Action", "")
        steps = [s.strip(" .") for s in re.split(r"\s*\d\)\s*", esc) if s.strip(" .")]
        if not r.get("Complaint Template"):
            rep.warn(f"Routing Rules: '{name}' has no complaint template yet")
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


# --------------------------------------------------------------------------- projects


def build_projects(rows, date_rows, source_ids, rep):
    ids = unique(rows, "ID", "Projects", rep)
    dates = {}
    for n, d in enumerate(date_rows, start=2):
        pid = d.get("Project ID", "")
        if pid not in ids:
            rep.error(f"Project Dates row {n}: project {pid or '(blank)'} is not in Projects")
            continue
        sid = d.get("Source ID", "")
        if sid and sid not in source_ids:
            rep.error(f"Project Dates row {n}: {sid} is not in Sources")
        if not sid:
            rep.error(f"Project Dates row {n}: every date needs a source")
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
                rep.error(f"Projects: {r['ID']} cites {s}, which is not in Sources")
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


# --------------------------------------------------------------------------- hotspots


def build_hotspots(rows, authorities, project_ids, areas, rep):
    unique(rows, "ID", "Hotspots", rep)
    area_ids = {a["id"] for a in areas}
    published = []
    for r in rows:
        hid = r.get("ID", "?")
        spot = check_spot(r, "Hotspots", rep)
        if spot is None:
            continue
        lat, lng, htype = spot

        prabhags = numbers(r.get("Prabhag", ""))
        wards, ward_c = split_list(r.get("Ward Office", ""))
        assembly, asm_c = split_list(r.get("Assembly Constituency", ""))
        lok_sabha, ls_c = split_list(r.get("Lok Sabha Constituency", ""))
        to_confirm = [n for n, c in (("ward_offices", ward_c), ("assembly", asm_c), ("lok_sabha", ls_c)) if c]
        if "(confirm)" in r.get("Prabhag", "").lower():
            to_confirm.insert(0, "prabhags")

        area = area_for(r, prabhags, areas)
        if area is None:
            rep.error(f"Hotspots: {hid} (prabhag {r.get('Prabhag') or 'blank'}) is in no area; add the prabhag to data/areas.csv")
        elif area not in area_ids:
            rep.error(f"Hotspots: {hid} names area {area}, which is not in data/areas.csv")

        linked = [a["id"] for a in authorities
                  if (a["prabhag"] in prabhags
                      or (a["ward_office"] and a["ward_office"] in wards)
                      or (a["assembly"] and a["assembly"] in assembly)
                      or (a["lok_sabha"] and a["lok_sabha"] in lok_sabha))]

        proj_text = r.get("Project That Should Fix It", "")
        projs = split_ids(proj_text, "PRJ")
        for p in projs:
            if p not in project_ids:
                rep.error(f"Hotspots: {hid} names {p}, which is not in Projects")

        published.append({
            "id": hid,
            "name": r.get("Name", ""),
            "area_id": area,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "type": htype,
            "problem_type": r.get("Problem Type (if not default)") or DEFAULT_PROBLEM[htype],
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
            "jurisdiction": "",
            "first_contact_id": None,
            "notes": "",
        })
    return published


def check_spot(r, label, rep):
    """Shared checks for one map spot. Returns (lat, lng, type) or None if it is held back."""
    sid = r.get("ID", "?")
    lat, lng = number(r.get("Latitude")), number(r.get("Longitude"))
    stype = r.get("Type", "").lower()
    if stype not in HOTSPOT_TYPES:
        rep.error(f"{label}: {sid} has type '{stype}' (allowed: {', '.join(sorted(HOTSPOT_TYPES))})")
        return None
    if lat is None or lng is None:
        rep.warn(f"{label}: {sid} held back (no GPS yet)")
        return None
    if not (LAT_RANGE[0] <= lat <= LAT_RANGE[1] and LNG_RANGE[0] <= lng <= LNG_RANGE[1]):
        rep.error(f"{label}: {sid} at {lat}, {lng} is outside the Pune area; check the numbers")
        return None
    if not r.get("Source"):
        rep.warn(f"{label}: {sid} held back (no source)")
        return None
    if not r.get("Photo Link"):
        rep.warn(f"{label}: {sid} has no photo link (published without a photo)")
    return lat, lng, stype


def build_comparison_sites(rows, authorities, areas, rep):
    """The Comparison Sites tab (CS-xx), published as map spots in their own area.
    They link only to Comparison Authorities (CA-xx) and have no PMC routing rule yet,
    so problem_type is empty; first_contact_id comes straight from the sheet."""
    unique(rows, "ID", "Comparison Sites", rep)
    area_ids = {a["id"] for a in areas}
    ca_ids = {a["id"] for a in authorities}
    published = []
    for r in rows:
        sid = r.get("ID", "?")
        spot = check_spot(r, "Comparison Sites", rep)
        if spot is None:
            continue
        lat, lng, stype = spot
        area = r.get("Area", "")
        if not area:
            rep.error(f"Comparison Sites: {sid} has no Area; add one from data/areas.csv")
        elif area not in area_ids:
            rep.error(f"Comparison Sites: {sid} names area {area}, which is not in data/areas.csv")
        first = r.get("First Contact (Authority ID)", "")
        if first and first not in ca_ids:
            rep.error(f"Comparison Sites: {sid} first contact {first} is not in Comparison Authorities")

        assembly, asm_c = split_list(r.get("Assembly Constituency", ""))
        lok_sabha, ls_c = split_list(r.get("Lok Sabha Constituency", ""))
        to_confirm = [n for n, c in (("assembly", asm_c), ("lok_sabha", ls_c)) if c]
        jurisdiction = r.get("Jurisdiction (who owns this spot)", "")
        if "confirm" in jurisdiction.lower():
            to_confirm.insert(0, "jurisdiction")
        linked = [a["id"] for a in authorities
                  if (a["assembly"] and a["assembly"] in assembly)
                  or (a["lok_sabha"] and a["lok_sabha"] in lok_sabha)]

        published.append({
            "id": sid,
            "name": r.get("Site Name", ""),
            "area_id": area or None,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "type": stype,
            "problem_type": None,
            "date_seen": iso_date(r.get("Date Seen", "")),
            "photo_url": r.get("Photo Link") or None,
            "description": r.get("Description", ""),
            "source": r.get("Source", ""),
            "last_verified": iso_date(r.get("Last Verified", "")),
            "prabhags": [],
            "ward_offices": [],
            "assembly": assembly,
            "lok_sabha": lok_sabha,
            "to_confirm": to_confirm,
            "authority_ids": linked,
            "project_ids": [],
            "project_link": "To confirm",
            "jurisdiction": jurisdiction,
            "first_contact_id": first or None,
            "notes": r.get("Notes / To Verify", ""),
        })
    return published


def finish_areas(areas, hotspots):
    """Add hotspot counts and map bounds, so the site can zoom to an area."""
    for a in areas:
        pts = [(h["lat"], h["lng"]) for h in hotspots if h["area_id"] == a["id"]]
        a["hotspot_count"] = len(pts)
        a["bounds"] = ([[min(p[0] for p in pts), min(p[1] for p in pts)],
                        [max(p[0] for p in pts), max(p[1] for p in pts)]] if pts else None)
    return areas


# --------------------------------------------------------------------------- everything


def export(data_dir=DATA, out_dir=OUT, write=True, today=None):
    """Build every data set. Returns (report, tables). Writes JSON only if there are no errors."""
    rep = Report()
    sources = build_sources(read_csv("sources", data_dir), rep)
    source_ids = {s["id"] for s in sources}
    areas = build_areas(read_csv("areas", data_dir), rep)
    authorities = build_authorities(read_csv("authorities", data_dir), rep)
    comparison_authorities = build_comparison_authorities(read_optional("comparison_authorities", data_dir), rep)
    routing = build_routing(read_csv("routing_rules", data_dir), source_ids, rep)
    projects = build_projects(read_csv("projects", data_dir), read_csv("project_dates", data_dir), source_ids, rep)
    hotspots = build_hotspots(read_csv("hotspots", data_dir), authorities, {p["id"] for p in projects}, areas, rep)
    hotspots += build_comparison_sites(read_optional("comparison_sites", data_dir), comparison_authorities, areas, rep)
    authorities = authorities + comparison_authorities
    unique([{"ID": a["id"]} for a in authorities], "ID", "Authorities + Comparison Authorities", rep)
    unique([{"ID": h["id"]} for h in hotspots], "ID", "Hotspots + Comparison Sites", rep)
    check_general_authorities(areas, authorities, rep)
    finish_areas(areas, hotspots)

    problem_names = {r["problem_type"] for r in routing}
    for h in hotspots:
        if h["problem_type"] is not None and h["problem_type"] not in problem_names:
            rep.error(f"Hotspots: {h['id']} maps to '{h['problem_type']}', which is not in Routing Rules")

    tables = {"hotspots": hotspots, "areas": areas, "authorities": authorities,
              "routing": routing, "projects": projects, "sources": sources}
    if write and rep.ok:
        for name, rows in tables.items():
            write_json(name, rows, out_dir)
        write_json("meta", {
            "exported_on": (today or dt.date.today()).isoformat(),
            "counts": {
                "hotspots_published": len(hotspots),
                "areas": len(areas),
                "authorities": len(authorities),
                "problem_types": len(routing),
                "projects": len(projects),
                "sources": len(sources),
            },
            "note": "Generated from the team's Google Sheet by tools/export_data.py. Do not edit by hand.",
        }, out_dir)
    return rep, tables
