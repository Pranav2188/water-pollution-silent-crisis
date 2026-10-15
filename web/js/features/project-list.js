// Project tracker list: every project and its dated promises.
// Week 7: Sanskar turns PRJ-01 and PRJ-02 into the "promises over time" timeline.

import { esc, niceDate, sourceLink } from "../core/format.js";
import { lang, t } from "../core/i18n.js";

export function renderProjects(box, data) {
  const src = (id) => sourceLink(data.sourceById[id]) || esc(id);
  box.innerHTML = data.projects.map((p) => `
    <section class="card" id="${esc(p.id)}">
      <p class="meta">${esc(p.id)} · ${esc(p.capacity_text)}${/MLD/i.test(p.capacity_text) ? "" : " MLD"} · <span class="tag">${esc(p.label)}</span></p>
      <h2 style="margin:4px 0">${esc(p.name)}</h2>
      <p>${esc(p.status_text)}</p>
      <p class="meta">${esc(t("projects.status_as_of", { date: niceDate(p.status_date, lang) }))} · ${esc(t("projects.sources", { list: "" }))}${p.source_ids.map(src).join(", ")}</p>
      ${p.dates.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>${esc(t("projects.col_reported"))}</th><th>${esc(t("projects.col_promised"))}</th><th>${esc(t("projects.col_what"))}</th><th>${esc(t("projects.col_source"))}</th></tr></thead>
        <tbody>${p.dates.map((d) => `
          <tr><td>${esc(niceDate(d.reported_on, lang))}</td><td>${esc(niceDate(d.promised, lang) || "–")}</td>
          <td>${esc(d.text)}</td><td>${src(d.source_id)}</td></tr>`).join("")}
        </tbody>
      </table></div>` : ""}
    </section>`).join("");
}
