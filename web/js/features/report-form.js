// Report page logic that needs no page or network, so it can be tested with node --test
// (tests/js/report-form.test.mjs). The rules the server also checks live in report-rules.js;
// this file holds what only the phone does: spotting a stamp, laying out face-search tiles,
// choosing where the location came from, and turning server answers into messages.

import { distanceM, LIMITS } from "./report-rules.js";

export const PHOTO_SIDE = 1600;   // longest side of the uploaded photo (server allows up to 2000)
export const THUMB_SIDE = 400;    // longest side of the thumbnail (server allows up to 500)
export const STAMP_BAND = 0.30;   // the stamp sits in the bottom 30% of the photo
export const STAMP_CHECK_SIDE = 1280; // the stamp check looks at a copy this size (long side)
export const STAMP_SCORE_MIN = 2.0;
export const STAMP_THRESHOLDS = [225, 200, 180]; // grey levels that count as the stamp's white ink
export const FACE_CONFIDENCE = 0.7;
export const FACE_GRID = 3;       // whole photo + 3 x 3 overlapping tiles

const isPoint = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

// ------------------------------------------------------------------ printed stamp

// Grey value of an RGBA pixel (same weights as the usual "luma").
export const grey = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// RGBA bytes -> one grey byte per pixel.
export function toGrey(rgba, w, h) {
  const out = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = grey(rgba[j], rgba[j + 1], rgba[j + 2]);
  return out;
}

// How much the bottom of the photo looks like a GPS-camera stamp: the share (in %) of pixels in
// the bottom band that are bright white AND have a dark pixel within 2 px, i.e. white letters on
// a dark box. Plain white froth or sky scores low because it has no dark edge around it.
// grey: one byte per pixel of a copy of the photo, STAMP_CHECK_SIDE px on the long side.
// Tested in Chromium on 41 field photos (22 Oct 2026): all 28 stamped photos scored 2.36 or more;
// 11 of the 13 unstamped ones scored under 1.3 (the other two: bright white water from a pipe).
export function stampScore(greyPx, w, h) {
  const top = Math.floor(h * (1 - STAMP_BAND));
  const bh = h - top;
  if (w < 5 || bh < 5) return 0;
  // darkNear = some pixel <= 110 within a 5 x 5 window (min filter, done in two passes)
  const dark = new Uint8Array(w * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < w; x++) dark[y * w + x] = greyPx[(top + y) * w + x] <= 110 ? 1 : 0;
  const rows = new Uint8Array(w * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < w; x++) {
    let any = 0;
    for (let dx = -2; dx <= 2 && !any; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) any = dark[y * w + xx]; }
    rows[y * w + x] = any;
  }
  let hits = 0;
  for (let y = 0; y < bh; y++) for (let x = 0; x < w; x++) {
    if (greyPx[(top + y) * w + x] < 225) continue;
    let any = 0;
    for (let dy = -2; dy <= 2 && !any; dy++) { const yy = y + dy; if (yy >= 0 && yy < bh) any = rows[yy * w + x]; }
    hits += any;
  }
  return (hits / (w * bh)) * 100;
}

export const looksStamped = (score) => score >= STAMP_SCORE_MIN;

// Keep only the stamp's white letters: white text -> black, everything else -> white.
// Works in place on RGBA bytes (a canvas ImageData). Without this, busy backgrounds behind the
// stamp (froth, rubble) stopped 4 of 28 test stamps being read.
export function stampToInk(rgba, threshold = STAMP_THRESHOLDS[0]) {
  for (let j = 0; j < rgba.length; j += 4) {
    const v = grey(rgba[j], rgba[j + 1], rgba[j + 2]) >= threshold ? 0 : 255;
    rgba[j] = rgba[j + 1] = rgba[j + 2] = v;
    rgba[j + 3] = 255;
  }
  return rgba;
}

// The stamp is read up to three times (one per threshold). A location counts only when two
// readings give exactly the same numbers, and the same for the date: one misread digit
// (73.84 read as 79.84 in testing) must never move the pin. readings: parseStamp() results.
// Returns { lat, lng, takenAt } (nulls where no two readings agree).
export function agreedReading(readings) {
  const vote = (key) => {
    const seen = new Map();
    for (const r of readings) {
      const v = key(r);
      if (v === null) continue;
      seen.set(v, (seen.get(v) || 0) + 1);
      if (seen.get(v) >= 2) return v;
    }
    return null;
  };
  const place = vote((r) => (Number.isFinite(r.lat) && Number.isFinite(r.lng) ? `${r.lat},${r.lng}` : null));
  const [lat, lng] = place ? place.split(",").map(Number) : [null, null];
  return { lat, lng, takenAt: vote((r) => r.takenAt || null) };
}

// ------------------------------------------------------------------ sizes and faces

// Width and height that fit inside maxSide, keeping the shape. Never enlarges.
export function fitSize(w, h, maxSide) {
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

// Pieces of the photo to search for faces: the whole photo, then a grid of overlapping tiles
// (each 25% larger than a grid cell) so that small, distant faces look bigger to the model.
export function faceTiles(w, h, grid = FACE_GRID) {
  const tiles = [{ x: 0, y: 0, w, h }];
  if (grid < 2) return tiles;
  const tw = Math.min(w, (w / grid) * 1.25);
  const th = Math.min(h, (h / grid) * 1.25);
  for (let gy = 0; gy < grid; gy++) for (let gx = 0; gx < grid; gx++) {
    tiles.push({ x: Math.round((gx * (w - tw)) / (grid - 1)), y: Math.round((gy * (h - th)) / (grid - 1)), w: Math.round(tw), h: Math.round(th) });
  }
  return tiles;
}

// Overlap of two boxes, as a share of the smaller one. Boxes are {x, y, w, h} in pixels.
export function overlap(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const small = Math.min(a.w * a.h, b.w * b.h);
  return small > 0 ? (ix * iy) / small : 0;
}

// The same face found in several tiles counts once (the first, usually the whole-photo find).
export function mergeBoxes(boxes, limit = 0.4) {
  const keep = [];
  for (const b of boxes) if (!keep.some((k) => overlap(k, b) > limit)) keep.push(b);
  return keep;
}

// A face box widened on every side (hair, ears, chin), kept inside the photo.
export function padBox(b, w, h, pad = 0.3) {
  const x = Math.max(0, b.x - b.w * pad);
  const y = Math.max(0, b.y - b.h * pad);
  return { x, y, w: Math.min(w, b.x + b.w * (1 + pad)) - x, h: Math.min(h, b.y + b.h * (1 + pad)) - y };
}

// A box drawn by dragging from one corner to the other, in any direction, inside the photo.
export function boxFromDrag(a, b, w, h) {
  const x1 = Math.max(0, Math.min(a.x, b.x)), y1 = Math.max(0, Math.min(a.y, b.y));
  const x2 = Math.min(w, Math.max(a.x, b.x)), y2 = Math.min(h, Math.max(a.y, b.y));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// Mosaic block size for blurring a box: big enough that a face cannot be recognised.
export const mosaicBlock = (box) => Math.max(6, Math.round(Math.min(box.w, box.h) / 6));

// ------------------------------------------------------------------ location

// Where the confirmed pin came from: the first piece of evidence (stamp, then the photo's hidden
// GPS, then the phone's location) within 200 m of the pin; "pin" if the resident placed it alone.
export function locationSource(pin, evidence = {}) {
  for (const key of ["stamp", "photo", "device"]) {
    const e = evidence[key];
    if (!isPoint(e)) continue;
    const slack = key === "device" ? Math.min(Number(e.accuracy) || 0, 500) : 0;
    if (distanceM(pin, e) <= LIMITS.farMetres + slack) return key;
  }
  return "pin";
}

// Where to put the pin first: stamp, then photo GPS, then phone location; null = let the resident tap.
export function firstPin(evidence = {}) {
  for (const key of ["stamp", "photo", "device"]) if (isPoint(evidence[key])) return { lat: evidence[key].lat, lng: evidence[key].lng, from: key };
  return null;
}

// GPS from the photo's hidden data (exifr's output), or null. Ignores 0,0 (a phone with no fix).
export function exifPoint(ex) {
  if (!ex) return null;
  const lat = Number(ex.latitude), lng = Number(ex.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// ------------------------------------------------------------------ the report

// The "report" field sent to the server (checked again there with checkReport).
export function reportFields({ pin, evidence = {}, problemType, note, takenAt, consent }) {
  const clean = (p, extra = {}) => (isPoint(p) ? { lat: round6(p.lat), lng: round6(p.lng), ...extra } : undefined);
  return {
    lat: round6(pin.lat),
    lng: round6(pin.lng),
    problem_type: problemType,
    location_source: locationSource(pin, evidence),
    consent: consent === true,
    note: note || "",
    taken_at: takenAt || null,
    evidence: {
      stamp: clean(evidence.stamp),
      photo: clean(evidence.photo),
      device: clean(evidence.device, Number.isFinite(evidence.device?.accuracy) ? { accuracy: Math.round(evidence.device.accuracy) } : {}),
    },
  };
}
const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;

// Server and check codes -> i18n keys for the message to show. Unknown codes get a general message.
const KNOWN = new Set([
  "network", "server_error", "not_configured", "origin_not_allowed", "too_large", "bad_form", "bad_report",
  "spam_check_missing", "spam_check_expired", "spam_check_failed", "spam_check_reused",
  "rate_hour", "rate_day", "rate_site",
  "no_location", "outside_report_zones", "unknown_problem_type", "unknown_location_source", "no_consent",
  "note_too_long", "bad_date", "future_date", "photo_missing",
  "not_jpeg_or_webp", "too_many_pixels", "has_hidden_data", "unreadable",
]);
export function errorKeys(error, details = []) {
  const codes = error === "invalid" && details.length ? details : [error];
  const keys = codes.map((c) => {
    const base = String(c).replace(/^(photo|thumb)_/, "");
    return KNOWN.has(base) ? `report.err.${base}` : "report.err.generic";
  });
  return [...new Set(keys)];
}
