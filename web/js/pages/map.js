// Entry point for index.html: the hotspot map, plus approved resident reports (Phase 4).

import { config } from "../core/config.js";
import { loadData, loadWards } from "../core/data.js";
import { esc, niceDate } from "../core/format.js";
import { initI18n, lang, t } from "../core/i18n.js";
import { liveAreas, renderAreaFilter } from "../features/areas.js";
import { renderHotspotPanel } from "../features/hotspot-panel.js";
import { addHotspots, addLegend, addResidentReports, addWards, createMap, showArea } from "../features/map-view.js";
import { renderReportPanel } from "../features/report-panel.js";
import { fetchApprovedReports, refFromHash } from "../features/resident-reports.js";

const panel = document.getElementById("panel");
const count = document.getElementById("count");

function countText(shown, data) {
  const date = niceDate(data.meta.exported_on, lang);
  const spots = shown.spots === 1 ? t("map.count_one", { date }) : t("map.count", { n: shown.spots, date });
  if (!shown.reports) return spots;
  return `${spots} · ${shown.reports === 1 ? t("map.reports_one") : t("map.reports", { n: shown.reports })}`;
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
  // Resident reports load in parallel; the map works without them (Supabase down or paused).
  const reportsPromise = config.features.residentReports ? fetchApprovedReports() : Promise.resolve([]);

  const first = data.hotspots[0];
  const map = createMap("map", first && [first.lat, first.lng]);
  const wardsByArea = addWards(map, await loadWards());
  const select = (h) => renderHotspotPanel(panel, h, data);
  let markers = addHotspots(map, data.hotspots, select);
  let areaId = null;

  const reports = await reportsPromise;
  // A flagged photo disappears from the map at once (it is back in the review queue).
  const removeReport = (r) => {
    const gone = markers.find((m) => m.resident && m.hotspot.ref === r.ref);
    if (gone) gone.marker.remove();
    markers = markers.filter((m) => m !== gone);
    count.textContent = countText(shownCount(), data);
  };
  const selectReport = (r) => renderReportPanel(panel, r, data, { onFlagged: removeReport });
  markers = markers.concat(addResidentReports(map, reports, selectReport));
  addLegend(map, { withResidents: reports.length > 0 });
  const shownCount = () => ({
    spots: markers.filter((m) => !m.resident && (!areaId || m.hotspot.area_id === areaId)).length,
    reports: markers.filter((m) => m.resident && (!areaId || m.hotspot.area_id === areaId)).length,
  });

  count.textContent = countText(showArea(map, markers, wardsByArea, null), data);
  if (config.features.areaFilter) {
    renderAreaFilter(document.getElementById("area-filter"), liveAreas(data), (id) => {
      areaId = id;
      count.textContent = countText(showArea(map, markers, wardsByArea, areaId), data);
      const firstInArea = data.hotspots.find((h) => !areaId || h.area_id === areaId);
      if (firstInArea) select(firstInArea);
    });
  }

  // index.html#RPT-00005 (from the report page's "Recent reports") opens that report.
  const openFromHash = () => {
    const ref = refFromHash(location.hash);
    const r = ref && reports.find((x) => x.ref === ref);
    if (!r) return false;
    map.setView([r.lat, r.lng], 17);
    selectReport(r);
    return true;
  };
  window.addEventListener("hashchange", openFromHash);
  if (!openFromHash() && first) select(first);
}

start();
