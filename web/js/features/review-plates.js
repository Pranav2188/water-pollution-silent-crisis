// Review page: finds number plates (and painted registration numbers or other vehicle lettering)
// so the reviewer can blur them. YOLOv9 "tiny" plate model from open-image-models, run in the
// browser with ONNX Runtime Web; both self-hosted in assets/vendor (about 10 MB the first time).
// Searched whole and in 3 x 3 overlapping tiles: tested 22 Oct, it then finds every plate 34 px
// or wider in a 1600 px photo (about 17 m away with a phone camera). docs/phase-4.md.

import { faceTiles, mergeBoxes } from "./report-form.js";
import { letterbox, PLATE_SIDE, plateBoxes } from "./review-logic.js";

const ORT = new URL("../../assets/vendor/onnxruntime-web-1.30.0/", import.meta.url).href;
const MODEL = new URL("../../assets/vendor/plate-detector-yolo-v9-t-640/yolo-v9-t-640-license-plates-end2end.onnx", import.meta.url).href;
let session = null;

async function getSession() {
  if (!session) {
    session = (async () => {
      const ort = await import(`${ORT}ort.wasm.min.mjs`);
      ort.env.wasm.wasmPaths = ORT;
      ort.env.wasm.numThreads = 1;      // GitHub Pages cannot enable the isolation that threads need
      const s = await ort.InferenceSession.create(MODEL, { executionProviders: ["wasm"] });
      return { ort, s };
    })();
    session.catch(() => { session = null; });
  }
  return session;
}

// Start the download early (when a reviewer opens a report).
export const preloadPlates = () => getSession().catch(() => null);

// photo: a canvas. Returns boxes {x, y, w, h, score} in its pixels.
export async function findPlates(photo) {
  const { ort, s } = await getSession();
  const n = PLATE_SIDE;
  const input = Object.assign(document.createElement("canvas"), { width: n, height: n });
  const ctx = input.getContext("2d", { willReadFrequently: true });
  const found = [];
  for (const t of faceTiles(photo.width, photo.height)) {
    const lb = letterbox(t.w, t.h, n);
    ctx.fillStyle = "rgb(114,114,114)";
    ctx.fillRect(0, 0, n, n);
    ctx.drawImage(photo, t.x, t.y, t.w, t.h, lb.left, lb.top, lb.nw, lb.nh);
    const px = ctx.getImageData(0, 0, n, n).data;
    const chw = new Float32Array(3 * n * n);
    for (let i = 0, j = 0; i < n * n; i++, j += 4) {
      chw[i] = px[j] / 255;
      chw[n * n + i] = px[j + 1] / 255;
      chw[2 * n * n + i] = px[j + 2] / 255;
    }
    const out = (await s.run({ images: new ort.Tensor("float32", chw, [1, 3, n, n]) })).output0;
    found.push(...plateBoxes(out.data, out.dims[0], out.dims[1], lb, t));
  }
  return mergeBoxes(found.sort((a, b) => b.score - a.score));
}
