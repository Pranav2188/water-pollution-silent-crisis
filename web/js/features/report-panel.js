// The side panel for an approved resident report (Phase 4, Milestone 4): the cleaned photo,
// what the resident saw, whom to contact first, and "Report this photo".

import { esc, niceDate } from "../core/format.js";
import { lang, t } from "../core/i18n.js";
import { areaName } from "./areas.js";
import { FLAG_REASONS } from "./flag-rules.js";
import { googleMapsUrl, wirePhoto } from "./hotspot-panel.js";
import { flagReport, istDay } from "./resident-reports.js";
import { ruleIsDraft } from "./responsibility.js";

const tag = (key, cls = "tag") => `<span class="${cls}">${esc(t(key))}</span>`;

// onFlagged(report): called once the photo has been taken off the site.
export function renderReportPanel(panel, r, data, { onFlagged } = {}) {
  const area = data.areaById[r.area_id];
  const rule = data.routingByType[r.problem_type];
  const taken = istDay(r.taken_at), sent = istDay(r.created_at);

  panel.innerHTML = `
    <p class="meta">${esc(r.ref)} · ${esc(t("rr.label"))}${area ? ` · ${esc(areaName(area))}` : ""}</p>
    <h2>${esc(r.problem_type)}</h2>
    <p>${tag("rr.unverified", "tag tag-resident")}</p>
    <figure class="panel-photo">
      <button type="button" class="photo-open" aria-label="${esc(t("panel.photo_enlarge"))}">
        <img src="${esc(r.public_photo_url)}" alt="${esc(t("rr.photo_alt", { ref: r.ref, problem: r.problem_type }))}" loading="lazy" decoding="async">
      </button>
      <figcaption class="meta">${esc(t("rr.photo_caption"))}</figcaption>
    </figure>
    ${r.note ? `<p><strong>${esc(t("rr.note"))}</strong> ${esc(r.note)}</p>` : ""}
    <p class="meta">${taken ? `${esc(t("rr.taken", { date: niceDate(taken, lang) }))} · ` : ""}${esc(t("rr.sent", { date: niceDate(sent, lang) }))}</p>

    <div class="actions">
      <a class="btn" href="${googleMapsUrl(r, "search")}" target="_blank" rel="noopener noreferrer">${esc(t("panel.open_maps"))}</a>
      <a class="btn btn-quiet" href="${googleMapsUrl(r, "dir")}" target="_blank" rel="noopener noreferrer">${esc(t("panel.directions"))}</a>
    </div>
    <p class="meta">${esc(t("panel.maps_note"))}</p>

    ${rule ? `
    <h3>${esc(t("rr.what_to_do"))}</h3>
    ${ruleIsDraft(rule) ? `<p class="note">${esc(t("respond.draft"))}</p>` : ""}
    <ul class="list">
      <li><strong>${esc(t("panel.first_contact"))}:</strong> ${esc(rule.first_contact)}</li>
      <li><strong>${esc(t("rr.how"))}:</strong> ${esc(rule.how_to_reach)}</li>
      <li><strong>${esc(t("rr.include"))}:</strong> ${esc(rule.what_to_include)}</li>
    </ul>
    <p class="meta">${esc(t("rr.mention_ref", { ref: r.ref }))}</p>` : ""}

    <h3>${esc(t("rr.flag_title"))}</h3>
    <div class="flag-box">
      <p class="meta">${esc(t("rr.flag_help"))}</p>
      <p class="actions"><button type="button" class="btn btn-quiet btn-small flag-open">${esc(t("rr.flag_button"))}</button></p>
      <form class="flag-form" hidden>
        <label class="field"><span>${esc(t("rr.flag_why"))}</span>
          <select class="flag-reason">
            <option value="">${esc(t("rr.flag_pick"))}</option>
            ${FLAG_REASONS.map((k) => `<option value="${k}">${esc(t(`flag.reason.${k}`))}</option>`).join("")}
          </select>
        </label>
        <p class="actions"><button type="submit" class="btn btn-small">${esc(t("rr.flag_send"))}</button></p>
      </form>
      <p class="flag-status" aria-live="polite"></p>
    </div>
  `;
  wirePhoto(panel);

  const box = panel.querySelector(".flag-box");
  const form = box.querySelector(".flag-form");
  const status = box.querySelector(".flag-status");
  box.querySelector(".flag-open").addEventListener("click", (e) => { e.target.hidden = true; form.hidden = false; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const reason = form.querySelector(".flag-reason").value;
    if (!reason) { status.textContent = t("rr.flag_pick_first"); return; }
    form.querySelector("button").disabled = true;
    status.textContent = t("rr.flag_sending");
    const res = await flagReport(r.ref, reason);
    if (res.ok) {
      form.hidden = true;
      status.textContent = t("rr.flag_done");
      panel.querySelector(".panel-photo").hidden = true;
      if (onFlagged) onFlagged(r);
    } else {
      form.querySelector("button").disabled = false;
      const known = ["rate_day", "rate_site", "network", "not_ready"];
      status.textContent = t(`rr.flag_error.${known.includes(res.error) ? res.error : "server_error"}`);
    }
  });
}
