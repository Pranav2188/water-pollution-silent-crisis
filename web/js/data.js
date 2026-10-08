// Loads the JSON files made by tools/export_data.py.
// Never edit web/data/*.json by hand: change the Google Sheet, download the
// CSVs into data/ and rerun the script.

const FILES = ["hotspots", "authorities", "routing", "projects", "sources", "meta"];

export async function loadData() {
  const parts = await Promise.all(
    FILES.map(async (name) => {
      const res = await fetch(`data/${name}.json`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Could not load data/${name}.json (${res.status})`);
      return [name, await res.json()];
    })
  );
  const d = Object.fromEntries(parts);
  d.authorityById = Object.fromEntries(d.authorities.map((a) => [a.id, a]));
  d.sourceById = Object.fromEntries(d.sources.map((s) => [s.id, s]));
  d.projectById = Object.fromEntries(d.projects.map((p) => [p.id, p]));
  d.routingByType = Object.fromEntries(d.routing.map((r) => [r.problem_type, r]));
  return d;
}

export async function loadWards() {
  const res = await fetch("data/wards.geojson", { cache: "no-cache" });
  return res.ok ? res.json() : null;
}

// Escape text before putting it into HTML.
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// "2026-09-29" -> "29 Sep 2026"; anything else is returned unchanged.
export function niceDate(text) {
  if (!text || !/^\d{4}-\d{2}(-\d{2})?$/.test(text)) return text || "";
  const [y, m, d] = text.split("-").map(Number);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return d ? `${d} ${month} ${y}` : `${month} ${y}`;
}

export function sourceLink(src) {
  if (!src) return "";
  return src.url
    ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.publisher || src.title)}</a>`
    : esc(src.publisher || src.title);
}
