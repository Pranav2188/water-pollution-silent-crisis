// Run from the repo root: node --test tests/js/*.test.mjs
// Phase 4 report rules (web/js/features/report-rules.js), used by the report page and,
// as an identical copy, by the submit-report Supabase function.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  checkImage, checkReport, checkTakenAt, cleanNote, distanceM, imageInfo, LIMITS, locationFlags,
  parseStamp, zoneFor,
} from "../../web/js/features/report-rules.js";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root));
const json = (p) => JSON.parse(read(p));
const zones = json("web/data/report-zones.geojson");
const hotspots = json("web/data/hotspots.json");
const problemTypes = json("web/data/routing.json").map((r) => r.problem_type);
const fixture = (name) => new Uint8Array(read(`tests/js/fixtures/${name}`));

test("the function's copies are identical to the website's", () => {
  assert.equal(read("supabase/functions/submit-report/report-rules.js").toString(),
    read("web/js/features/report-rules.js").toString(), "run: cp web/js/features/report-rules.js supabase/functions/submit-report/");
  assert.equal(read("supabase/functions/submit-report/report-zones.json").toString(),
    read("web/data/report-zones.geojson").toString(), "run: python3 tools/report_zones.py");
});

test("every published spot lies inside its own area's report zone", () => {
  for (const h of hotspots) assert.equal(zoneFor(h.lat, h.lng, zones), h.area_id, `${h.id} at ${h.lat}, ${h.lng}`);
});

test("places outside the three areas are refused", () => {
  for (const [name, lat, lng] of [["Katraj", 18.448, 73.858], ["Pashan", 18.539, 73.79], ["Hinjewadi", 18.59, 73.738],
    ["Mumbai", 19.076, 72.877], ["Alandi, 3 km east", 18.677, 73.92]]) {
    assert.equal(zoneFor(lat, lng, zones), null, name);
  }
});

test("distances", () => {
  assert.ok(Math.abs(distanceM({ lat: 18.546297, lng: 73.951499 }, { lat: 18.546314, lng: 73.950716 }) - 82.6) < 1);
});

test("location warnings for the reviewer", () => {
  const pin = { lat: 18.546297, lng: 73.951499 };
  assert.deepEqual(locationFlags(pin, {}), ["pin_only"]);
  assert.deepEqual(locationFlags(pin, { stamp: { lat: 18.5463, lng: 73.9515 } }), []);
  assert.deepEqual(locationFlags(pin, { stamp: { lat: 18.55, lng: 73.9515 } }), ["pin_far_from_stamp"]);
  // a phone location 300 m away with 150 m accuracy is still "near enough" (200 + 150)
  assert.deepEqual(locationFlags(pin, { device: { lat: 18.5490, lng: 73.9515, accuracy: 150 } }), []);
  assert.deepEqual(locationFlags(pin, { device: { lat: 18.5520, lng: 73.9515, accuracy: 150 } }), ["pin_far_from_device"]);
});

test("reading a GPS Map Camera stamp (text as read from the Alandi photos)", () => {
  const s = parseStamp("Alandi, Maharashtra, India Mvgv+hg5, Alandi\nLat 18.676874° Long 73.893992°\nFriday, 09/10/2026 05:35 PM GMT +05:30");
  assert.deepEqual(s, { lat: 18.676874, lng: 73.893992, takenAt: "2026-10-09T12:05:00.000Z" });
  assert.deepEqual(parseStamp("Lat 18.677444° Long 73.88996°"), { lat: 18.677444, lng: 73.88996, takenAt: null });
  assert.deepEqual(parseStamp("no stamp here"), { lat: null, lng: null, takenAt: null });
});

test("date taken: future refused, old flagged", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  assert.equal(checkTakenAt("2026-10-23T12:00:00Z", now).error, "future_date");
  assert.deepEqual(checkTakenAt("2026-05-01T12:00:00Z", now).flags, ["old_photo"]);
  assert.deepEqual(checkTakenAt("2026-10-09T12:05:00Z", now), { takenAt: "2026-10-09T12:05:00.000Z", flags: [], error: null });
});

test("notes: cleaned, contact details flagged, length limited", () => {
  assert.deepEqual(cleanNote("  foam \u0007 near   the weir "), { note: "foam near the weir", flags: [], tooLong: false });
  assert.deepEqual(cleanNote("call me on 98765 43210").flags, ["note_has_contact"]);
  assert.deepEqual(cleanNote("mail x.y@gmail.com").flags, ["note_has_contact"]);
  assert.equal(cleanNote("a".repeat(LIMITS.noteChars + 1)).tooLong, true);
});

test("images: type, size and hidden data", () => {
  assert.deepEqual(imageInfo(fixture("clean.jpg")), { type: "jpeg", width: 160, height: 120, hasMetadata: false });
  assert.deepEqual(imageInfo(fixture("with-gps.jpg")), { type: "jpeg", width: 160, height: 120, hasMetadata: true });
  assert.deepEqual(imageInfo(fixture("clean.webp")), { type: "webp", width: 160, height: 120, hasMetadata: false });
  assert.deepEqual(imageInfo(fixture("lossless.webp")), { type: "webp", width: 160, height: 120, hasMetadata: false });
  assert.deepEqual(imageInfo(fixture("with-gps.webp")), { type: "webp", width: 160, height: 120, hasMetadata: true });
  assert.deepEqual(checkImage(fixture("clean.jpg")), []);
  assert.deepEqual(checkImage(fixture("clean.webp"), "thumb"), []);
  assert.deepEqual(checkImage(fixture("with-gps.jpg")), ["photo_has_hidden_data"]);
  assert.deepEqual(checkImage(fixture("picture.png")), ["photo_not_jpeg_or_webp"]);
  assert.deepEqual(checkImage(fixture("too-wide.jpg")), ["photo_too_many_pixels"]);
  assert.deepEqual(checkImage(fixture("too-wide.jpg"), "thumb"), ["thumb_too_many_pixels"]);
});

test("a whole report: accepted with clean values, or refused with reasons", () => {
  const ctx = { zones, problemTypes, now: new Date("2026-10-21T12:00:00Z") };
  const good = checkReport({
    lat: "18.676874", lng: 73.893992, problem_type: "Garbage dumping", location_source: "stamp",
    consent: true, note: " Waste caught on the weir ", taken_at: "2026-10-09T12:05:00Z",
    evidence: { stamp: { lat: 18.676874, lng: 73.893992 } },
  }, ctx);
  assert.deepEqual(good.errors, []);
  assert.deepEqual(good.report, {
    area_id: "AREA-03", problem_type: "Garbage dumping", lat: 18.676874, lng: 73.893992, location_source: "stamp",
    location_flags: [], taken_at: "2026-10-09T12:05:00.000Z", note: "Waste caught on the weir",
  });
  const bad = checkReport({ lat: 18.448, lng: 73.858, problem_type: "Aliens", location_source: "gps", consent: false }, ctx);
  assert.deepEqual(bad.errors, ["outside_report_zones", "unknown_problem_type", "unknown_location_source", "no_consent"]);
  assert.equal(bad.report, null);
  assert.deepEqual(checkReport({ problem_type: "Garbage dumping", location_source: "pin", consent: true }, ctx).errors, ["no_location"]);
});
