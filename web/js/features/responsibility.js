// Who is responsible for a hotspot, and what a resident should do about it. Pure logic, no
// HTML, so it can be tested (tests/js/responsibility.test.mjs) and reused by the panel and
// the complaint helper.

import { officeChannels, routeChannels } from "./contacts.js";

// Used only when an area lists no general offices in data/areas.csv.
const GENERAL_ROLES = ["Citizen complaint helpline", "Pollution regulator"];

function generalFor(hotspot, data) {
  const area = data.areaById?.[hotspot.area_id];
  if (area?.general_authority_ids?.length) {
    // Each area names its own main offices (PMC CARE and MPCB Pune-I for Pune city,
    // the council and MPCB Pune-II for Alandi), in the order listed.
    return area.general_authority_ids.map((id) => data.authorityById[id]).filter(Boolean);
  }
  return data.authorities
    .filter((a) => a.scope === "general" && GENERAL_ROLES.includes(a.role))
    .sort((a, b) => GENERAL_ROLES.indexOf(a.role) - GENERAL_ROLES.indexOf(b.role));
}

// How far an office's details have been checked:
//   "confirmed" - someone called, wrote or visited (Verified By is a person's name)
//   "sources"   - matched against official pages or reports only ("... (doc check)")
//   "unverified"
export function checkStatus(authority) {
  if (!authority?.verified) return { level: "unverified", date: null };
  const desk = /doc check/i.test(authority.verified_by || "");
  return { level: desk ? "sources" : "confirmed", date: authority.last_verified };
}

// A routing rule is a draft until the team agrees it (Routing Rules "Status").
export const ruleIsDraft = (rule) => !rule || /draft|confirm/i.test(rule.status || "");

// problemType lets the resident pick another problem than the hotspot's default.
export function responsibleFor(hotspot, data, problemType = hotspot.problem_type) {
  const general = generalFor(hotspot, data);
  const local = hotspot.authority_ids.map((id) => data.authorityById[id]).filter(Boolean);
  const rule = (problemType && data.routingByType[problemType]) || null;
  // Comparison sites name their first contact directly (no Routing Rules row yet).
  const firstAuthority = (hotspot.first_contact_id && data.authorityById[hotspot.first_contact_id]) || null;
  const offices = [...general, ...local];
  return {
    general,
    local,
    rule,                                   // Routing Rules row for this problem type (or null)
    firstAuthority,                         // authority to contact first, when the sheet names one
    firstContact: rule ? rule.first_contact : firstAuthority ? firstAuthority.office : "",
    // Tap-able channels for the first contact: from the rule's "How to Reach" (plus the
    // channels of any office it names), or from the named first authority.
    channels: rule ? routeChannels(rule.how_to_reach, offices) : officeChannels(firstAuthority),
    escalation: rule ? rule.escalate : [],
    sources: rule ? rule.source_ids.map((id) => data.sourceById?.[id]).filter(Boolean) : [],
    unverified: offices.filter((a) => !a.verified).map((a) => a.id),
  };
}
