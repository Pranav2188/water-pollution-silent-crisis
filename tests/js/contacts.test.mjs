// Run from the repo root: node --test tests/js/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsIn, routeChannels } from "../../web/js/features/contacts.js";

const kinds = (text) => channelsIn(text).map((c) => `${c.kind} ${c.href}`);

test("PMC CARE line from the Routing Rules", () => {
  assert.deepEqual(kinds("PMC CARE: WhatsApp 96899 00002, toll-free 1800-1030-222, X @PMCPune"), [
    "whatsapp https://wa.me/919689900002",
    "phone tel:18001030222",
    "x https://x.com/PMCPune",
  ]);
});

test("MPCB line: email and landline, app name left as text", () => {
  assert.deepEqual(kinds("sropune1@mpcb.gov.in, 020-25811694, MPCB E-Catalyst app (complaint feature to verify)"), [
    "phone tel:02025811694",
    "email mailto:sropune1@mpcb.gov.in",
  ]);
});

test("an email domain is not also a website; a bare portal is", () => {
  assert.deepEqual(kinds("ropune@mpcb.gov.in; complaint.pmc.gov.in"), [
    "email mailto:ropune@mpcb.gov.in",
    "web https://complaint.pmc.gov.in",
  ]);
});

test("text with no channels gives nothing, and duplicates are dropped", () => {
  assert.deepEqual(kinds("Through the ward office (no personal numbers)"), []);
  assert.equal(channelsIn("WhatsApp 96899 00002 or WhatsApp 9689900002").length, 1);
});

test("channels marked 'to verify' or 'not a complaint line' are left out", () => {
  assert.deepEqual(kinds("Written application at the office; portal myalandinp.com (to verify)"), []);
  assert.deepEqual(kinds("X @mpcb_official. MPCB's WhatsApp +91 70451 13322 is the portal helpdesk, not a complaint line"),
    ["x https://x.com/mpcb_official"]);
});

test("a route that only names PMC CARE borrows PMC CARE's channels", () => {
  const pmcCare = { office: "PMC CARE (Pune Municipal Corporation)", contact: "Toll-free 1800-1030-222; WhatsApp 96899 00002", handle: "@PMCPune" };
  const other = { office: "MPCB Regional Office Pune", contact: "ropune@mpcb.gov.in", handle: "" };
  const hrefs = routeChannels("PMC CARE, plus a written complaint at the ward office", [pmcCare, other]).map((c) => c.href);
  assert.deepEqual(hrefs, ["https://wa.me/919689900002", "tel:18001030222", "https://x.com/PMCPune"]);
});
