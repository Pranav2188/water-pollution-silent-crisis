// Areas group hotspots (one river stretch or town each). Defined in data/areas.csv.

import { esc } from "../core/format.js";
import { lang, t } from "../core/i18n.js";

// Areas to show on the map: live and with at least one published hotspot.
export function liveAreas(data) {
  return data.areas.filter((a) => a.status === "Live" && a.hotspot_count > 0);
}

export function areaName(area) {
  return (lang === "mr" && area.name_mr) || area.name;
}

// Buttons "All areas | Area 1 | Area 2". onChange(areaId or null) is called on every click.
export function renderAreaFilter(container, areas, onChange) {
  if (!container || areas.length < 2) return;
  const total = areas.reduce((n, a) => n + a.hotspot_count, 0);
  container.hidden = false;
  container.setAttribute("aria-label", t("areas.label"));
  container.innerHTML = [
    `<button type="button" class="chip" data-area="" aria-pressed="true">${esc(t("areas.all"))}<span class="count">${total}</span></button>`,
    ...areas.map((a) => `<button type="button" class="chip" data-area="${esc(a.id)}" aria-pressed="false">${esc(areaName(a))}<span class="count">${a.hotspot_count}</span></button>`),
  ].join("");
  container.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-area]");
    if (!btn) return;
    container.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    onChange(btn.dataset.area || null);
  });
}
