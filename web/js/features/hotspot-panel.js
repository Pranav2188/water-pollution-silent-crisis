// The side panel that opens when a hotspot is tapped.
// Week 6 (responsibility panel) and Week 7 (complaint helper) plug in at the marked spots,
// switched on in js/core/config.js.

import { config } from "../core/config.js";
import { esc, niceDate } from "../core/format.js";
import { lang, t } from "../core/i18n.js";
import { areaName } from "./areas.js";
import { responsibleFor } from "./responsibility.js";

// Google Maps URLs (no API key needed). Nothing loads from Google until the visitor taps
// the link, so the privacy page's "no outside scripts" still holds.
export function googleMapsUrl(h, kind) {
  const point = `${h.lat},${h.lng}`;
  return kind === "dir"
    ? `https://www.google.com/maps/dir/?api=1&destination=${point}`
    : `https://www.google.com/maps/search/?api=1&query=${point}`;
}

const tag = (key) => `<span class="tag">${esc(t(key))}</span>`;

// The office to contact first (when the sheet names one) goes to the top of the list.
function firstFirst(who) {
  const all = [...who.general, ...who.local];
  if (!who.firstAuthority) return all;
  return [who.firstAuthority, ...all.filter((a) => a !== who.firstAuthority)];
}

export function renderHotspotPanel(panel, h, data) {
  const unsure = (field) => (h.to_confirm.includes(field) ? tag("common.to_confirm") : "");
  const who = responsibleFor(h, data);
  const area = data.areaById[h.area_id];
  const checked = h.last_verified
    ? ` · ${esc(t("panel.last_checked", { date: niceDate(h.last_verified, lang) }))}`
    : ` · ${tag("common.to_verify")}`;

  panel.innerHTML = `
    <p class="meta">${esc(h.id)} · ${esc(t(`type.${h.type}`))}${area ? ` · ${esc(areaName(area))}` : ""}</p>
    <h2>${esc(h.name)}</h2>
    <p>${esc(h.description)}</p>
    <p class="meta">${esc(t("panel.seen", { date: niceDate(h.date_seen, lang) }))} · ${esc(t("panel.source", { source: h.source }))}${checked}</p>
    ${h.photo_url ? `<p><a href="${esc(h.photo_url)}" target="_blank" rel="noopener noreferrer">${esc(t("panel.view_photo"))}</a></p>` : ""}

    <div class="actions">
      <a class="btn" href="${googleMapsUrl(h, "search")}" target="_blank" rel="noopener noreferrer">${esc(t("panel.open_maps"))}</a>
      <a class="btn btn-quiet" href="${googleMapsUrl(h, "dir")}" target="_blank" rel="noopener noreferrer">${esc(t("panel.directions"))}</a>
    </div>
    <p class="meta">${esc(t("panel.maps_note"))}</p>

    <h3>${esc(t("panel.where"))}</h3>
    <ul class="list">
      ${h.jurisdiction && !h.prabhags.length ? `
      <li>${esc(t("panel.jurisdiction", { value: h.jurisdiction }))} ${unsure("jurisdiction")}</li>` : `
      <li>${esc(t("panel.prabhag", { value: h.prabhags.join(" / ") || t("common.to_confirm") }))} ${unsure("prabhags")}</li>
      <li>${esc(t("panel.ward_office", { value: h.ward_offices.join(" / ") || t("common.to_confirm") }))} ${unsure("ward_offices")}</li>`}
      <li>${esc(t("panel.assembly", { value: h.assembly.join(" / ") || t("common.to_confirm") }))} ${unsure("assembly")}</li>
      <li>${esc(t("panel.lok_sabha", { value: h.lok_sabha.join(" / ") || t("common.to_confirm") }))} ${unsure("lok_sabha")}</li>
    </ul>

    <h3>${esc(t("panel.responsible"))}</h3>
    <ul class="list">
      ${firstFirst(who).map((a) => `
        <li>${a === who.firstAuthority ? `<span class="meta">${esc(t("panel.first_contact"))}</span><br>` : ""}<strong>${esc(a.role)}</strong>${a.verified ? "" : ` ${tag("common.to_verify")}`}<br>
        ${esc(a.office)}<br><span class="meta">${esc(a.contact)}</span></li>`).join("")}
    </ul>
    ${config.features.responsibilityPanel ? "" /* Week 6: render who.firstContact and who.escalation here */ : `<div class="placeholder">${esc(t("panel.coming_soon"))}</div>`}
    ${config.features.complaintHelper ? "" /* Week 7: use features/complaint.js (fillTemplate, whatsappLink, xLink) here */ : ""}

    <h3>${esc(t("panel.project"))}</h3>
    <p>${h.project_ids.length
      ? h.project_ids.map((id) => esc(data.projectById[id]?.name || id)).join(", ")
      : `${esc(h.project_link)} ${tag("common.to_confirm")}`}</p>
    ${h.notes ? `<h3>${esc(t("panel.notes"))}</h3><p class="meta">${esc(h.notes)}</p>` : ""}
  `;
}
