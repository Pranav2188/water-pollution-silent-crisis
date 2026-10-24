// Approved resident photo reports, read straight from Supabase with the public key (Phase 4,
// Milestone 4, docs/phase-4.md), and "Report this photo".
//
// The database rules (migration 002) let the public read approved reports only, and only the
// columns below. Nothing here needs supabase-js: two plain HTTPS calls.
// If Supabase is down or paused, the map and the report page simply show no resident reports.

import { config } from "../core/config.js";

export const PUBLIC_COLUMNS = "ref,created_at,area_id,problem_type,lat,lng,taken_at,note,public_photo_url,public_thumb_url";

const base = () => (config.supabase.url || "").replace(/\/$/, "");
export const enabled = () => Boolean(config.features.residentReports && config.supabase.url && config.supabase.anonKey);

// A row the page can show: a reference, a place and a published photo.
export const validReport = (r) => Boolean(r && /^RPT-\d+$/.test(r.ref || "") && Number.isFinite(r.lat) && Number.isFinite(r.lng) && r.public_photo_url && r.public_thumb_url);

// Newest first. limit: how many at most.
export async function fetchApprovedReports(limit = 300) {
  if (!enabled()) return [];
  const url = `${base()}/rest/v1/reports?select=${PUBLIC_COLUMNS}&order=created_at.desc&limit=${limit}`;
  try {
    const res = await fetch(url, { headers: { apikey: config.supabase.anonKey }, cache: "no-cache" });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows.filter(validReport) : [];
  } catch {
    return [];
  }
}

// Sends a flag for one published photo. Returns { ok: true } or { error: "<code>" }.
export async function flagReport(ref, reason) {
  if (!enabled()) return { error: "not_ready" };
  try {
    const res = await fetch(`${base()}/functions/v1/flag-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, reason }),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok && body.ok ? { ok: true } : { error: body.error || "server_error" };
  } catch {
    return { error: "network" };
  }
}

// "#RPT-00005" (a link from the report page) -> "RPT-00005", anything else -> null.
export function refFromHash(hash) {
  const m = /^#(RPT-\d{5,7})$/i.exec(String(hash || "").trim());
  return m ? m[1].toUpperCase() : null;
}

// The calendar day in Pune (IST) of an ISO time, as "YYYY-MM-DD" for niceDate(). Times are
// stored in UTC, so a photo taken at 1 am IST is still the previous day in UTC.
export function istDay(iso) {
  const ms = Date.parse(iso || "");
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
}
