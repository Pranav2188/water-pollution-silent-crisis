// Report page: finds faces on the phone so they are blurred before the photo is sent.
// MediaPipe Face Detection, full-range model (faces up to about 5 m), self-hosted in
// assets/vendor (about 7 MB the first time, then cached). The photo is searched whole and in
// 3 x 3 overlapping tiles so smaller faces are found too. It still misses faces far away, so the
// resident checks the photo and the reviewer checks it again (docs/phase-4.md).

import { FACE_CONFIDENCE, faceTiles, mergeBoxes } from "./report-form.js";

const BASE = new URL("../../assets/vendor/face-detection-0.4.1646425229/", import.meta.url).href;
let detector = null;

function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = Object.assign(document.createElement("script"), { src, async: true });
    s.onload = ok;
    s.onerror = () => fail(new Error(`could not load ${src}`));
    document.head.append(s);
  });
}

async function getDetector() {
  if (!detector) {
    detector = (async () => {
      if (!window.FaceDetection) await loadScript(`${BASE}face_detection.js`);
      const fd = new window.FaceDetection({ locateFile: (file) => `${BASE}${file}` });
      fd.setOptions({ model: "full", minDetectionConfidence: FACE_CONFIDENCE });
      let last = null;
      fd.onResults((r) => { last = r; });
      await fd.initialize();
      return async (image) => { last = null; await fd.send({ image }); return (last && last.detections) || []; };
    })();
    detector.catch(() => { detector = null; });
  }
  return detector;
}

// work: the working canvas. Returns face boxes {x, y, w, h} in its pixels.
export async function findFaces(work) {
  const detect = await getDetector();
  const found = [];
  for (const t of faceTiles(work.width, work.height)) {
    const tile = Object.assign(document.createElement("canvas"), { width: t.w, height: t.h });
    tile.getContext("2d").drawImage(work, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
    for (const d of await detect(tile)) {
      const b = d.boundingBox;   // centre and size, as shares of the tile
      found.push({ x: t.x + (b.xCenter - b.width / 2) * t.w, y: t.y + (b.yCenter - b.height / 2) * t.h, w: b.width * t.w, h: b.height * t.h });
    }
  }
  return mergeBoxes(found);
}
