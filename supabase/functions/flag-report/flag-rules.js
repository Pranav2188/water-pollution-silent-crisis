// Rules for "Report this photo" (Phase 4, Milestone 4, docs/phase-4.md). Plain JavaScript with
// no imports, so the SAME file runs in the browser (map panel) and on the server (the flag-report
// Supabase function keeps an identical copy; tests/js/flag-rules.test.mjs checks they match).

// Why a visitor says a published photo should come down. The keys are stored in
// reports.flag_reason (migration 006) and translated with "flag.reason.<key>".
export const FLAG_REASONS = ["face", "plate", "personal", "not_pollution", "other"];

export const REF_PATTERN = /^RPT-\d{5,7}$/;

// body: what the page sends, { ref, reason }. Returns { errors: [], flag: { ref, reason } | null }.
// No free text is accepted: nothing typed by a visitor is stored.
export function checkFlag(body) {
  const errors = [];
  const ref = typeof body?.ref === "string" ? body.ref.trim().toUpperCase() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!REF_PATTERN.test(ref)) errors.push("bad_ref");
  if (!FLAG_REASONS.includes(reason)) errors.push("bad_reason");
  return { errors, flag: errors.length ? null : { ref, reason } };
}

// "https://<project>.supabase.co/storage/v1/object/public/report-public/RPT-00005.webp"
// -> "RPT-00005.webp". Only names that belong to this report are accepted, so a public URL in
// the row can never make the function move some other file.
export function publicFileName(url, ref) {
  const m = /\/storage\/v1\/object\/public\/report-public\/([^/?#]+)(?:[?#].*)?$/.exec(String(url || ""));
  if (!m) return null;
  const name = decodeURIComponent(m[1]);
  return new RegExp(`^${ref}(_thumb)?\\.(webp|jpg)$`).test(name) ? name : null;
}
