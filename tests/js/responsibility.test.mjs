// Run from the repo root: node --test tests/js/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { responsibleFor } from "../../web/js/features/responsibility.js";

// Uses the real exported data, so a broken export also fails here.
const load = (name) => JSON.parse(readFileSync(new URL(`../../web/data/${name}.json`, import.meta.url)));
const data = { authorities: load("authorities"), routing: load("routing"), hotspots: load("hotspots") };
data.authorityById = Object.fromEntries(data.authorities.map((a) => [a.id, a]));
data.routingByType = Object.fromEntries(data.routing.map((r) => [r.problem_type, r]));

test("every published hotspot has a routing rule and at least one local authority", () => {
  for (const h of data.hotspots) {
    const who = responsibleFor(h, data);
    assert.ok(who.rule, `${h.id} has no routing rule for '${h.problem_type}'`);
    assert.ok(who.local.length > 0, `${h.id} is linked to no local authority`);
    assert.ok(who.firstContact, `${h.id} has no first contact`);
  }
});

test("city-wide offices come first: helpline, then regulators", () => {
  const who = responsibleFor(data.hotspots[0], data);
  assert.equal(who.general[0].role, "Citizen complaint helpline");
  assert.ok(who.general.slice(1).every((a) => a.role === "Pollution regulator"));
});
