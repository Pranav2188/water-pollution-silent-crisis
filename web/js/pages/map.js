// Entry point for index.html: the hotspot map.

import { config } from "../core/config.js";
import { loadData, loadWards } from "../core/data.js";
import { esc, niceDate } from "../core/format.js";
import { initI18n, lang, t } from "../core/i18n.js";
import { liveAreas, renderAreaFilter } from "../features/areas.js";
import { renderHotspotPanel } from "../features/hotspot-panel.js";
import { addHotspots, addLegend, addWards, createMap, showArea } from "../features/map-view.js";

const panel = document.getElementById("panel");
const count = document.getElementById("count");

function countText(n, data) {
  const date = niceDate(data.meta.exported_on, lang);
  return n === 1 ? t("map.count_one", { date }) : t("map.count", { n, date });
}

async function start() {
  await initI18n();
  let data;
  try {
    data = await loadData();
  } catch (err) {
    panel.innerHTML = `<p>${esc(t("common.load_error", { message: err.message }))}</p>`;
    return;
  }

  const first = data.hotspots[0];
  const map = createMap("map", first && [first.lat, first.lng]);
  const wardsByArea = addWards(map, await loadWards());
  const select = (h) => renderHotspotPanel(panel, h, data);
  const markers = addHotspots(map, data.hotspots, select);
  addLegend(map);

  count.textContent = countText(showArea(map, markers, wardsByArea, null), data);
  if (config.features.areaFilter) {
    renderAreaFilter(document.getElementById("area-filter"), liveAreas(data), (areaId) => {
      count.textContent = countText(showArea(map, markers, wardsByArea, areaId), data);
      const firstInArea = data.hotspots.find((h) => !areaId || h.area_id === areaId);
      if (firstInArea) select(firstInArea);
    });
  }
  if (first) select(first);
}

start();
