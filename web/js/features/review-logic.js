// Review page logic that needs no page or network (tests/js/review-logic.test.mjs).
// Boxes, plate-detector output, what may be approved, file names, and the tidy-up rule.

export const PLATE_SIDE = 640;          // the plate model's input size
export const PLATE_CONFIDENCE = 0.35;   // tested 22 Oct: catches every plate 34 px or wider in a 1600 px photo
export const DECIDABLE = ["waiting", "needs_visit"];   // statuses a reviewer can still decide
export const QUEUE = ["waiting", "needs_visit"];

// ------------------------------------------------------------------ boxes
//
// A box is { x, y, w, h, kind, state } in the photo's pixels.
//   kind:  "face" (found automatically), "plate" (found automatically), "hand" (drawn by the reviewer)
//   state: "on"  = blurred in the published copy
//          "off" = shown, not blurred (the reviewer cleared it)
//          "ask" = a suggestion the reviewer must decide (plates and vehicle lettering)
// Faces start blurred; plates start as suggestions (decided 22 Oct: lettering such as "HYUNDAI"
// is found too, so the reviewer decides); boxes drawn by hand start blurred.

export function newBox(b, kind) {
  return { x: b.x, y: b.y, w: b.w, h: b.h, kind, state: kind === "plate" ? "ask" : "on" };
}

// Tapping a box: a suggestion becomes blurred; after that, blur and clear take turns.
export const nextState = (state) => (state === "on" ? "off" : "on");

// The approve button needs every suggestion decided.
export function readyToApprove(boxes) {
  const undecided = boxes.filter((b) => b.state === "ask").length;
  return { ok: undecided === 0, undecided, blurred: boxes.filter((b) => b.state === "on").length };
}

// The top box under a point (the last drawn wins), or null.
export function boxAt(boxes, p) {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
  }
  return null;
}

// ------------------------------------------------------------------ the plate model

// How a piece of the photo is fitted into the model's square input (YOLO "letterbox": scale to
// fit, centre, fill the rest with grey 114), exactly as in open-image-models' preprocess.py.
export function letterbox(w, h, n = PLATE_SIDE) {
  const r = Math.min(n / w, n / h);
  const nw = Math.round(w * r), nh = Math.round(h * r);
  const dw = (n - nw) / 2, dh = (n - nh) / 2;
  return { r, nw, nh, dw, dh, left: Math.round(dw - 0.1) + 0, top: Math.round(dh - 0.1) + 0 };   // + 0 turns -0 into 0
}

// The model's output rows [batch, x1, y1, x2, y2, class, score] -> boxes in the photo's pixels.
// data: Float32Array, rows: number of rows, cols: values per row (7), lb: letterbox() of the tile,
// tile: { x, y } of the tile in the photo.
export function plateBoxes(data, rows, cols, lb, tile, minScore = PLATE_CONFIDENCE) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    const a = data.subarray ? data.subarray(i * cols, i * cols + cols) : data.slice(i * cols, i * cols + cols);
    const score = a[6];
    if (!(score >= minScore)) continue;
    const x1 = (a[1] - lb.dw) / lb.r + tile.x, y1 = (a[2] - lb.dh) / lb.r + tile.y;
    const x2 = (a[3] - lb.dw) / lb.r + tile.x, y2 = (a[4] - lb.dh) / lb.r + tile.y;
    if (x2 > x1 && y2 > y1) out.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, score });
  }
  return out;
}

// ------------------------------------------------------------------ deciding

// Published file names: the reference is public anyway, so the photo is named after it.
export function publicPaths(ref, type) {
  const ext = type === "image/webp" ? "webp" : "jpg";
  return { photo: `${ref}.${ext}`, thumb: `${ref}_thumb.${ext}` };
}

// What a decision changes in the row (before the private original is deleted).
export function decisionRow(decision, { publicPhoto, publicThumb, reason, note, problemType } = {}) {
  const row = { status: decision };
  if (note !== undefined) row.note = note || null;
  if (problemType) row.problem_type = problemType;
  if (decision === "approved") Object.assign(row, { public_photo_url: publicPhoto, public_thumb_url: publicThumb, reject_reason: null });
  if (decision === "rejected") row.reject_reason = reason || null;
  return row;
}

// Approved and rejected reports must not keep the original. Rows decided but still holding a
// photo path (a deletion that failed half-way) are tidied up when a reviewer next opens the page.
export const needsTidyUp = (r) => (r.status === "approved" || r.status === "rejected" || r.status === "promoted") && (r.photo_path || r.thumb_path);

// Reviewer-facing names for the warnings the server adds (i18n keys).
export const FLAG_KEYS = {
  pin_far_from_stamp: "review.flag.pin_far_from_stamp",
  pin_far_from_photo_gps: "review.flag.pin_far_from_photo_gps",
  pin_far_from_device: "review.flag.pin_far_from_device",
  pin_only: "review.flag.pin_only",
  old_photo: "review.flag.old_photo",
  note_has_contact: "review.flag.note_has_contact",
};
