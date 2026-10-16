// Run from the repo root: node --test tests/js/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { responsibleFor } from "../../web/js/features/responsibility.js";

// Uses the real exported data, so a broken export also fails here.
const load = (name) => JSON.parse(readFileSync(new URL(`../../web/data/${name}.json`, import.meta.url)));
const data = { authorities: load("authorities"), routing: load("routing"), hotspots: load("hotspots"), areas: load("areas") };
data.authorityById = Object.fromEntries(data.authorities.map((a) => [a.id, a]));
data.routingByType = Object.fromEntries(data.routing.map((r) => [r.problem_type, r]));
data.areaById = Object.fromEntries(data.areas.map((a) => [a.id, a]));

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
