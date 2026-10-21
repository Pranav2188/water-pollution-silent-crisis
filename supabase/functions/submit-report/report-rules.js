// Rules for resident photo reports (Phase 4, docs/phase-4.md). Plain JavaScript with no imports,
// so the SAME file runs in the browser (report page) and on the server (the submit-report
// Supabase function keeps an identical copy; tests/js/report-rules.test.mjs checks they match).
// Pure logic only: no page, no network.

export const LIMITS = {
  photoBytes: 2_621_440,      // 2.5 MB
  thumbBytes: 307_200,        // 300 KB
  photoSide: 2000,            // longest side, pixels
  thumbSide: 500,
  noteChars: 500,
  farMetres: 200,             // pin vs stamp / photo GPS / phone location
  oldPhotoDays: 90,
};

export const LOCATION_SOURCES = ["stamp", "photo", "device", "pin"];

// ------------------------------------------------------------------ places

// Distance in metres between two {lat, lng} points (haversine).
export function distanceM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Ray casting on one ring of [lng, lat] points.
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Polygon = [outer ring, hole, hole...]
function inPolygon(lng, lat, rings) {
  return inRing(lng, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lng, lat, hole));
}

export function inGeometry(lat, lng, geometry) {
  if (geometry.type === "Polygon") return inPolygon(lng, lat, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some((p) => inPolygon(lng, lat, p));
  return false;
}

// The area a point falls in, from the report zones (web/data/report-zones.geojson), or null.
export function zoneFor(lat, lng, zones) {
  const hit = (zones.features || []).find((f) => inGeometry(lat, lng, f.geometry));
  return hit ? hit.properties.area_id : null;
}

const isPoint = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

// Warnings for the reviewer about where the location came from.
// evidence: { stamp, photo, device } (each {lat, lng}, device may carry accuracy in metres).
export function locationFlags(pin, evidence = {}) {
  const flags = [];
  const far = (p, extra = 0) => distanceM(pin, p) > LIMITS.farMetres + extra;
  if (isPoint(evidence.stamp) && far(evidence.stamp)) flags.push("pin_far_from_stamp");
  if (isPoint(evidence.photo) && far(evidence.photo)) flags.push("pin_far_from_photo_gps");
  if (isPoint(evidence.device) && far(evidence.device, Math.min(Number(evidence.device.accuracy) || 0, 500))) {
    flags.push("pin_far_from_device");
  }
  if (!isPoint(evidence.stamp) && !isPoint(evidence.photo) && !isPoint(evidence.device)) flags.push("pin_only");
  return flags;
}

// ------------------------------------------------------------------ text and time

// GPS Map Camera style stamp text -> { lat, lng, takenAt } (any part may be null).
// "Lat 18.676874° Long 73.893992°" and "Friday, 09/10/2026 05:35 PM GMT +05:30" (day/month/year).
export function parseStamp(text) {
  const t = String(text || "");
  const c = /Lat[^\d-]{0,4}(-?\d{1,2}\.\d{3,8})\D{0,6}Long[^\d-]{0,4}(-?\d{1,3}\.\d{3,8})/i.exec(t);
  const d = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)?(?:\s*GMT\s*([+-])(\d{2}):?(\d{2}))?/i.exec(t);
  let takenAt = null;
  if (d) {
    const [, dd, mm, yyyy, hRaw, min, ampm, sign, oh, om] = d;
    let h = Number(hRaw) % 12;
    if (!ampm) h = Number(hRaw);
    else if (ampm.toUpperCase() === "PM") h += 12;
    const off = sign ? `${sign}${oh}:${om}` : "+05:30"; // the stamp's own zone, else India
    const iso = `${yyyy}-${mm}-${dd}T${String(h).padStart(2, "0")}:${min}:00${off}`;
    if (!Number.isNaN(Date.parse(iso)) && Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) {
      takenAt = new Date(iso).toISOString();
    }
  }
  return {
    lat: c ? Number(c[1]) : null,
    lng: c ? Number(c[2]) : null,
    takenAt,
  };
}

// When the photo was taken: refuse future dates, flag old ones.
export function checkTakenAt(iso, now = new Date()) {
  if (!iso) return { takenAt: null, flags: [], error: null };
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { takenAt: null, flags: [], error: "bad_date" };
  if (t > now.getTime() + 24 * 3600e3) return { takenAt: null, flags: [], error: "future_date" };
  const old = now.getTime() - t > LIMITS.oldPhotoDays * 24 * 3600e3;
  return { takenAt: new Date(t).toISOString(), flags: old ? ["old_photo"] : [], error: null };
}

// Clean the resident's note and flag one that seems to contain a phone number or email,
// so the reviewer removes it before publishing (residents should not post contact details).
export function cleanNote(text) {
  const note = String(text || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const flags = [];
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(note) || /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/.test(note)) {
    flags.push("note_has_contact");
  }
  return { note, flags, tooLong: note.length > LIMITS.noteChars };
}

// ------------------------------------------------------------------ images

const ascii = (b, at, n) => String.fromCharCode(...b.subarray(at, at + n));

// What an uploaded image really is, its size, and whether it still carries hidden data
// (EXIF, XMP or IPTC). A photo redrawn through the browser's canvas carries none.
export function imageInfo(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return jpegInfo(b);
  if (b.length > 15 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return webpInfo(b);
  return { type: null, width: 0, height: 0, hasMetadata: false };
}

function jpegInfo(b) {
  let i = 2;
  let width = 0;
  let height = 0;
  let hasMetadata = false;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) break;          // end of image / start of pixel data
    const len = (b[i + 2] << 8) | b[i + 3];
    const body = i + 4;
    if (marker === 0xe1) {                                  // APP1: EXIF or XMP
      const head = ascii(b, body, 29);
      if (head.startsWith("Exif") || head.startsWith("http://ns.adobe.com/xap/1.0/")) hasMetadata = true;
    }
    if (marker === 0xed) hasMetadata = true;                // APP13: IPTC (Photoshop)
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      height = (b[body + 1] << 8) | b[body + 2];
      width = (b[body + 3] << 8) | b[body + 4];
    }
    i = body + len - 2;
  }
  return { type: "jpeg", width, height, hasMetadata };
}

function webpInfo(b) {
  let i = 12;
  let width = 0;
  let height = 0;
  let hasMetadata = false;
  const u24 = (at) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
  while (i + 8 <= b.length) {
    const id = ascii(b, i, 4);
    const size = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24);
    const d = i + 8;
    if (id === "EXIF" || id === "XMP ") hasMetadata = true;
    if (id === "VP8X") {
      if (b[d] & 0x0c) hasMetadata = true;                  // EXIF (0x08) or XMP (0x04) flag
      width = u24(d + 4) + 1;
      height = u24(d + 7) + 1;
    } else if (id === "VP8 " && !width) {
      width = (b[d + 6] | (b[d + 7] << 8)) & 0x3fff;
      height = (b[d + 8] | (b[d + 9] << 8)) & 0x3fff;
    } else if (id === "VP8L" && !width) {
      const bits = b[d + 1] | (b[d + 2] << 8) | (b[d + 3] << 16) | (b[d + 4] << 24);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    }
    i = d + size + (size & 1);
  }
  return { type: "webp", width, height, hasMetadata };
}

// Errors for one image; [] when it is acceptable.
export function checkImage(bytes, kind = "photo") {
  const max = kind === "thumb" ? { bytes: LIMITS.thumbBytes, side: LIMITS.thumbSide } : { bytes: LIMITS.photoBytes, side: LIMITS.photoSide };
  const size = bytes.byteLength ?? bytes.length;
  const info = imageInfo(bytes);
  const errors = [];
  if (!info.type) errors.push(`${kind}_not_jpeg_or_webp`);
  if (size > max.bytes) errors.push(`${kind}_too_large`);
  if (info.type && (!info.width || !info.height)) errors.push(`${kind}_unreadable`);
  if (Math.max(info.width, info.height) > max.side) errors.push(`${kind}_too_many_pixels`);
  if (info.hasMetadata) errors.push(`${kind}_has_hidden_data`);
  return errors;
}

// ------------------------------------------------------------------ the whole report

// Check the report's fields (not the images). Returns { errors, report } where report holds
// the clean values to store. ctx: { zones, problemTypes, now }.
export function checkReport(fields, ctx) {
  const errors = [];
  const lat = Number(fields.lat);
  const lng = Number(fields.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) errors.push("no_location");

  const areaId = errors.length ? null : zoneFor(lat, lng, ctx.zones);
  if (!errors.length && !areaId) errors.push("outside_report_zones");

  const problemType = String(fields.problem_type || "");
  if (!ctx.problemTypes.includes(problemType)) errors.push("unknown_problem_type");

  const source = String(fields.location_source || "");
  if (!LOCATION_SOURCES.includes(source)) errors.push("unknown_location_source");

  if (fields.consent !== true) errors.push("no_consent");

  const note = cleanNote(fields.note);
  if (note.tooLong) errors.push("note_too_long");

  const time = checkTakenAt(fields.taken_at, ctx.now || new Date());
  if (time.error) errors.push(time.error);

  const flags = errors.length ? [] : [
    ...locationFlags({ lat, lng }, fields.evidence || {}),
    ...time.flags,
    ...note.flags,
  ];
  return {
    errors,
    report: errors.length ? null : {
      area_id: areaId,
      problem_type: problemType,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      location_source: source,
      location_flags: flags,
      taken_at: time.takenAt,
      note: note.note || null,
    },
  };
}
