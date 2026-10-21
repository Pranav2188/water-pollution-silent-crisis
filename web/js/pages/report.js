// Entry point for report.html: a resident sends a photo report (Phase 4, docs/phase-4.md).
//
// 1 photo: decoded on the phone; hidden GPS read (exifr); printed stamp read when it looks stamped
// 2 faces: found and blurred on the phone; the resident adds or switches off boxes
// 3 place: pin from the stamp / photo / phone, confirmed on the map, inside a report zone
// 4 details: problem type, note, agreement
// 5 send: spam puzzle (ALTCHA), then the blurred, re-drawn photo + thumbnail to submit-report
//
// Open when config.features.photoReports is true, or with ?pilot in the address for team testing.

import { config } from "../core/config.js";
import { loadData } from "../core/data.js";
import { esc } from "../core/format.js";
import { initI18n, t } from "../core/i18n.js";
import { errorKeys, exifPoint, firstPin, locationSource, looksStamped, padBox, reportFields } from "../features/report-form.js";
import { createPinMap } from "../features/report-map.js";
import { blurredCopy, loadPhoto, stampLikelihood, uploadFiles, workingCopy } from "../features/report-photo.js";
import { cleanNote, LIMITS, zoneFor } from "../features/report-rules.js";

const $ = (id) => document.getElementById(id);
const FUNCTION_URL = config.supabase.url ? `${config.supabase.url.replace(/\/$/, "")}/functions/v1/submit-report` : "";
const VENDOR = new URL("../../assets/vendor/", import.meta.url).href;
// During the pilot (?pilot in the address) each step also shows how long it took.
const PILOT = new URLSearchParams(location.search).has("pilot");
const took = (t0) => (PILOT ? ` (${((performance.now() - t0) / 1000).toFixed(1)} s)` : "");

const state = {
  photoId: 0,          // changes with every new photo, so late results for an old photo are ignored
  img: null,
  work: null,          // working canvas (at most 1600 px)
  boxes: [],           // {x, y, w, h, on, auto}
  facesBusy: false,
  evidence: {},        // stamp / photo / device: {lat, lng[, accuracy]}
  takenAt: { stamp: null, photo: null },
  pinByHand: false,    // once the resident moves the pin, new evidence does not move it (until a new photo)
  lines: {},           // status lines for the photo step
  sending: false,
};
let data, zones, pinMap;

// ------------------------------------------------------------------ small helpers

function say(listId, items) {
  $(listId).innerHTML = items.filter(Boolean).map(([text, kind = ""]) => `<li class="${kind}">${esc(text)}</li>`).join("");
}
const fixed = (n) => Number(n).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
const when = (iso) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

// ------------------------------------------------------------------ 1. photo

async function onPhoto(file) {
  const id = ++state.photoId;
  Object.assign(state, { img: null, work: null, boxes: [], facesBusy: false, takenAt: { stamp: null, photo: null }, lines: {}, pinByHand: false });
  delete state.evidence.stamp;
  delete state.evidence.photo;
  $("stamp-action").hidden = true;
  say("photo-status", []);
  say("faces-status", []);
  say("send-status", []);

  let img;
  try {
    img = await loadPhoto(file);
  } catch {
    if (id === state.photoId) say("photo-status", [[t("report.photo_error"), "bad"]]);
    $("faces-step").hidden = true;
    return;
  }
  if (id !== state.photoId) return;
  state.img = img;
  state.work = workingCopy(img);
  $("faces-step").hidden = false;
  drawPreview();
  const lines = state.lines;
  lines.ready = [t("report.photo_ready", { w: state.work.width, h: state.work.height }), "ok"];
  showLines();

  // Hidden GPS and date (often removed by the phone or WhatsApp; free to check).
  const exif = (async () => {
    try {
      const { default: exifr } = await import(`${VENDOR}exifr-7.1.3/exifr-lite.esm.mjs`);
      // Only the camera blocks; exifr's "lite" build has no tag-name lists, so "pick" cannot be used.
      const ex = await exifr.parse(file, { tiff: true, exif: true, gps: true, ifd1: false, interop: false, xmp: false, icc: false, iptc: false, jfif: false, ihdr: false }).catch(() => null);
      if (id !== state.photoId) return;
      const p = exifPoint(ex);
      if (p) { state.evidence.photo = p; state.lines.exif = [t("report.exif_found"), "ok"]; }
      const d = ex && ex.DateTimeOriginal instanceof Date && !Number.isNaN(+ex.DateTimeOriginal) ? ex.DateTimeOriginal : null;
      if (d) state.takenAt.photo = d.toISOString();
    } catch { /* no hidden data: fine */ }
  })();

  // The printed stamp, read automatically only when the photo looks stamped.
  const stamp = looksStamped(stampLikelihood(img)) ? readStampNow(id) : Promise.resolve(false);

  findFacesNow(id);
  const [, stampRead] = await Promise.all([exif, stamp]);
  if (id !== state.photoId) return;
  if (!stampRead) $("stamp-action").hidden = false;
  if (!lines.stamp && !stampRead) lines.stamp = [t("report.stamp_none")];
  showLines();
  pinFromEvidence();
}

function showLines() {
  const l = state.lines;
  say("photo-status", [l.ready, l.exif, l.stamp, l.time]);
}

async function readStampNow(id) {
  const lines = state.lines;
  const t0 = performance.now();
  lines.stamp = [t("report.stamp_reading"), "busy"];
  showLines();
  try {
    const { readStamp } = await import("../features/report-stamp.js");
    const s = await readStamp(state.img);
    if (id !== state.photoId) return false;
    if (s.takenAt) {
      state.takenAt.stamp = s.takenAt;
      lines.time = [t("report.stamp_time", { when: when(s.takenAt) })];
    }
    if (Number.isFinite(s.lat)) {
      state.evidence.stamp = { lat: s.lat, lng: s.lng };
      lines.stamp = [t("report.stamp_found", { lat: fixed(s.lat), lng: fixed(s.lng) }) + took(t0), "ok"];
      showLines();
      return true;
    }
    lines.stamp = [t("report.stamp_none") + took(t0)];
  } catch {
    if (id !== state.photoId) return false;
    lines.stamp = [t("report.stamp_failed"), "bad"];
  }
  showLines();
  return false;
}

// ------------------------------------------------------------------ 2. faces

async function findFacesNow(id) {
  const t0 = performance.now();
  state.facesBusy = true;
  say("faces-status", [[t("report.faces_finding"), "busy"]]);
  try {
    const { findFaces } = await import("../features/report-faces.js");
    const found = await findFaces(state.work);
    if (id !== state.photoId) return;
    state.boxes = found.map((b) => ({ ...padBox(b, state.work.width, state.work.height), on: true }));
    const n = state.boxes.length;
    say("faces-status", [[(n ? t("report.faces_found", { n }) : t("report.faces_none")) + took(t0), n ? "ok" : ""]]);
  } catch {
    if (id === state.photoId) say("faces-status", [[t("report.faces_unavailable"), "bad"]]);
  } finally {
    if (id === state.photoId) { state.facesBusy = false; drawPreview(); }
  }
}

// The photo as it will be sent (faces blurred). Residents do not edit the blur: anything the
// face finder missed is blurred by the reviewer before publishing (decided 22 Oct 2026).
function drawPreview() {
  const c = $("preview");
  if (!state.work) return;
  if (c.width !== state.work.width || c.height !== state.work.height) Object.assign(c, { width: state.work.width, height: state.work.height });
  c.getContext("2d").drawImage(blurredCopy(state.work, state.boxes), 0, 0);
}

// ------------------------------------------------------------------ 3. place

let movingPin = false;
function pinFromEvidence() {
  if (state.pinByHand) return;
  const p = firstPin(state.evidence);
  if (!p) return;
  movingPin = true;
  pinMap.setPin(p.lat, p.lng);
  movingPin = false;
}

function onPinMove(latlng) {
  if (!movingPin) state.pinByHand = true;
  showPlace();
}

function showPlace() {
  const p = pinMap.getPin();
  if (!p) return say("place-status", [[t("report.pin_none")]]);
  const pin = { lat: p.lat, lng: p.lng };
  const area = zoneFor(pin.lat, pin.lng, zones);
  const from = t(`report.from.${locationSource(pin, state.evidence)}`);
  say("place-status", [
    [`${t("report.pin_at", { lat: fixed(pin.lat.toFixed(6)), lng: fixed(pin.lng.toFixed(6)) })} (${from})`],
    area ? [t("report.in_zone", { area: data.areaById[area]?.name || area }), "ok"] : [t("report.out_of_zone"), "bad"],
  ]);
}

function useLocation() {
  if (!navigator.geolocation) return say("place-status", [[t("report.location_denied"), "bad"]]);
  say("place-status", [[t("report.location_asking"), "busy"]]);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      state.evidence.device = { lat, lng, accuracy };
      state.pinByHand = false;           // the resident asked for it: move the pin there
      movingPin = true;
      pinMap.setPin(lat, lng);
      movingPin = false;
      $("place-status").insertAdjacentHTML("beforeend", `<li>${esc(t("report.location_got", { m: Math.round(accuracy) }))}</li>`);
    },
    () => { say("place-status", [[t("report.location_denied"), "bad"]]); showPlace(); },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
  );
}

// ------------------------------------------------------------------ 4 + 5. details and send

function missing() {
  const p = pinMap.getPin();
  const list = [];
  if (!state.work) list.push("photo");
  else if (state.facesBusy) list.push("faces");
  if (!p) list.push("pin");
  else if (!zoneFor(p.lat, p.lng, zones)) list.push("zone");
  if (!$("problem").value) list.push("problem");
  if (!$("consent").checked) list.push("consent");
  return list;
}

async function spamPayload() {
  const widget = $("altcha");
  const field = $("report-form").querySelector('input[name="altcha"]');
  if (field && field.value && widget.getState && widget.getState() === "verified") return field.value;
  say("send-status", [[t("report.spam_wait"), "busy"]]);
  if (widget.getState && widget.getState() === "expired") widget.reset();
  const result = widget.verify ? await widget.verify() : null;
  return (result && result.payload) || (field && field.value) || "";
}

function showErrors(error, details) {
  say("send-status", errorKeys(error, details).map((k) => [t(k), "bad"]));
  if (/^spam_check_(expired|failed|missing)$/.test(error)) try { $("altcha").reset(); } catch { /* widget not ready */ }
}

async function send(e) {
  e.preventDefault();
  if (state.sending) return;
  const gaps = missing();
  if (gaps.length) return say("send-status", [[t("report.missing", { list: gaps.map((g) => t(`report.missing.${g}`)).join(", ") }), "bad"]]);
  const note = cleanNote($("note").value);
  if (note.tooLong) return showErrors("note_too_long");

  state.sending = true;
  $("send").disabled = true;
  try {
    const payload = await spamPayload();
    if (!payload) return showErrors("spam_check_missing");
    say("send-status", [[t("report.sending"), "busy"]]);
    let files;
    try {
      files = await uploadFiles(blurredCopy(state.work, state.boxes));
    } catch (err) {
      return showErrors(err.message === "too_large" ? "too_large" : "invalid", err.details || []);
    }
    const p = pinMap.getPin();
    const fields = reportFields({
      pin: { lat: p.lat, lng: p.lng }, evidence: state.evidence, problemType: $("problem").value,
      note: note.note, takenAt: state.takenAt.stamp || state.takenAt.photo, consent: $("consent").checked,
    });
    const ext = (b) => (b.type === "image/webp" ? "webp" : "jpg");
    const form = new FormData();
    form.append("altcha", payload);
    form.append("report", JSON.stringify(fields));
    form.append("photo", files.photo, `photo.${ext(files.photo)}`);
    form.append("thumb", files.thumb, `thumb.${ext(files.thumb)}`);

    let res;
    try {
      res = await fetch(FUNCTION_URL, { method: "POST", body: form });
    } catch {
      return showErrors("network");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ref) return showErrors(body.error || "server_error", body.details || []);

    $("report-form").hidden = true;
    $("done").hidden = false;
    $("done-ref").textContent = t("report.done_ref", { ref: body.ref });
    $("another").href = location.pathname + location.search;   // keeps ?pilot during the pilot
    $("done").scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    state.sending = false;
    $("send").disabled = false;
  }
}

// ------------------------------------------------------------------ start

async function start() {
  await initI18n();
  document.title = t("report.page_title");
  const open = config.features.photoReports || new URLSearchParams(location.search).has("pilot");
  if (!open || !FUNCTION_URL) {
    $("closed").textContent = t(open ? "report.not_ready" : "report.closed");
    $("closed").hidden = false;
    return;
  }

  try {
    data = await loadData();
    const res = await fetch(`${config.dataPath}report-zones.geojson`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`report-zones.geojson (${res.status})`);
    zones = await res.json();
  } catch (err) {
    $("closed").textContent = t("common.load_error", { message: err.message });
    $("closed").hidden = false;
    return;
  }

  // Spam puzzle widget: fetches its puzzle from the function, solves it in the background.
  const widget = $("altcha");
  widget.setAttribute("challenge", FUNCTION_URL);
  widget.setAttribute("configuration", JSON.stringify({ humanInteractionSignature: false }));
  import(`${VENDOR}altcha-3.2.4/altcha.min.js`).catch(() => { /* the send step reports a missing spam check */ });

  const select = $("problem");
  for (const r of data.routing) select.add(new Option(r.problem_type, r.problem_type));
  select.addEventListener("change", () => {
    $("problem-hint").textContent = data.routingByType[select.value]?.what_you_see || "";
  });
  const count = () => { $("note-count").textContent = t("report.note_count", { n: $("note").value.length, max: LIMITS.noteChars }); };
  $("note").addEventListener("input", count);
  count();

  $("report-form").hidden = false;
  pinMap = createPinMap("pin-map", zones, onPinMove);
  showPlace();
  // Start fetching the face finder now, while the resident chooses a photo (about 2.5 MB once).
  import("../features/report-faces.js").then((m) => m.preloadFaces()).catch(() => {});
  $("photo-input").addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) onPhoto(f); });
  $("read-stamp").addEventListener("click", async () => {
    if (!state.img) return;
    $("stamp-action").hidden = true;
    const id = state.photoId;
    const ok = await readStampNow(id);
    if (id !== state.photoId) return;
    if (!ok) $("stamp-action").hidden = false;
    pinFromEvidence();
  });
  $("use-location").addEventListener("click", useLocation);
  $("report-form").addEventListener("submit", send);
}

start();
