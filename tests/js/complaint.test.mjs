// Run from the repo root: node --test tests/js/
import { test } from "node:test";
import assert from "node:assert/strict";
import { fillTemplate, openPlaceholders, whatsappLink, xLink } from "../../web/js/features/complaint.js";

const hotspot = {
  id: "HS-02", name: "Sewage outfall near the old bridge (Kharadi bank)", lat: 18.546314, lng: 73.950716,
  prabhags: [4], ward_offices: ["Nagar Road–Vadgaonsheri"],
};

test("fills what the hotspot knows and leaves the rest for the resident", () => {
  const text = fillTemplate("Outfall at [landmark] ([latitude, longitude]), Prabhag [number], [ward office name] ward office. ID [HS-xx]. [Your name]", hotspot);
  assert.equal(text, "Outfall at Sewage outfall near the old bridge (Kharadi bank) (18.546314, 73.950716), Prabhag 4, Nagar Road–Vadgaonsheri ward office. ID HS-02. [Your name]");
  assert.deepEqual(openPlaceholders(text), ["[Your name]"]);
});

test("empty hotspot fields keep their placeholder", () => {
  assert.equal(fillTemplate("Prabhag [number]", { ...hotspot, prabhags: [] }), "Prabhag [number]");
});

test("WhatsApp link adds India's code to a 10-digit number", () => {
  assert.equal(whatsappLink("96899 00002", "hi there"), "https://wa.me/919689900002?text=hi%20there");
});

test("X link encodes the text", () => {
  assert.equal(xLink("a&b"), "https://x.com/intent/post?text=a%26b");
});
