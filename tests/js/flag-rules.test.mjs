// Run from the repo root: node --test tests/js/*.test.mjs
// Phase 4, Milestone 4: "Report this photo" rules (web/js/features/flag-rules.js, also used as an
// identical copy by the flag-report Supabase function) and the public resident-report helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFlag, FLAG_REASONS, publicFileName } from "../../web/js/features/flag-rules.js";
import { istDay, refFromHash, validReport } from "../../web/js/features/resident-reports.js";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root)).toString();
const en = JSON.parse(read("web/i18n/en.json"));
const migration = read("supabase/migrations/006_report_this_photo.sql");

test("the function's copy is identical to the website's", () => {
  assert.equal(read("supabase/functions/flag-report/flag-rules.js"), read("web/js/features/flag-rules.js"),
    "run: cp web/js/features/flag-rules.js supabase/functions/flag-report/");
});

test("every flag reason has a label and is allowed by the database", () => {
  for (const k of FLAG_REASONS) {
    assert.ok(en[`flag.reason.${k}`], `flag.reason.${k} missing from en.json`);
    assert.match(migration, new RegExp(`'${k}'`), `${k} missing from migration 006`);
  }
});

test("checkFlag accepts a reference and a known reason, nothing else", () => {
  assert.deepEqual(checkFlag({ ref: "RPT-00005", reason: "face" }), { errors: [], flag: { ref: "RPT-00005", reason: "face" } });
  assert.deepEqual(checkFlag({ ref: " rpt-00012 ", reason: "plate" }).flag, { ref: "RPT-00012", reason: "plate" });
  assert.deepEqual(checkFlag({ ref: "RPT-5", reason: "face" }).errors, ["bad_ref"]);
  assert.deepEqual(checkFlag({ ref: "HS-01", reason: "face" }).errors, ["bad_ref"]);
  assert.deepEqual(checkFlag({ ref: "RPT-00005", reason: "I don't like it" }).errors, ["bad_reason"]);
  assert.deepEqual(checkFlag(null).errors, ["bad_ref", "bad_reason"]);
  assert.deepEqual(checkFlag({ ref: ["RPT-00005"], reason: { x: 1 } }).errors, ["bad_ref", "bad_reason"]);
});

test("publicFileName only accepts this report's own published files", () => {
  const base = "https://enungxucvdqqeyzpyyxl.supabase.co/storage/v1/object/public/report-public/";
  assert.equal(publicFileName(`${base}RPT-00005.webp`, "RPT-00005"), "RPT-00005.webp");
  assert.equal(publicFileName(`${base}RPT-00005_thumb.jpg?v=1`, "RPT-00005"), "RPT-00005_thumb.jpg");
  assert.equal(publicFileName(`${base}RPT-00006.webp`, "RPT-00005"), null, "another report's file");
  assert.equal(publicFileName(`${base}..%2Fwaiting%2Fx.webp`, "RPT-00005"), null, "a path outside the folder");
  assert.equal(publicFileName("https://evil.example/storage/v1/object/public/report-photos/RPT-00005.webp", "RPT-00005"), null, "the private folder");
  assert.equal(publicFileName(null, "RPT-00005"), null);
});

test("links from the report page open a report on the map", () => {
  assert.equal(refFromHash("#RPT-00005"), "RPT-00005");
  assert.equal(refFromHash("#rpt-00012"), "RPT-00012");
  assert.equal(refFromHash("#HS-01"), null);
  assert.equal(refFromHash(""), null);
});

test("dates are the day in Pune, not in UTC", () => {
  assert.equal(istDay("2026-10-09T20:00:00Z"), "2026-10-10", "1:30 am IST on 10 Oct");
  assert.equal(istDay("2026-10-10T03:06:00Z"), "2026-10-10");
  assert.equal(istDay(null), "");
  assert.equal(istDay("not a date"), "");
});

test("only complete published rows are shown", () => {
  const ok = { ref: "RPT-00005", lat: 18.5, lng: 73.9, public_photo_url: "https://x/p.webp", public_thumb_url: "https://x/t.webp" };
  assert.equal(validReport(ok), true);
  assert.equal(validReport({ ...ok, public_photo_url: null }), false);
  assert.equal(validReport({ ...ok, lat: "18.5" }), false);
  assert.equal(validReport({ ...ok, ref: "<img>" }), false);
  assert.equal(validReport(null), false);
});
