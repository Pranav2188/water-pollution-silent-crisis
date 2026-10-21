# Vendored libraries

Copied here so the site loads no outside scripts. Never edit these files; to update one, copy the new release (at least two weeks old) into a new folder named with its version and change the path in the code.

| Folder | What | From | Licence | Used by |
|---|---|---|---|---|
| `leaflet-1.9.4/` | Maps | npm `leaflet@1.9.4` | BSD-2-Clause | every map |
| `tesseract-7.0.0/` | Reads the printed GPS stamp (text recognition in the browser) | npm `tesseract.js@7.0.0` (`dist/`), `tesseract.js-core@7.0.0` (`core/`, LSTM-only builds) | Apache-2.0 | report page, only when a photo looks stamped |
| `tesseract-7.0.0/lang/eng.traineddata.gz` | English text model ("fast"), gzipped | github.com/tesseract-ocr/tessdata_fast, `eng.traineddata`, sha256 `7d4322bd…170b2` before gzip | Apache-2.0 | same |
| `face-detection-0.4.1646425229/` | Finds faces so they can be blurred on the phone (MediaPipe Face Detection, full-range model) | npm `@mediapipe/face_detection@0.4.1646425229`: the older "Solutions" package, which bundles the full-range model (`face_detection_full_range_sparse.tflite`, faces up to about 5 m) and is half the size of `@mediapipe/tasks-vision`. The short-range files are kept because the package loads them at start-up. `LICENSE` from the MediaPipe repository | Apache-2.0 | report page |
| `exifr-7.1.3/` | Reads GPS and date hidden in a photo (when the phone kept them) | npm `exifr@7.1.3`, `dist/lite.esm.mjs` | MIT | report page |
| `altcha-3.2.4/` | Spam puzzle widget (proof of work, no cookies) | npm `altcha@3.2.4`, `dist/main/altcha.min.js` | MIT | report page |

Download for a resident on the report page (first visit; the browser keeps the files afterwards): about 0.2 MB always; about 3 MB more when the photo looks stamped; about 7 MB more for face finding (about 3 MB if the server compresses it).
