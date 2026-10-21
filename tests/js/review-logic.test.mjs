// Run from the repo root: node --test tests/js/*.test.mjs
// Phase 4 review page logic (web/js/features/review-logic.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  boxAt, decisionRow, FLAG_KEYS, letterbox, needsTidyUp, newBox, nextState, PLATE_CONFIDENCE, plateBoxes, publicPaths, readyToApprove,
} from "../../web/js/features/review-logic.js";

const en = JSON.parse(readFileSync(new URL("../../web/i18n/en.json", import.meta.url)));

test("faces start blurred, plates start as suggestions, hand boxes start blurred", () => {
  const b = { x: 1, y: 2, w: 3, h: 4 };
  assert.equal(newBox(b, "face").state, "on");
  assert.equal(newBox(b, "plate").state, "ask");
  assert.equal(newBox(b, "hand").state, "on");
  assert.equal(nextState("ask"), "on");
  assert.equal(nextState("on"), "off");
  assert.equal(nextState("off"), "on");
});

test("approving needs every suggestion decided", () => {
  const boxes = [newBox({ x: 0, y: 0, w: 5, h: 5 }, "face"), newBox({ x: 10, y: 0, w: 5, h: 5 }, "plate")];
  assert.deepEqual(readyToApprove(boxes), { ok: false, undecided: 1, blurred: 1 });
  boxes[1].state = "off";
  assert.deepEqual(readyToApprove(boxes), { ok: true, undecided: 0, blurred: 1 });
  assert.deepEqual(readyToApprove([]), { ok: true, undecided: 0, blurred: 0 });
});

test("tapping finds the top box", () => {
  const a = newBox({ x: 0, y: 0, w: 50, h: 50 }, "face"), b = newBox({ x: 20, y: 20, w: 50, h: 50 }, "hand");
  assert.equal(boxAt([a, b], { x: 30, y: 30 }), b);
  assert.equal(boxAt([a, b], { x: 5, y: 5 }), a);
  assert.equal(boxAt([a, b], { x: 90, y: 90 }), null);
});

test("plate model output is mapped back to the photo (same maths as open-image-models)", () => {
  const lb = letterbox(1024, 768, 640);              // 0.625 scale, 80 px grey bands top and bottom
  assert.deepEqual(lb, { r: 0.625, nw: 640, nh: 480, dw: 0, dh: 80, left: 0, top: 80 });
  const rows = new Float32Array([
    0, 100, 180, 200, 230, 0, 0.9,                   // a plate
    0, 300, 300, 340, 320, 0, 0.2,                   // below the confidence limit
  ]);
  assert.deepEqual(plateBoxes(rows, 2, 7, lb, { x: 50, y: 10 }), [{ x: 210, y: 170, w: 160, h: 80, score: rows[6] }]);
  assert.equal(PLATE_CONFIDENCE, 0.35);
  const odd = letterbox(1600, 1201, 640);
  assert.equal(odd.top, Math.round(odd.dh - 0.1));
});

test("decisions: what changes in the row", () => {
  assert.deepEqual(decisionRow("approved", { publicPhoto: "p", publicThumb: "t", note: "", problemType: "Garbage dumping" }),
    { status: "approved", note: null, problem_type: "Garbage dumping", public_photo_url: "p", public_thumb_url: "t", reject_reason: null });
  assert.deepEqual(decisionRow("rejected", { reason: "test" }), { status: "rejected", reject_reason: "test" });
  assert.deepEqual(decisionRow("needs_visit", { note: "Foam" }), { status: "needs_visit", note: "Foam" });
  assert.deepEqual(publicPaths("RPT-00002", "image/webp"), { photo: "RPT-00002.webp", thumb: "RPT-00002_thumb.webp" });
  assert.deepEqual(publicPaths("RPT-00002", "image/jpeg"), { photo: "RPT-00002.jpg", thumb: "RPT-00002_thumb.jpg" });
});

test("decided reports that still hold the original are tidied up; waiting ones are not", () => {
  assert.ok(needsTidyUp({ status: "approved", photo_path: "waiting/a.webp", thumb_path: "waiting/a_thumb.webp" }));
  assert.ok(needsTidyUp({ status: "rejected", photo_path: null, thumb_path: "waiting/a_thumb.webp" }));
  assert.ok(!needsTidyUp({ status: "approved", photo_path: null, thumb_path: null }));
  assert.ok(!needsTidyUp({ status: "waiting", photo_path: "waiting/a.webp", thumb_path: "x" }));
  assert.ok(!needsTidyUp({ status: "needs_visit", photo_path: "waiting/a.webp", thumb_path: "x" }));
});

test("every warning the server can add has a reviewer text", () => {
  for (const key of Object.values(FLAG_KEYS)) assert.ok(en[key], key);
  for (const s of ["waiting", "needs_visit", "approved", "rejected", "promoted"]) assert.ok(en[`review.tab.${s}`], s);
  for (const d of ["approved", "rejected", "needs_visit"]) assert.ok(en[`review.done.${d}`], d);
});
