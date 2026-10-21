// Report page: the map where the resident confirms the spot. Shows the report zones (where
// reports are accepted) and one draggable pin. onMove({lat, lng}) runs whenever the pin moves.

import { t } from "../core/i18n.js";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createPinMap(el, zones, onMove) {
  const map = L.map(el, { scrollWheelZoom: false, tap: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const outline = L.geoJSON(zones, {
    style: { color: css("--accent"), weight: 2, fillOpacity: 0.06 },
    interactive: false,
  }).addTo(map);
  map.fitBounds(outline.getBounds(), { padding: [10, 10] });

  let pin = null;
  const place = (latlng, zoom) => {
    if (!pin) {
      pin = L.marker(latlng, { draggable: true, autoPan: true, keyboard: true, title: t("report.step_place") }).addTo(map);
      pin.on("dragend", () => onMove(pin.getLatLng()));
    } else {
      pin.setLatLng(latlng);
    }
    if (zoom) map.setView(latlng, Math.max(map.getZoom(), 17));
    onMove(pin.getLatLng());
  };
  map.on("click", (e) => place(e.latlng, false));

  return {
    // Put the pin somewhere (from the stamp, the photo or the phone) and zoom to it.
    setPin: (lat, lng) => place(L.latLng(lat, lng), true),
    getPin: () => (pin ? pin.getLatLng() : null),
    clear: () => { if (pin) { pin.remove(); pin = null; } map.fitBounds(outline.getBounds(), { padding: [10, 10] }); },
    refresh: () => map.invalidateSize(),
  };
}
