// The side panel that opens when a hotspot is tapped.
// The responsibility panel ("What to do about it", features/respond-panel.js) and the Week 7
// complaint helper plug in here, switched on in js/core/config.js.

import { config } from "../core/config.js";
import { esc, niceDate } from "../core/format.js";
import { lang, t } from "../core/i18n.js";
import { areaName } from "./areas.js";
import { officeChannels } from "./contacts.js";
import { channelLinks, checkBadge, renderResponsibility } from "./respond-panel.js";
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

// The hotspot's photo, shown larger over the page (same tab). One viewer for the whole page.
export function openPhotoViewer(src, alt) {
  let dlg = document.getElementById("photo-viewer");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "photo-viewer";
    dlg.className = "photo-viewer";
    dlg.innerHTML = `<form method="dialog"><button class="btn btn-small photo-close">${esc(t("panel.photo_close"))}</button></form><img alt="">`;
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });   // tap outside the photo
    document.body.append(dlg);
  }
  const img = dlg.querySelector("img");
  img.src = src;
  img.alt = alt;
  dlg.showModal();
}

// Show the photo in the panel; hide it quietly if the file cannot be loaded.
export function wirePhoto(panel) {
  const fig = panel.querySelector(".panel-photo");
  if (!fig) return;
  const img = fig.querySelector("img");
  img.addEventListener("error", () => { fig.hidden = true; });
  fig.querySelector(".photo-open").addEventListener("click", () => openPhotoViewer(img.src, img.alt));
}

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
    ${h.photo_url ? `
    <figure class="panel-photo">
      <button type="button" class="photo-open" aria-label="${esc(t("panel.photo_enlarge"))}">
        <img src="${esc(h.photo_url)}" alt="${esc(t("panel.photo_alt", { id: h.id, name: h.name }))}" loading="lazy" decoding="async">
      </button>
      <figcaption class="meta">${esc(t("panel.photo_caption"))}</figcaption>
    </figure>` : ""}

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

    ${config.features.responsibilityPanel ? `<section class="respond"></section>` : ""}

    <h3>${esc(t("panel.responsible"))}</h3>
    <ul class="list offices">
      ${firstFirst(who).map((a) => {
        const links = officeChannels(a);
        return `
        <li>${a === who.firstAuthority ? `<span class="first-label">${esc(t("panel.first_contact"))}</span><br>` : ""}<strong>${esc(a.role)}</strong> ${checkBadge(a)}<br>
        ${esc(a.office)}<br><span class="meta">${esc(a.contact)}</span>
        ${links.length ? `<div class="links">${channelLinks(links, { small: false })}</div>` : ""}</li>`;
      }).join("")}
    </ul>
    ${config.features.complaintHelper ? "" /* Week 7: use features/complaint.js (fillTemplate, whatsappLink, xLink) here */
      : `<div class="placeholder">${esc(t(config.features.responsibilityPanel ? "panel.helper_soon" : "panel.coming_soon"))}</div>`}

    <h3>${esc(t("panel.project"))}</h3>
    <p>${h.project_ids.length
      ? h.project_ids.map((id) => esc(data.projectById[id]?.name || id)).join(", ")
      : `${esc(h.project_link)} ${tag("common.to_confirm")}`}</p>
    ${h.notes ? `<h3>${esc(t("panel.notes"))}</h3><p class="meta">${esc(h.notes)}</p>` : ""}
  `;
  wirePhoto(panel);
  const respond = panel.querySelector(".respond");
  if (respond) renderResponsibility(respond, h, data);
}
