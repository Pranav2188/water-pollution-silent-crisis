// Entry point for review.html: team reviewers check resident reports (Phase 4, Milestone 3).
//
// Sign in (email + password, accounts made in the Supabase dashboard) -> the queue (waiting, with
// photos reported by visitors first, and "needs a visit") -> one report: faces found and blurred, number plates found as suggestions,
// blur / clear blur by hand -> Approve (publishes a cleaned copy, deletes the original),
// Needs a visit (keeps it private), or Reject (deletes the original).
// Everything is protected by the database rules (migrations 002-006): this page only works for
// accounts listed in public.reviewers.

import { config } from "../core/config.js";
import { loadData } from "../core/data.js";
import { esc } from "../core/format.js";
import { initI18n, t } from "../core/i18n.js";
import { boxFromDrag, padBox } from "../features/report-form.js";
import { blurredCopy, loadPhoto, uploadFiles } from "../features/report-photo.js";
import { approveState, boxAt, decisionRow, DECIDABLE, FLAG_KEYS, isFlagged, needsTidyUp, newBox, nextState, publicPaths, QUEUE, queueOrder } from "../features/review-logic.js";

const $ = (id) => document.getElementById(id);
const PRIVATE = "report-photos", PUBLIC = "report-public";
const COLUMNS = "id, ref, created_at, status, area_id, problem_type, lat, lng, location_source, location_flags, taken_at, note, photo_path, thumb_path, flag_reason, flagged_at";

let sb, data, zones, me;
let rows = [], tab = "waiting";
const view = { row: null, work: null, boxes: [], busy: 0, map: null, openId: 0 };

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "–");
const secs = (t0) => ((performance.now() - t0) / 1000).toFixed(1);
function say(listId, items) {
  $(listId).innerHTML = items.filter(Boolean).map(([text, kind = ""]) => `<li class="${kind}">${esc(text)}</li>`).join("");
}
function show(section) {
  for (const id of ["login", "queue", "detail"]) $(id).hidden = id !== section;
}
function message(text) {
  $("message").textContent = text || "";
  $("message").hidden = !text;
}

// ------------------------------------------------------------------ signing in

async function signedIn(session) {
  me = session && session.user;
  if (!me) { $("who").hidden = true; show("login"); return; }
  $("who-email").textContent = me.email || "";
  $("who").hidden = false;
  const { data: mine, error } = await sb.from("reviewers").select("user_id").eq("user_id", me.id);
  if (error || !mine || !mine.length) {
    show(null);
    message(t("review.not_reviewer"));
    return;
  }
  message("");
  await loadQueue();
}

async function signIn(e) {
  e.preventDefault();
  say("login-status", [[t("review.signing_in"), "busy"]]);
  const { data: d, error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
  $("password").value = "";
  if (error) return say("login-status", [[t("review.sign_in_failed"), "bad"]]);
  say("login-status", []);
  await signedIn(d.session);
}

// ------------------------------------------------------------------ the queue

async function loadQueue() {
  show("queue");
  say("queue-status", [[t("review.loading"), "busy"]]);
  const { data: got, error } = await sb.from("reports").select(COLUMNS).in("status", QUEUE).order("created_at", { ascending: true });
  if (error) return say("queue-status", [[t("review.load_failed", { message: error.message }), "bad"]]);
  rows = queueOrder(got || []);
  renderTabs();
  await renderList();
  tidyUp();   // in the background: originals left behind by an interrupted decision
}

function renderTabs() {
  const count = (s) => rows.filter((r) => r.status === s).length;
  $("tabs").innerHTML = QUEUE.map((s) => `<button type="button" class="chip" data-tab="${s}" aria-pressed="${s === tab}">${esc(t(`review.tab.${s}`))}<span class="count">${count(s)}</span></button>`).join("");
  $("tabs").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; renderTabs(); renderList(); }));
}

async function renderList() {
  const list = rows.filter((r) => r.status === tab);
  say("queue-status", list.length ? [] : [[t("review.empty")]]);
  if (!list.length) { $("list").innerHTML = ""; return; }
  const { data: signed } = await sb.storage.from(PRIVATE).createSignedUrls(list.map((r) => r.thumb_path), 600);
  const url = Object.fromEntries((signed || []).map((s) => [s.path, s.signedUrl]));
  $("list").innerHTML = list.map((r) => `
    <li><button type="button" class="review-item" data-id="${r.id}">
      ${url[r.thumb_path] ? `<img src="${esc(url[r.thumb_path])}" alt="" loading="lazy">` : `<span class="review-noimg"></span>`}
      <span><strong>${esc(r.ref)}</strong> · ${esc(data.areaById[r.area_id]?.name || r.area_id)}<br>
      ${esc(r.problem_type)}<br><span class="meta">${esc(t("review.received", { when: when(r.created_at) }))}</span>
      ${isFlagged(r) ? `<span class="tag tag-flagged">${esc(t("review.flagged_tag", { reason: t(`flag.reason.${r.flag_reason}`) }))}</span>` : ""}
      ${(r.location_flags || []).map((f) => `<span class="tag">${esc(t(FLAG_KEYS[f] || f))}</span>`).join(" ")}</span>
    </button></li>`).join("");
  $("list").querySelectorAll(".review-item").forEach((b) => b.addEventListener("click", () => openReport(rows.find((r) => String(r.id) === b.dataset.id))));
}

// Approved or rejected rows that still hold an original (a deletion interrupted half-way).
async function tidyUp() {
  const { data: left } = await sb.from("reports").select("id, status, photo_path, thumb_path").in("status", ["approved", "rejected", "promoted"]).not("photo_path", "is", null);
  for (const r of (left || []).filter(needsTidyUp)) await deleteOriginal(r).catch(() => {});
}

// ------------------------------------------------------------------ one report

async function openReport(row) {
  const id = ++view.openId;
  Object.assign(view, { row, work: null, boxes: [], busy: 0 });
  show("detail");
  window.scrollTo(0, 0);
  $("d-title").textContent = `${row.ref} · ${data.areaById[row.area_id]?.name || row.area_id}`;
  say("decide-status", []);
  say("suggestions", []);
  $("reason").value = "";
  $("d-note").value = row.note || "";
  $("checked").checked = false;
  const sel = $("d-problem");
  sel.innerHTML = data.routing.map((r) => `<option${r.problem_type === row.problem_type ? " selected" : ""}>${esc(r.problem_type)}</option>`).join("");
  const flags = (row.location_flags || []).map((f) => t(FLAG_KEYS[f] || f));
  const facts = [
    [t("review.f.status"), t(`review.tab.${row.status}`)],
    [t("review.f.received"), when(row.created_at)],
    [t("review.f.taken"), when(row.taken_at)],
    [t("review.f.place"), `${row.lat}, ${row.lng} (${t(`report.from.${row.location_source}`)})`],
    [t("review.f.flags"), flags.length ? flags.join("; ") : t("review.f.no_flags")],
  ];
  if (isFlagged(row)) facts.unshift([t("review.f.flagged"), t("review.flagged_fact", { reason: t(`flag.reason.${row.flag_reason}`), when: when(row.flagged_at) })]);
  $("facts").innerHTML = facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("") +
    `<dt></dt><dd><a href="https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lng}" target="_blank" rel="noopener noreferrer">${esc(t("panel.open_maps"))}</a></dd>`;
  showMap(row);
  updateApprove();

  say("find-status", [[t("review.photo_loading"), "busy"]]);
  try {
    const { data: s, error } = await sb.storage.from(PRIVATE).createSignedUrl(row.photo_path, 600);
    if (error) throw error;
    const resp = await fetch(s.signedUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const img = await loadPhoto(blob);
    if (id !== view.openId) return;
    const c = Object.assign(document.createElement("canvas"), { width: img.naturalWidth, height: img.naturalHeight });
    c.getContext("2d").drawImage(img, 0, 0);
    view.work = c;
  } catch (err) {
    if (id === view.openId) say("find-status", [[t("review.photo_failed", { message: err.message || err }), "bad"]]);
    return;
  }
  draw();
  findAll(id);
}

function showMap(row) {
  if (!view.map) {
    view.map = L.map("review-map", { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(view.map);
    if (zones) L.geoJSON(zones, { style: { color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), weight: 2, fillOpacity: 0.05 }, interactive: false }).addTo(view.map);
    view.marker = L.marker([row.lat, row.lng]).addTo(view.map);
  }
  view.marker.setLatLng([row.lat, row.lng]);
  view.map.setView([row.lat, row.lng], 17);
  setTimeout(() => view.map.invalidateSize(), 50);
}

// Faces (blurred) and number plates (suggestions), both in the background.
async function findAll(id) {
  const lines = {};
  const update = () => say("find-status", [lines.faces, lines.plates]);
  const run = async (key, load, kind, pad) => {
    const t0 = performance.now();
    lines[key] = [t(`review.${key}_finding`), "busy"];
    update();
    view.busy++;
    updateApprove();
    try {
      const found = await (await load())(view.work);
      if (id !== view.openId) return;
      for (const b of found) view.boxes.push(newBox(padBox(b, view.work.width, view.work.height, pad), kind));
      lines[key] = [t(`review.${key}_found`, { n: found.length, s: secs(t0) }), found.length ? "ok" : ""];
    } catch {
      if (id === view.openId) lines[key] = [t(`review.${key}_failed`), "bad"];
    } finally {
      if (id === view.openId) { view.busy--; update(); draw(); }
    }
  };
  await Promise.all([
    run("faces", async () => (await import("../features/report-faces.js")).findFaces, "face", 0.3),
    run("plates", async () => (await import("../features/review-plates.js")).findPlates, "plate", 0.15),
  ]);
}

// ------------------------------------------------------------------ drawing and editing boxes

let drag = null;
function draw() {
  const c = $("photo");
  if (!view.work) return;
  if (c.width !== view.work.width || c.height !== view.work.height) Object.assign(c, { width: view.work.width, height: view.work.height });
  const ctx = c.getContext("2d");
  ctx.drawImage(blurredCopy(view.work, view.boxes.map((b) => ({ ...b, on: b.state === "on" }))), 0, 0);
  const line = Math.max(2, Math.round(c.width / 300));
  const colour = { on: "#ffd400", off: "#ffffff", ask: "#ff7a00" };
  const outline = (b, state) => {
    ctx.setLineDash(state === "on" ? [] : [line * 3, line * 2]);
    ctx.lineWidth = line + 2; ctx.strokeStyle = "rgba(0,0,0,.65)"; ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.lineWidth = line; ctx.strokeStyle = colour[state]; ctx.strokeRect(b.x, b.y, b.w, b.h);
  };
  for (const b of view.boxes) outline(b, b.state);
  // Small suggestions (a plate 30 px wide) are easy to miss: ring them so they stand out.
  const ring = Math.round(c.width * 0.035);
  ctx.lineWidth = line * 1.5;
  ctx.strokeStyle = colour.ask;
  for (const b of view.boxes.filter((x) => x.state === "ask")) {
    ctx.beginPath();
    ctx.arc(b.x + b.w / 2, b.y + b.h / 2, Math.max(ring, Math.hypot(b.w, b.h) / 2 + line * 4), 0, 2 * Math.PI);
    ctx.stroke();
  }
  if (drag && drag.now) outline(boxFromDrag(drag.start, drag.now, c.width, c.height), "on");
  ctx.setLineDash([]);
  renderSuggestions();
  updateApprove();
}

function renderSuggestions() {
  const plates = view.boxes.map((b, i) => [b, i]).filter(([b]) => b.kind === "plate");
  $("suggestions").innerHTML = plates.map(([b, i], k) => `
    <li class="${b.state}"><span>${esc(t("review.suggestion", { n: k + 1 }))} <span class="meta">${esc(t(`review.state.${b.state}`))}</span></span>
      <span class="actions"><button type="button" class="btn btn-small" data-i="${i}" data-state="on">${esc(t("review.blur"))}</button>
      <button type="button" class="btn btn-quiet btn-small" data-i="${i}" data-state="off">${esc(t("review.not_private"))}</button></span></li>`).join("");
  $("suggestions").querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
    view.boxes[Number(btn.dataset.i)].state = btn.dataset.state;
    draw();
  }));
}

function updateApprove() {
  const a = approveState(view.boxes, { busy: view.busy > 0, hasPhoto: Boolean(view.work), checked: $("checked").checked });
  $("approve").disabled = !a.enabled;
  $("approve-help").textContent = t(a.help, { n: a.n });
}

function point(e) {
  const c = $("photo"), r = c.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height, scale: r.width / c.width };
}

function wireCanvas() {
  const c = $("photo");
  c.addEventListener("pointerdown", (e) => { if (!view.work) return; c.setPointerCapture(e.pointerId); drag = { start: point(e), now: null }; });
  c.addEventListener("pointermove", (e) => { if (drag) { drag.now = point(e); draw(); } });
  c.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const end = point(e);
    if (Math.hypot(end.x - drag.start.x, end.y - drag.start.y) * end.scale < 8) {
      const hit = boxAt(view.boxes, end);
      if (hit) hit.state = nextState(hit.state);
    } else {
      const b = boxFromDrag(drag.start, end, c.width, c.height);
      if (b.w * end.scale >= 6 && b.h * end.scale >= 6) view.boxes.push(newBox(b, "hand"));
    }
    drag = null;
    draw();
  });
  c.addEventListener("pointercancel", () => { drag = null; draw(); });
}

// ------------------------------------------------------------------ deciding

// Update the row only if it is still undecided (two reviewers may have it open at once).
async function setRow(row, changes) {
  const { data: d, error } = await sb.from("reports").update(changes).eq("id", row.id).in("status", DECIDABLE).select("id");
  if (error) throw new Error(error.message);
  if (!d || !d.length) throw new Error(t("review.already_decided"));
}

// Delete the resident's original, then record that it is gone.
async function deleteOriginal(row) {
  const paths = [row.photo_path, row.thumb_path].filter(Boolean);
  if (paths.length) {
    const { error } = await sb.storage.from(PRIVATE).remove(paths);
    if (error) throw new Error(error.message);
  }
  const { error } = await sb.from("reports").update({ photo_path: null, thumb_path: null }).eq("id", row.id);
  if (error) throw new Error(error.message);
}

async function decide(decision) {
  const row = view.row;
  const steps = [];
  const progress = (text, kind = "busy") => { steps.push([text, kind]); say("decide-status", steps); };
  for (const b of ["approve", "visit", "reject"]) $(b).disabled = true;
  try {
    const edits = { note: $("d-note").value.trim(), problemType: $("d-problem").value };
    const { data: now } = await sb.from("reports").select("status").eq("id", row.id).single();
    if (!now || !DECIDABLE.includes(now.status)) throw new Error(t("review.already_decided"));
    if (decision === "approved") {
      progress(t("review.step.publish"));
      const { photo, thumb } = await uploadFiles(blurredCopy(view.work, view.boxes.map((b) => ({ ...b, on: b.state === "on" }))));
      const paths = publicPaths(row.ref, photo.type);
      for (const [path, file] of [[paths.photo, photo], [paths.thumb, thumb]]) {
        const { error } = await sb.storage.from(PUBLIC).upload(path, file, { contentType: file.type, upsert: true });
        if (error) throw new Error(error.message);
      }
      const url = (p) => sb.storage.from(PUBLIC).getPublicUrl(p).data.publicUrl;
      await setRow(row, decisionRow("approved", { ...edits, publicPhoto: url(paths.photo), publicThumb: url(paths.thumb) }));
    } else if (decision === "rejected") {
      if (!$("reason").value) throw new Error(t("review.reason_needed"));
      progress(t("review.step.save"));
      await setRow(row, decisionRow("rejected", { ...edits, reason: $("reason").value }));
    } else {
      progress(t("review.step.save"));
      await setRow(row, decisionRow("needs_visit", edits));
    }
    if (decision !== "needs_visit") {
      progress(t("review.step.delete"));
      await deleteOriginal(row);
    }
    progress(t(`review.done.${decision}`, { ref: row.ref }), "ok");
    rows = rows.filter((r) => r.id !== row.id);
    if (decision === "needs_visit") rows.push({ ...row, status: "needs_visit" });
    setTimeout(() => { if (view.row === row) loadQueue(); }, 1500);
  } catch (err) {
    progress(t("review.failed", { message: err.message || err }), "bad");
  } finally {
    for (const b of ["visit", "reject"]) $(b).disabled = false;
    updateApprove();
  }
}

// ------------------------------------------------------------------ start

async function start() {
  await initI18n();
  document.title = t("review.title");
  if (!config.supabase.url || !config.supabase.anonKey || !window.supabase) return message(t("review.not_ready"));
  try {
    data = await loadData();
    const res = await fetch(`${config.dataPath}report-zones.geojson`, { cache: "no-cache" });
    zones = res.ok ? await res.json() : null;
  } catch (err) {
    return message(t("common.load_error", { message: err.message }));
  }
  sb = window.supabase.createClient(config.supabase.url, config.supabase.anonKey, {
    auth: { persistSession: true, storageKey: "water-pollution-review", detectSessionInUrl: false },
  });
  $("login").addEventListener("submit", signIn);
  $("sign-out").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
  $("back").addEventListener("click", () => { view.openId++; loadQueue(); });
  $("approve").addEventListener("click", () => decide("approved"));
  $("checked").addEventListener("change", updateApprove);
  $("visit").addEventListener("click", () => decide("needs_visit"));
  $("reject").addEventListener("click", () => decide("rejected"));
  wireCanvas();
  const { data: s } = await sb.auth.getSession();
  await signedIn(s.session);
}

start();
