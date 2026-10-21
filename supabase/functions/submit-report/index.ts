// submit-report: the only way a resident's photo report gets into the database (Phase 4).
// Plan and rules: docs/phase-4.md. Deployed to Supabase with verify_jwt = false (residents do not
// sign in); the spam puzzle, rate limits and checks below are what protect it.
//
//   GET  /functions/v1/submit-report   -> a new spam puzzle (ALTCHA challenge), valid 10 minutes
//   POST /functions/v1/submit-report   -> multipart form:
//          altcha  the solved puzzle (what the ALTCHA widget puts in its hidden field)
//          report  JSON: lat, lng, problem_type, location_source, consent, note, taken_at,
//                  evidence: { stamp, photo, device }
//          photo   the redrawn photo, JPEG or WebP, no hidden data
//          thumb   the 400 px thumbnail, same rules
//        <- 200 { ref: "RPT-00001" } or 4xx { error: "<code>" }
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets; never in code):
//   ALTCHA_HMAC_SECRET, ALTCHA_KEY_SECRET   two long random strings
// Supabase provides SUPABASE_URL and SUPABASE_SECRET_KEYS itself.

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { createChallenge, randomInt, verifySolution } from "npm:altcha-lib@2.5.0";
import { deriveKey } from "npm:altcha-lib@2.5.0/algorithms/pbkdf2";
import { checkImage, checkReport } from "./report-rules.js";
import zones from "./report-zones.json" with { type: "json" };

const ALLOWED_ORIGINS = new Set([
  "https://pranav2188.github.io",
  "http://localhost:8000", // python3 -m http.server 8000 (web/README.md)
]);
const PUZZLE = { algorithm: "PBKDF2/SHA-256", cost: 5000, counterMin: 1000, counterMax: 4000, minutes: 10 };
const MAX_BODY = 3_500_000; // photo 2.5 MB + thumb 300 KB + form overhead

const HMAC_SECRET = Deno.env.get("ALTCHA_HMAC_SECRET") ?? "";
const KEY_SECRET = Deno.env.get("ALTCHA_KEY_SECRET") ?? "";
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

// GET ?about: which report zones this deployment carries, so anyone can confirm it matches the
// repo (compare zones_sha256 with: node -e on web/data/report-zones.geojson, see supabase/README.md).
const ABOUT = {
  function: "submit-report",
  zones: zones.features.length,
  areas: [...new Set(zones.features.map((f: { properties: { area_id: string } }) => f.properties.area_id))],
  zones_sha256: Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(zones)))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join(""),
};

// Problem types change only when the sheet changes; ask the database at most every 10 minutes.
let problemTypes: { list: string[]; at: number } = { list: [], at: 0 };
async function getProblemTypes(): Promise<string[]> {
  if (Date.now() - problemTypes.at < 600_000 && problemTypes.list.length) return problemTypes.list;
  const { data, error } = await admin.from("routing_rules").select("problem_type");
  if (error) throw new Error(`routing_rules: ${error.message}`);
  problemTypes = { list: data.map((r: { problem_type: string }) => r.problem_type), at: Date.now() };
  return problemTypes.list;
}

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

// The connection address, scrambled with a key that changes daily. Never stored as is.
async function connectionHash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${HMAC_SECRET}:${day}`),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function decodePuzzle(value: FormDataEntryValue | null) {
  try {
    const p = JSON.parse(atob(String(value ?? "")));
    return p && p.challenge && p.solution ? p : null;
  } catch {
    return null;
  }
}

async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  // Browsers on other websites are refused. (Calls without an Origin header, such as tests,
  // still face the spam puzzle and the rate limits.)
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(403, { error: "origin_not_allowed" }, null);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method === "GET" && new URL(req.url).searchParams.has("about")) return reply(200, ABOUT, origin);
  if (!HMAC_SECRET || !KEY_SECRET || !SECRET_KEY) return reply(503, { error: "not_configured" }, origin);

  if (req.method === "GET") {
    const challenge = await createChallenge({
      algorithm: PUZZLE.algorithm,
      cost: PUZZLE.cost,
      counter: randomInt(PUZZLE.counterMin, PUZZLE.counterMax),
      deriveKey,
      hmacSignatureSecret: HMAC_SECRET,
      hmacKeySignatureSecret: KEY_SECRET,
      expiresAt: new Date(Date.now() + PUZZLE.minutes * 60_000),
    });
    return reply(200, challenge, origin);
  }
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" }, origin);

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return reply(413, { error: "too_large" }, origin);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return reply(400, { error: "bad_form" }, origin);
  }

  // 1. Spam puzzle: genuine, unexpired, signed by us.
  const puzzle = decodePuzzle(form.get("altcha"));
  if (!puzzle) return reply(400, { error: "spam_check_missing" }, origin);
  const verdict = await verifySolution({
    challenge: puzzle.challenge,
    solution: puzzle.solution,
    deriveKey,
    hmacSignatureSecret: HMAC_SECRET,
    hmacKeySignatureSecret: KEY_SECRET,
  }).catch(() => null);
  if (!verdict?.verified) return reply(400, { error: verdict?.expired ? "spam_check_expired" : "spam_check_failed" }, origin);

  // 2. The report itself: place, problem type, note, date, consent.
  let fields: Record<string, unknown>;
  try {
    fields = JSON.parse(String(form.get("report") ?? ""));
  } catch {
    return reply(400, { error: "bad_report" }, origin);
  }
  const { errors, report } = checkReport(fields, { zones, problemTypes: await getProblemTypes() });

  // 3. The photo and thumbnail: JPEG or WebP, size limits, no hidden data.
  const photo = form.get("photo");
  const thumb = form.get("thumb");
  if (!(photo instanceof File) || !(thumb instanceof File)) errors.push("photo_missing");
  const photoBytes = photo instanceof File ? new Uint8Array(await photo.arrayBuffer()) : null;
  const thumbBytes = thumb instanceof File ? new Uint8Array(await thumb.arrayBuffer()) : null;
  if (photoBytes) errors.push(...checkImage(photoBytes, "photo"));
  if (thumbBytes) errors.push(...checkImage(thumbBytes, "thumb"));
  if (errors.length || !report || !photoBytes || !thumbBytes) return reply(400, { error: "invalid", details: errors }, origin);

  // 4. One use per puzzle, and rate limits (in the database, so every function instance agrees).
  const { data: slot, error: slotError } = await admin.rpc("claim_report_slot", {
    p_ip_hash: await connectionHash(req),
    p_signature: String(puzzle.challenge.signature),
    p_expires: new Date(Number(puzzle.challenge.parameters?.expiresAt ?? 0) * 1000 || Date.now() + 600_000).toISOString(),
  });
  if (slotError) throw new Error(`claim_report_slot: ${slotError.message}`);
  if (slot === "replayed") return reply(400, { error: "spam_check_reused" }, origin);
  if (slot !== "ok") return reply(429, { error: slot }, origin);

  // 5. Store: photos into the private folder, then the row (status "waiting").
  const ext = (b: Uint8Array) => (b[0] === 0xff ? "jpg" : "webp");
  const mime = (b: Uint8Array) => (b[0] === 0xff ? "image/jpeg" : "image/webp");
  const id = crypto.randomUUID();
  const photoPath = `waiting/${id}.${ext(photoBytes)}`;
  const thumbPath = `waiting/${id}_thumb.${ext(thumbBytes)}`;
  const bucket = admin.storage.from("report-photos");
  for (const [path, bytes] of [[photoPath, photoBytes], [thumbPath, thumbBytes]] as const) {
    const { error } = await bucket.upload(path, bytes, { contentType: mime(bytes), upsert: false });
    if (error) {
      await bucket.remove([photoPath, thumbPath]);
      throw new Error(`upload ${path}: ${error.message}`);
    }
  }
  const { data: row, error: rowError } = await admin.from("reports")
    .insert({ ...report, photo_path: photoPath, thumb_path: thumbPath })
    .select("ref")
    .single();
  if (rowError) {
    await bucket.remove([photoPath, thumbPath]);
    throw new Error(`insert: ${rowError.message}`);
  }
  return reply(200, { ref: row.ref }, origin);
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error("submit-report:", e instanceof Error ? e.message : e);
    return reply(500, { error: "server_error" }, req.headers.get("origin"));
  }
});
