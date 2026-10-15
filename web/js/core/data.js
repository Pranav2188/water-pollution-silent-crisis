// Loads the JSON files made by tools/export_data.py and adds lookup tables.
// Never edit web/data/*.json by hand: change the Google Sheet, download the CSVs into
// data/ and rerun the script (see docs/data-model.md).

import { config } from "./config.js";

const FILES = ["hotspots", "areas", "authorities", "routing", "projects", "sources", "meta"];

async function getJson(name, ext = "json") {
  const res = await fetch(`${config.dataPath}${name}.${ext}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load ${config.dataPath}${name}.${ext} (${res.status})`);
  return res.json();
}

export async function loadData() {
  const parts = await Promise.all(FILES.map(async (name) => [name, await getJson(name)]));
  const d = Object.fromEntries(parts);
  d.authorityById = Object.fromEntries(d.authorities.map((a) => [a.id, a]));
  d.sourceById = Object.fromEntries(d.sources.map((s) => [s.id, s]));
  d.projectById = Object.fromEntries(d.projects.map((p) => [p.id, p]));
  d.routingByType = Object.fromEntries(d.routing.map((r) => [r.problem_type, r]));
  d.areaById = Object.fromEntries(d.areas.map((a) => [a.id, a]));
  return d;
}

// Prabhag outlines; the map still works without them.
export async function loadWards() {
  try {
    return await getJson("wards", "geojson");
  } catch {
    return null;
  }
}
