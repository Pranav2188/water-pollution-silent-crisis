// Complaint helper logic (Week 7). Pure functions with tests in tests/js/complaint.test.mjs;
// the panel only shows them when config.features.complaintHelper is true.

// Placeholders in the Routing Rules templates that the hotspot itself can fill.
// Everything else (your name, date, time, colour, smell) stays in [brackets] for the resident.
export function fillTemplate(template, hotspot) {
  const known = {
    "[HS-xx]": hotspot.id,
    "[latitude, longitude]": `${hotspot.lat}, ${hotspot.lng}`,
    "[number]": hotspot.prabhags.join(" / "),
    "[ward office name]": hotspot.ward_offices.join(" / "),
    "[landmark]": hotspot.name,
  };
  return Object.entries(known).reduce(
    (text, [placeholder, value]) => (value ? text.split(placeholder).join(value) : text),
    template || "",
  );
}

// Placeholders still left for the resident to fill.
export function openPlaceholders(text) {
  return [...new Set((text || "").match(/\[[^\]]+\]/g) || [])];
}

// WhatsApp link to a number such as "96899 00002" (India +91 added when missing).
export function whatsappLink(number, text) {
  let digits = String(number || "").replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// X (Twitter) post link. X counts at most 280 characters; check before offering it.
export function xLink(text) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}

export const X_LIMIT = 280;
