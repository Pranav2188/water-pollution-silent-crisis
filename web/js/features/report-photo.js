// Report page: everything done to the photo on the phone. Uses the browser's canvas only.
//
// Redrawing the photo onto a canvas and saving it again is what removes the phone's hidden data
// (GPS, phone model, time): a canvas holds only pixels. It also applies the photo's rotation.
// The original file is read here and never sent.

import { fitSize, mosaicBlock, PHOTO_SIDE, STAMP_BAND, STAMP_CHECK_SIDE, stampScore, stampToInk, THUMB_SIDE, toGrey } from "./report-form.js";
import { checkImage, LIMITS } from "./report-rules.js";

const canvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });

// File -> decoded <img> (browsers apply the photo's rotation when drawing it).
export async function loadPhoto(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty image");
  return img;
}

// The working copy: at most 1600 px on the long side. Faces are searched and blurred on it.
export function workingCopy(img) {
  const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, PHOTO_SIDE);
  const c = canvas(w, h);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

// Does the photo look like it carries a GPS-camera stamp? Checked on a 1280 px copy, no download.
export function stampLikelihood(img) {
  const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, STAMP_CHECK_SIDE);
  const c = canvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return stampScore(toGrey(ctx.getImageData(0, 0, w, h).data, w, h), w, h);
}

// The bottom band of the full photo, with only the stamp's white letters kept (black on white),
// enlarged 2x when the photo is small (WhatsApp copies). This is what the text reader sees.
// threshold: the grey level that counts as white ink (see STAMP_THRESHOLDS).
export function stampStrip(img, threshold) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const top = Math.floor(H * (1 - STAMP_BAND));
  const scale = W < 1600 ? 2 : Math.min(1, 3000 / W);
  const c = canvas(Math.round(W * scale), Math.round((H - top) * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, top, W, H - top, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  stampToInk(data.data, threshold);
  ctx.putImageData(data, 0, 0);
  return c;
}

// Mosaic one box: shrink it to a few blocks and stretch it back without smoothing. The face
// detail is gone from the pixels, so nothing can "unblur" it.
export function mosaic(ctx, box) {
  const x = Math.floor(box.x), y = Math.floor(box.y);
  const w = Math.ceil(box.w), h = Math.ceil(box.h);
  if (w < 2 || h < 2) return;
  const block = mosaicBlock(box);
  const small = canvas(Math.max(1, Math.ceil(w / block)), Math.max(1, Math.ceil(h / block)));
  const s = small.getContext("2d");
  s.imageSmoothingEnabled = true;
  s.drawImage(ctx.canvas, x, y, w, h, 0, 0, small.width, small.height);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
  ctx.restore();
}

// The photo as it will be sent: the working copy with every switched-on box blurred.
export function blurredCopy(work, boxes) {
  const c = canvas(work.width, work.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(work, 0, 0);
  for (const b of boxes) if (b.on) mosaic(ctx, b);
  return c;
}

const toBlob = (c, type, quality) => new Promise((ok) => c.toBlob(ok, type, quality));

// Canvas -> WebP (or JPEG where the browser cannot make WebP, e.g. older Safari), within maxBytes.
export async function encode(c, maxBytes) {
  for (const quality of [0.82, 0.72, 0.6, 0.5]) {
    let blob = await toBlob(c, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") blob = await toBlob(c, "image/jpeg", quality + 0.03);
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error("too_large");
}

// The two files to upload, checked with the same rules the server uses. Throws the first problem.
export async function uploadFiles(blurred) {
  const photo = await encode(blurred, LIMITS.photoBytes);
  const { w, h } = fitSize(blurred.width, blurred.height, THUMB_SIDE);
  const t = canvas(w, h);
  const ctx = t.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(blurred, 0, 0, w, h);
  const thumb = await encode(t, LIMITS.thumbBytes);
  const problems = [
    ...checkImage(new Uint8Array(await photo.arrayBuffer()), "photo"),
    ...checkImage(new Uint8Array(await thumb.arrayBuffer()), "thumb"),
  ];
  if (problems.length) throw Object.assign(new Error("invalid"), { details: problems });
  return { photo, thumb };
}
