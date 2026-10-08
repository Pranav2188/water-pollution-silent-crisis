// Hotspot map (Phase 3, Week 4 skeleton).
// Week 6: Sanskar builds the "Who is responsible here?" panel properly.
// Week 7: complaint helper (WhatsApp / X text) goes into the same panel.

import { loadData, loadWards, esc, niceDate } from "./data.js";

const TYPE_LABEL = { outfall: "Sewage outfall", nalla: "Nalla (open drain)", dumping: "Garbage dumping", weir: "Weir / froth" };
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const panel = document.getElementById("panel");

function showHotspot(h, data) {
  const unsure = (field) => (h.to_confirm.includes(field) ? '<span class="tag">to confirm</span>' : "");
  const authorities = h.authority_ids.map((id) => data.authorityById[id]).filter(Boolean);
  const general = data.authorities.filter((a) => a.scope === "general" && ["Citizen complaint helpline", "Pollution regulator"].includes(a.role));

  panel.innerHTML = `
    <p class="meta">${esc(h.id)} · ${esc(TYPE_LABEL[h.type] || h.type)}</p>
    <h2>${esc(h.name)}</h2>
    <p>${esc(h.description)}</p>
    <p class="meta">Seen ${esc(niceDate(h.date_seen))} · Source: ${esc(h.source)} · Last checked ${esc(niceDate(h.last_verified))}</p>
    ${h.photo_url ? `<p><a href="${esc(h.photo_url)}" target="_blank" rel="noopener noreferrer">View photo</a></p>` : ""}

    <h3>Where it is</h3>
    <ul class="list">
      <li>Prabhag ${esc(h.prabhags.join(" / ") || "to confirm")} ${unsure("prabhags")}</li>
      <li>Ward office: ${esc(h.ward_offices.join(" / ") || "to confirm")} ${unsure("ward_offices")}</li>
      <li>Assembly: ${esc(h.assembly.join(" / ") || "to confirm")} ${unsure("assembly")}</li>
      <li>Lok Sabha: ${esc(h.lok_sabha.join(" / ") || "to confirm")} ${unsure("lok_sabha")}</li>
    </ul>

    <h3>Who is responsible here?</h3>
    <ul class="list">
      ${[...general, ...authorities].map((a) => `
        <li><strong>${esc(a.role)}</strong>${a.verified ? "" : ' <span class="tag">to verify</span>'}<br>
        ${esc(a.office)}<br><span class="meta">${esc(a.contact)}</span></li>`).join("")}
    </ul>
    <div class="placeholder">Week 6: this becomes the full panel (first contact, escalation steps, sources). Week 7: the complaint helper goes here.</div>

    <h3>Project that should fix it</h3>
    <p>${h.project_ids.length
      ? h.project_ids.map((id) => esc(data.projectById[id]?.name || id)).join(", ")
      : `${esc(h.project_link)} <span class="tag">to confirm</span>`}</p>
  `;
}

async function start() {
  let data;
  try {
    data = await loadData();
  } catch (err) {
    panel.innerHTML = `<p>Could not load the data. ${esc(err.message)}</p>`;
    return;
  }

  const first = data.hotspots[0];
  const map = L.map("map", { scrollWheelZoom: true }).setView(first ? [first.lat, first.lng] : [18.5463, 73.9515], 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const wards = await loadWards();
  if (wards) {
    L.geoJSON(wards, {
      style: { color: css("--ward"), weight: 1.5, fillOpacity: 0.04, dashArray: "4 4" },
      onEachFeature: (f, layer) => layer.bindTooltip(`Prabhag ${f.properties.prabhag}`, { sticky: true }),
    }).addTo(map);
  }

  for (const h of data.hotspots) {
    L.circleMarker([h.lat, h.lng], {
      radius: 9, weight: 2, color: "#ffffff", fillColor: css(`--${h.type}`) || "#333", fillOpacity: 0.95,
    })
      .addTo(map)
      .bindTooltip(`${h.id}: ${h.name}`)
      .on("click", () => showHotspot(h, data));
  }

  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = Object.entries(TYPE_LABEL)
      .map(([k, label]) => `<div><i style="background:${css(`--${k}`)}"></i>${label}</div>`).join("");
    return div;
  };
  legend.addTo(map);

  if (first) showHotspot(first, data);
  document.getElementById("count").textContent =
    `${data.hotspots.length} hotspot${data.hotspots.length === 1 ? "" : "s"} on the map · data exported ${niceDate(data.meta.exported_on)}`;
}

start();
