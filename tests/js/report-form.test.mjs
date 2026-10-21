// Run from the repo root: node --test tests/js/*.test.mjs
// Phase 4 report page logic (web/js/features/report-form.js): stamp spotting, face tiles,
// where the location came from, the fields sent to the server, error messages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  agreedReading, boxFromDrag, errorKeys, exifPoint, faceTiles, firstPin, fitSize, locationSource, looksStamped, mergeBoxes,
  mosaicBlock, overlap, padBox, reportFields, stampScore, stampToInk, toGrey,
} from "../../web/js/features/report-form.js";
import { checkReport } from "../../web/js/features/report-rules.js";

const root = new URL("../../", import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root)));
const en = json("web/i18n/en.json");

// A grey test picture: background value bg, with an optional dark box holding white "letters".
function picture({ w = 200, h = 100, bg = 120, box = false, froth = false }) {
  const px = new Uint8Array(w * h).fill(bg);
  if (box) {
    for (let y = 75; y < 98; y++) for (let x = 60; x < 195; x++) px[y * w + x] = 50;              // dark box
    for (let y = 80; y < 93; y += 4) for (let x = 65; x < 190; x += 3) px[y * w + x] = px[y * w + x + 1] = 250; // letters
  }
  if (froth) for (let y = 72; y < 100; y++) for (let x = 0; x < w; x++) px[y * w + x] = 245;          // white foam, no dark edges
  return px;
}

test("a GPS-camera stamp is spotted; bare water and white froth are not", () => {
  const stamped = stampScore(picture({ box: true }), 200, 100);
  assert.ok(looksStamped(stamped), `stamp scored ${stamped}`);
  assert.equal(looksStamped(stampScore(picture({}), 200, 100)), false);
  assert.equal(looksStamped(stampScore(picture({ froth: true }), 200, 100)), false);
  assert.equal(stampScore(new Uint8Array(4), 2, 2), 0);
});

test("a stamp reading counts only when two readings agree", () => {
  const right = { lat: 18.515442, lng: 73.844508, takenAt: "2026-10-10T03:09:00.000Z" };
  const misread = { lat: 18.515442, lng: 79.844508, takenAt: "2026-10-10T03:09:00.000Z" };   // seen in testing
  const none = { lat: null, lng: null, takenAt: null };
  assert.deepEqual(agreedReading([right, right]), right);
  assert.deepEqual(agreedReading([misread, right, right]), right);
  assert.deepEqual(agreedReading([misread, right, none]), { lat: null, lng: null, takenAt: right.takenAt });
  assert.deepEqual(agreedReading([right]), { lat: null, lng: null, takenAt: null });
  assert.deepEqual(agreedReading([right, { ...right, takenAt: null }]), { lat: right.lat, lng: right.lng, takenAt: null });
});

test("stamp clean-up keeps only white letters, as black ink", () => {
  const rgba = new Uint8ClampedArray([250, 250, 250, 255, 40, 40, 40, 255, 200, 200, 200, 128]);
  assert.deepEqual([...stampToInk(rgba.slice())], [0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  assert.deepEqual([...stampToInk(rgba.slice(), 180)], [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
  assert.deepEqual([...toGrey(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1)], [255, 0]);
});

test("sizes shrink to fit, never grow", () => {
  assert.deepEqual(fitSize(4000, 3000, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(fitSize(960, 1280, 400), { w: 300, h: 400 });
  assert.deepEqual(fitSize(800, 600, 1600), { w: 800, h: 600 });
});

test("face search: whole photo plus 9 overlapping tiles that cover it", () => {
  const tiles = faceTiles(1600, 1200);
  assert.equal(tiles.length, 10);
  assert.deepEqual(tiles[0], { x: 0, y: 0, w: 1600, h: 1200 });
  for (const t of tiles) assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.w <= 1600 && t.y + t.h <= 1200, JSON.stringify(t));
  assert.equal(Math.max(...tiles.map((t) => t.x + t.w)), 1600);
  assert.equal(faceTiles(100, 100, 1).length, 1);
});

test("the same face found twice counts once; boxes are padded and kept inside the photo", () => {
  const a = { x: 100, y: 100, w: 40, h: 40 }, b = { x: 104, y: 102, w: 38, h: 40 }, c = { x: 500, y: 100, w: 40, h: 40 };
  assert.ok(overlap(a, b) > 0.8);
  assert.equal(overlap(a, c), 0);
  assert.deepEqual(mergeBoxes([a, b, c]), [a, c]);
  assert.deepEqual(padBox({ x: 0, y: 10, w: 20, h: 20 }, 30, 100), { x: 0, y: 4, w: 26, h: 32 });
  assert.deepEqual(boxFromDrag({ x: 50, y: 60 }, { x: 10, y: -5 }, 100, 100), { x: 10, y: 0, w: 40, h: 60 });
  assert.equal(mosaicBlock({ w: 30, h: 12 }), 6);
  assert.equal(mosaicBlock({ w: 300, h: 240 }), 40);
});

test("where the location came from", () => {
  const stamp = { lat: 18.677457, lng: 73.889959 };
  assert.equal(locationSource({ ...stamp }, { stamp }), "stamp");
  // nudged 50 m: still the stamp's location
  assert.equal(locationSource({ lat: 18.677907, lng: 73.889959 }, { stamp }), "stamp");
  // moved 1 km: the resident placed it
  assert.equal(locationSource({ lat: 18.686457, lng: 73.889959 }, { stamp }), "pin");
  // phone location 300 m away but only accurate to 150 m: still counts as the phone's
  assert.equal(locationSource({ lat: 18.680157, lng: 73.889959 }, { device: { ...stamp, accuracy: 150 } }), "device");
  assert.equal(locationSource(stamp, {}), "pin");
  assert.deepEqual(firstPin({ device: { lat: 1, lng: 2 }, photo: { lat: 3, lng: 4 } }), { lat: 3, lng: 4, from: "photo" });
  assert.equal(firstPin({}), null);
  assert.deepEqual(exifPoint({ latitude: 18.5, longitude: 73.9 }), { lat: 18.5, lng: 73.9 });
  assert.equal(exifPoint({ latitude: 0, longitude: 0 }), null);
  assert.equal(exifPoint(undefined), null);
});

test("the fields sent are accepted by the server's own check", () => {
  const zones = json("web/data/report-zones.geojson");
  const problemTypes = json("web/data/routing.json").map((r) => r.problem_type);
  const stamp = { lat: 18.677457, lng: 73.889959 };
  const fields = reportFields({
    pin: { lat: 18.6774571, lng: 73.8899592 }, evidence: { stamp, device: { lat: 18.6775, lng: 73.89, accuracy: 23.6 } },
    problemType: problemTypes[0], note: "Foam below the weir", takenAt: "2026-10-09T12:12:00.000Z", consent: true,
  });
  assert.equal(fields.location_source, "stamp");
  assert.deepEqual(fields.evidence.device, { lat: 18.6775, lng: 73.89, accuracy: 24 });
  assert.equal(fields.evidence.photo, undefined);
  const { errors, report } = checkReport(JSON.parse(JSON.stringify(fields)), { zones, problemTypes, now: new Date("2026-10-22T00:00:00Z") });
  assert.deepEqual(errors, []);
  assert.equal(report.area_id, "AREA-03");
  assert.deepEqual(report.location_flags, []);
});

test("every server answer has a message", () => {
  assert.deepEqual(errorKeys("rate_hour"), ["report.err.rate_hour"]);
  assert.deepEqual(errorKeys("invalid", ["outside_report_zones", "photo_has_hidden_data", "thumb_has_hidden_data"]),
    ["report.err.outside_report_zones", "report.err.has_hidden_data"]);
  assert.deepEqual(errorKeys("something_new"), ["report.err.generic"]);
  const codes = ["network", "server_error", "not_configured", "origin_not_allowed", "too_large", "bad_form", "bad_report",
    "spam_check_missing", "spam_check_expired", "spam_check_failed", "spam_check_reused", "rate_hour", "rate_day", "rate_site",
    "no_location", "outside_report_zones", "unknown_problem_type", "unknown_location_source", "no_consent", "note_too_long",
    "bad_date", "future_date", "photo_missing", "photo_not_jpeg_or_webp", "photo_too_many_pixels", "photo_unreadable", "generic"];
  for (const c of codes) for (const k of errorKeys(c)) assert.ok(en[k], `en.json has no text for ${k}`);
});
