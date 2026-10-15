// Entry point for projects.html: the sewage plant tracker.

import { loadData } from "../core/data.js";
import { esc } from "../core/format.js";
import { initI18n, t } from "../core/i18n.js";
import { renderProjects } from "../features/project-list.js";

const box = document.getElementById("projects");

async function start() {
  await initI18n();
  try {
    renderProjects(box, await loadData());
  } catch (err) {
    box.innerHTML = `<p>${esc(t("common.load_error", { message: err.message }))}</p>`;
  }
}

start();
