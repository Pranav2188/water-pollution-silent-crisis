// Run from the repo root: node --test tests/js/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkStatus, responsibleFor, ruleIsDraft } from "../../web/js/features/responsibility.js";

// Uses the real exported data, so a broken export also fails here.
const load = (name) => JSON.parse(readFileSync(new URL(`../../web/data/${name}.json`, import.meta.url)));
const data = { authorities: load("authorities"), routing: load("routing"), hotspots: load("hotspots"), areas: load("areas") };
data.authorityById = Object.fromEntries(data.authorities.map((a) => [a.id, a]));
data.routingByType = Object.fromEntries(data.routing.map((r) => [r.problem_type, r]));
data.areaById = Object.fromEntries(data.areas.map((a) => [a.id, a]));
data.sources = load("sources");
data.sourceById = Object.fromEntries(data.sources.map((s) => [s.id, s]));

const pune = data.hotspots.filter((h) => h.id.startsWith("HS-"));
const comparison = data.hotspots.filter((h) => h.id.startsWith("CS-"));

test("every Pune hotspot has a routing rule and at least one local authority", () => {
  for (const h of pune) {
    const who = responsibleFor(h, data);
    assert.ok(who.rule, `${h.id} has no routing rule for '${h.problem_type}'`);
    assert.ok(who.local.length > 0, `${h.id} is linked to no local authority`);
    assert.ok(who.firstContact, `${h.id} has no first contact`);
  }
});

test("Pune hotspots list PMC CARE first, then MPCB", () => {
  const who = responsibleFor(pune[0], data);
  assert.equal(who.general[0].id, "AU-01");
  assert.ok(who.general.slice(1).every((a) => a.role === "Pollution regulator"));
});

test("comparison sites list only their own offices, with a named first contact", () => {
  assert.ok(comparison.length > 0, "no comparison sites exported");
  for (const h of comparison) {
    const who = responsibleFor(h, data);
    const ids = [...who.general, ...who.local].map((a) => a.id);
    assert.ok(ids.every((id) => id.startsWith("CA-")), `${h.id} lists a Pune office: ${ids}`);
    assert.ok(who.firstAuthority, `${h.id} has no first contact`);
    assert.equal(who.rule, null);
  }
});

test("every spot has at least one tap-able channel for its first contact", () => {
  for (const h of data.hotspots) {
    const who = responsibleFor(h, data);
    assert.ok(who.channels.length > 0, `${h.id} (${who.firstContact}) has no channel`);
  }
});

test("picking another problem changes the route", () => {
  const weir = pune.find((h) => h.problem_type === "Froth or foam at the weir");
  const asWeir = responsibleFor(weir, data);
  const asGarbage = responsibleFor(weir, data, "Garbage dumping");
  assert.match(asWeir.firstContact, /MPCB/);
  assert.match(asGarbage.firstContact, /Solid Waste/);
  assert.ok(asGarbage.channels.some((c) => c.href === "https://wa.me/919689900002"));
});

test("every rule's sources resolve, and drafts are flagged", () => {
  for (const r of data.routing) {
    const who = responsibleFor({ ...pune[0], problem_type: r.problem_type }, data);
    assert.equal(who.sources.length, r.source_ids.length, `${r.problem_type} cites a missing source`);
  }
  assert.equal(ruleIsDraft({ status: "Draft (confirm)" }), true);
  assert.equal(ruleIsDraft({ status: "Agreed by team" }), false);
});

test("check status: desk checks and real contact are told apart", () => {
  assert.equal(checkStatus({ verified: false }).level, "unverified");
  assert.equal(checkStatus({ verified: true, verified_by: "Pranav Patil (doc check)", last_verified: "2026-10-16" }).level, "sources");
  assert.equal(checkStatus({ verified: true, verified_by: "Vaishnavi Jadhav", last_verified: "2026-10-20" }).level, "confirmed");
  assert.equal(checkStatus(data.authorityById["AU-01"]).level, "sources");
});

test("MPCB's online-services WhatsApp is never offered as a complaint channel", () => {
  const all = data.hotspots.flatMap((h) => responsibleFor(h, data).channels.map((c) => c.href));
  assert.ok(!all.some((href) => href.includes("7045113322")));
});
