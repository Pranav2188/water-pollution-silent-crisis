// Project tracker (Phase 3, Week 4 skeleton): a plain list of every project
// and its dated promises. Week 7: Sanskar turns PRJ-01 and PRJ-02 into the
// "promises over time" timeline.

import { loadData, esc, niceDate, sourceLink } from "./data.js";

const box = document.getElementById("projects");

async function start() {
  let data;
  try {
    data = await loadData();
  } catch (err) {
    box.innerHTML = `<p>Could not load the data. ${esc(err.message)}</p>`;
    return;
  }
  box.innerHTML = data.projects.map((p) => `
    <section class="card" id="${esc(p.id)}">
      <p class="meta">${esc(p.id)} · ${esc(p.capacity_text)}${/MLD/i.test(p.capacity_text) ? "" : " MLD"} · <span class="tag">${esc(p.label)}</span></p>
      <h2 style="margin:4px 0">${esc(p.name)}</h2>
      <p>${esc(p.status_text)}</p>
      <p class="meta">Status as of ${esc(niceDate(p.status_date))} · Sources: ${p.source_ids.map((id) => sourceLink(data.sourceById[id]) || esc(id)).join(", ")}</p>
      ${p.dates.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Reported</th><th>Promised for</th><th>What was said</th><th>Source</th></tr></thead>
        <tbody>${p.dates.map((d) => `
          <tr><td>${esc(niceDate(d.reported_on))}</td><td>${esc(niceDate(d.promised) || "–")}</td>
          <td>${esc(d.text)}</td><td>${sourceLink(data.sourceById[d.source_id]) || esc(d.source_id)}</td></tr>`).join("")}
        </tbody>
      </table></div>` : ""}
    </section>`).join("");
}

start();
