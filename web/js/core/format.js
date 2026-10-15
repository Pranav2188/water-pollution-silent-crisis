// Formatting helpers shared by every page.

// Escape text before putting it into HTML. Use it for EVERY value that comes from the sheet.
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-09-29" -> "29 Sep 2026" (English) or the Marathi form; anything else is returned unchanged.
export function niceDate(text, lang = "en") {
  if (!text || !/^\d{4}-\d{2}(-\d{2})?$/.test(text)) return text || "";
  const [y, m, d] = text.split("-").map(Number);
  if (lang !== "en") {
    const opts = d ? { day: "numeric", month: "short", year: "numeric" } : { month: "short", year: "numeric" };
    return new Intl.DateTimeFormat(`${lang}-IN`, opts).format(new Date(Date.UTC(y, m - 1, d || 1)));
  }
  return d ? `${d} ${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${y}`;
}

// A source as a link to its URL (or plain text when it has none).
export function sourceLink(src) {
  if (!src) return "";
  return src.url
    ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.publisher || src.title)}</a>`
    : esc(src.publisher || src.title);
}
