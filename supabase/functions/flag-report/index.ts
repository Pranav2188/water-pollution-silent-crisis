// flag-report: "Report this photo" (Phase 4, Milestone 4, docs/phase-4.md). Deployed with
// verify_jwt = false (visitors do not sign in); the limits below are what protect it.
//
//   POST /functions/v1/flag-report   JSON { ref: "RPT-00005", reason: "face" }
//        <- 200 { ok: true }  the photo is off the site and back in the review queue
//                             (also returned when it was already hidden, so the reply says
//                             nothing about other reports)
//        <- 400 { error: "invalid", details: [...] }  or  429 { error: "rate_day" | "rate_site" }
//   GET  /functions/v1/flag-report?about   which function this is
//
// What it does, with Supabase's secret key (provided by Supabase, never in code):
//   1. copies the published photo and thumbnail from report-public into the private
//      report-photos folder (flagged/RPT-00005.webp),
//   2. sets the report back to "waiting" with flag_reason and flagged_at, clears the public links,
//   3. deletes the public copies.
// Uses the ALTCHA_HMAC_SECRET secret (already set for submit-report) to scramble the connection
// address for the limits; the address itself is never stored.

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { checkFlag, publicFileName } from "./flag-rules.js";

const ALLOWED_ORIGINS = new Set([
  "https://pranav2188.github.io",
  "http://localhost:8000", // python3 -m http.server 8000 (web/README.md)
]);
const MAX_BODY = 2_000;

const HMAC_SECRET = Deno.env.get("ALTCHA_HMAC_SECRET") ?? "";
const SECRET_KEY = (() => {
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;
  } catch {
    return undefined;
  }
})() ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { "Vary": "Origin" };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "content-type";
    h["Access-Control-Max-Age"] = "600";
  }
  return h;
}

const reply = (status: number, body: unknown, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// The connection address, scrambled with a key that changes daily (same as submit-report).
async function connectionHash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${HMAC_SECRET}:flag:${day}`),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(403, { error: "origin_not_allowed" }, null);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method === "GET" && new URL(req.url).searchParams.has("about")) return reply(200, { function: "flag-report" }, origin);
  if (!HMAC_SECRET || !SECRET_KEY) return reply(503, { error: "not_configured" }, origin);
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" }, origin);

  const text = await req.text();
  if (text.length > MAX_BODY) return reply(413, { error: "too_large" }, origin);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, { error: "invalid", details: ["bad_json"] }, origin);
  }
  const { errors, flag } = checkFlag(body);
  if (!flag) return reply(400, { error: "invalid", details: errors }, origin);

  // 1. Limits (in the database, so every function instance agrees).
  const { data: slot, error: slotError } = await admin.rpc("claim_flag_slot", {
    p_ip_hash: await connectionHash(req),
    p_ref: flag.ref,
  });
  if (slotError) throw new Error(`claim_flag_slot: ${slotError.message}`);
  if (slot === "already_flagged") return reply(200, { ok: true }, origin);
  if (slot !== "ok") return reply(429, { error: slot }, origin);

  // 2. Only a published report can be taken down; anything else gets the same reply.
  const { data: row, error: rowError } = await admin.from("reports")
    .select("ref, status, public_photo_url, public_thumb_url").eq("ref", flag.ref).maybeSingle();
  if (rowError) throw new Error(`select: ${rowError.message}`);
  if (!row || row.status !== "approved") return reply(200, { ok: true }, origin);
  const names = [publicFileName(row.public_photo_url, row.ref), publicFileName(row.public_thumb_url, row.ref)];
  if (!names[0] || !names[1]) throw new Error(`unexpected public links for ${row.ref}`);

  // 3. Copy the published files into the private folder.
  const pub = admin.storage.from("report-public");
  const priv = admin.storage.from("report-photos");
  const privatePaths = names.map((n) => `flagged/${n}`);
  for (let i = 0; i < 2; i++) {
    const { data: file, error } = await pub.download(names[i]);
    if (error || !file) throw new Error(`download ${names[i]}: ${error?.message}`);
    const type = names[i].endsWith(".jpg") ? "image/jpeg" : "image/webp";
    const up = await priv.upload(privatePaths[i], new Uint8Array(await file.arrayBuffer()), { contentType: type, upsert: true });
    if (up.error) throw new Error(`upload ${privatePaths[i]}: ${up.error.message}`);
  }

  // 4. Back to the review queue, only if it is still published (two flags at once are fine).
  const { data: moved, error: moveError } = await admin.from("reports")
    .update({
      status: "waiting", photo_path: privatePaths[0], thumb_path: privatePaths[1],
      public_photo_url: null, public_thumb_url: null,
      flag_reason: flag.reason, flagged_at: new Date().toISOString(),
    })
    .eq("ref", row.ref).eq("status", "approved").select("ref");
  if (moveError) {
    await priv.remove(privatePaths);
    throw new Error(`update: ${moveError.message}`);
  }
  if (!moved || !moved.length) {
    await priv.remove(privatePaths);
    return reply(200, { ok: true }, origin);
  }

  // 5. Remove the public copies. The row no longer points at them, so even if this fails the
  //    photo is off the site; the error is logged for the team.
  const { error: rmError } = await pub.remove(names);
  if (rmError) console.error(`flag-report: could not remove public copies of ${row.ref}: ${rmError.message}`);
  return reply(200, { ok: true }, origin);
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error("flag-report:", e instanceof Error ? e.message : e);
    return reply(500, { error: "server_error" }, req.headers.get("origin"));
  }
});
