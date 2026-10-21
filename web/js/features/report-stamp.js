// Report page: reads the location printed on a GPS-camera photo ("Lat 18.546309° Long 73.95149°"
// and the date) with Tesseract, in the browser. Loaded only when a photo looks stamped or the
// resident taps "Read the location printed on my photo": about 3 MB the first time, then cached.

import { agreedReading, STAMP_THRESHOLDS } from "./report-form.js";
import { parseStamp } from "./report-rules.js";
import { stampStrip } from "./report-photo.js";

const BASE = new URL("../../assets/vendor/tesseract-7.0.0/", import.meta.url).href;
let worker = null;

async function getWorker() {
  if (!worker) {
    worker = (async () => {
      const { default: Tesseract } = await import(`${BASE}tesseract.esm.min.js`);
      return Tesseract.createWorker("eng", 1, {             // 1 = the LSTM text model only
        workerPath: `${BASE}worker.min.js`,
        corePath: `${BASE}core`,
        langPath: `${BASE}lang`,
        gzip: true,
      });
    })();
    worker.catch(() => { worker = null; });
  }
  return worker;
}

// img: the decoded photo. Reads the stamp with each threshold until two readings agree
// (usually two passes, about 1 s on a laptop). Returns { lat, lng, takenAt }; nulls where no two
// readings agree: then the resident sets the pin, which is safer than trusting one reading.
export async function readStamp(img) {
  const w = await getWorker();
  const readings = [];
  for (const threshold of STAMP_THRESHOLDS) {
    const { data } = await w.recognize(stampStrip(img, threshold));
    readings.push(parseStamp(data.text));
    const agreed = agreedReading(readings);
    if (Number.isFinite(agreed.lat) && agreed.takenAt) break;
  }
  const s = agreedReading(readings);
  const ok = Number.isFinite(s.lat) && Math.abs(s.lat) <= 90 && Math.abs(s.lng) <= 180 && !(s.lat === 0 && s.lng === 0);
  return ok ? s : { lat: null, lng: null, takenAt: s.takenAt };
}
