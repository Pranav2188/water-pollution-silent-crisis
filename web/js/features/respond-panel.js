// "What to do about it": the responsibility panel (Week 6). Shows who to contact first with
// tap-able channels, what to put in the message, who else to inform, and what to do if nothing
// happens, from the Routing Rules (or, for comparison sites, from the first contact the sheet
// names). Switched on with config.features.responsibilityPanel.

import { esc, niceDate, sourceLink } from "../core/format.js";
import { lang, t } from "../core/i18n.js";
import { checkStatus, responsibleFor, ruleIsDraft } from "./responsibility.js";

// One link per channel. The first is the main button; the rest are quieter.
export function channelLinks(channels, { small = true } = {}) {
  return channels.map((c, i) => {
    const cls = small ? `btn btn-small${i ? " btn-quiet" : ""}` : "";
    const newTab = c.kind === "whatsapp" || c.kind === "web" || c.kind === "x";
    return `<a class="${cls}" href="${esc(c.href)}"${newTab ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(t(`channel.${c.kind}`, { label: c.label }))}</a>`;
  }).join(small ? "" : " · ");
}

// "Confirmed with the office · 9 Oct 2026", "Checked against sources · 16 Oct 2026" or "to verify".
export function checkBadge(authority) {
  const s = checkStatus(authority);
  if (s.level === "unverified") return `<span class="tag">${esc(t("common.to_verify"))}</span>`;
  const text = t(`check.${s.level}`, { date: niceDate(s.date, lang) });
  return `<span class="check${s.level === "confirmed" ? " check-ok" : ""}">${esc(text)}</span>`;
}

const items = (text) => String(text || "").split(/,\s*|;\s*/).map((s) => s.trim()).filter(Boolean);

function spotLine(h) {
  let line = t("respond.this_spot", { id: h.id, lat: h.lat, lng: h.lng });
  if (h.prabhags.length) line += ` · ${t("panel.prabhag", { value: h.prabhags.join(" / ") })}`;
  return line;
}

export function renderResponsibility(box, h, data) {
  const draw = (problemType) => {
    const who = responsibleFor(h, data, problemType);
    const rule = who.rule;
    const picker = h.problem_type ? `
      <label class="picker">${esc(t("respond.problem"))}
        <select>${data.routing.map((r) => `<option${r.problem_type === problemType ? " selected" : ""}>${esc(r.problem_type)}</option>`).join("")}</select>
      </label>` : "";
    const pmcX = who.channels.some((c) => c.kind === "x" && /^@PMCPune$/i.test(c.label));
    const escalation = rule && rule.escalate.length
      ? `<ol class="escalate">${rule.escalate.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`
      : `<p>${esc(t("respond.escalate_offices"))}</p>`;

    box.innerHTML = `
      <h3>${esc(t("respond.title"))}</h3>
      ${picker}
      ${rule ? `<p class="meta">${esc(t("respond.what_you_see", { text: rule.what_you_see }))}</p>` : `<p class="meta">${esc(t("respond.no_rule"))}</p>`}
      ${rule && ruleIsDraft(rule) ? `<p class="note">${esc(t("respond.draft"))}</p>` : ""}
      <ol class="steps">
        <li class="step">
          <h4>${esc(t("panel.first_contact"))}</h4>
          <p><strong>${esc(who.firstContact)}</strong>${!rule && who.firstAuthority ? ` ${checkBadge(who.firstAuthority)}` : ""}</p>
          ${who.channels.length ? `<div class="channels">${channelLinks(who.channels)}</div>` : ""}
          <p class="meta">${esc(rule ? rule.how_to_reach : who.firstAuthority?.contact || "")}</p>
          ${pmcX ? `<p class="meta">${esc(t("respond.x_note"))}</p>` : ""}
        </li>
        <li class="step">
          <h4>${esc(t("respond.include"))}</h4>
          <ul class="ticks">${items(rule ? rule.what_to_include : t("respond.include_default")).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
          <p class="meta">${esc(spotLine(h))}</p>
        </li>
        ${rule && rule.also_inform ? `
        <li class="step">
          <h4>${esc(t("respond.also_inform"))}</h4>
          <p>${esc(rule.also_inform)}</p>
        </li>` : ""}
        <li class="step">
          <h4>${esc(t("panel.escalate"))}</h4>
          ${escalation}
        </li>
      </ol>
      ${rule ? `
      <details class="why">
        <summary>${esc(t("respond.why"))}</summary>
        <p>${esc(rule.why_this_office)}</p>
        ${who.sources.length ? `<p class="meta">${esc(t("respond.sources"))}: ${who.sources.map(sourceLink).join(", ")}</p>` : ""}
      </details>` : ""}
    `;
    box.querySelector("select")?.addEventListener("change", (e) => draw(e.target.value));
  };
  draw(h.problem_type);
}
