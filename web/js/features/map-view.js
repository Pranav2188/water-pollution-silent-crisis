// Leaflet map: tiles, prabhag outlines, hotspot markers, resident report rings, legend, and
// showing one area at a time.

import { esc } from "../core/format.js";
import { t } from "../core/i18n.js";

const TYPES = ["outfall", "nalla", "dumping", "weir"];
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createMap(el, start) {
  const map = L.map(el, { scrollWheelZoom: true }).setView(start || [18.5463, 73.9515], 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  return map;
}

// Prabhag outlines. Returns the Leaflet layer per prabhag, so areas can hide or show them.
export function addWards(map, wards) {
  const byArea = new Map();
  if (!wards) return byArea;
  L.geoJSON(wards, {
    style: { color: css("--ward"), weight: 1.5, fillOpacity: 0.04, dashArray: "4 4" },
    onEachFeature: (f, layer) => {
      layer.bindTooltip(t("map.prabhag_tooltip", { n: f.properties.prabhag }), { sticky: true });
      const key = f.properties.area_id || "";
      if (!byArea.has(key)) byArea.set(key, []);
      byArea.get(key).push(layer);
    },
  }).addTo(map);
  return byArea;
}

// Hotspot markers coloured by type. onSelect(hotspot) runs when one is tapped.
export function addHotspots(map, hotspots, onSelect) {
  return hotspots.map((h) => {
    const marker = L.circleMarker([h.lat, h.lng], {
      radius: 9, weight: 2, color: "#ffffff", fillColor: css(`--${h.type}`) || "#333", fillOpacity: 0.95,
    })
      .addTo(map)
      .bindTooltip(`${esc(h.id)}: ${esc(h.name)}`)
      .on("click", () => onSelect(h));
    return { hotspot: h, marker };
  });
}

// Resident reports (Phase 4): hollow rings, so they read as "not verified by the team".
// onSelect(report) runs when one is tapped. Returns entries shaped like addHotspots' ones.
export function addResidentReports(map, reports, onSelect) {
  return reports.map((r) => {
    const marker = L.circleMarker([r.lat, r.lng], {
      radius: 8, weight: 3, color: css("--resident") || "#c2410c", fillColor: "#ffffff", fillOpacity: 0.9,
    })
      .addTo(map)
      .bindTooltip(`${esc(r.ref)}: ${esc(r.problem_type)} (${esc(t("rr.label"))})`)
      .on("click", () => onSelect(r));
    return { hotspot: r, marker, resident: true };
  });
}

// withResidents: also explain the resident report rings.
export function addLegend(map, { withResidents = false } = {}) {
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = TYPES.map((k) => `<div><i style="background:${css(`--${k}`)}"></i>${esc(t(`type.${k}`))}</div>`).join("") +
      (withResidents ? `<div><i class="ring"></i>${esc(t("rr.legend"))}</div>` : "");
    return div;
  };
  legend.addTo(map);
}

// Show only one area (or all when areaId is null) and zoom to what is shown.
// markers: entries from addHotspots and addResidentReports. Returns how many of each are shown.
export function showArea(map, markers, wardsByArea, areaId) {
  const visible = [];
  let spots = 0, reports = 0;
  for (const { hotspot, marker, resident } of markers) {
    const show = !areaId || hotspot.area_id === areaId;
    if (show) {
      marker.addTo(map);
      visible.push([hotspot.lat, hotspot.lng]);
      if (resident) reports++; else spots++;
    } else {
      marker.remove();
    }
  }
  for (const [key, layers] of wardsByArea) {
    const show = !areaId || key === areaId;
    layers.forEach((layer) => layer.setStyle({ opacity: show ? 1 : 0, fillOpacity: show ? 0.04 : 0 }));
  }
  if (visible.length > 1) map.fitBounds(visible, { padding: [30, 30], maxZoom: 16 });
  else if (visible.length === 1) map.setView(visible[0], 16);
  return { spots, reports };
}
