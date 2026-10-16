// Who is responsible for a hotspot. Pure logic, no HTML, so it can be tested
// (tests/js/responsibility.test.mjs) and reused by the panel and the complaint helper.

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

export function responsibleFor(hotspot, data) {
  const general = generalFor(hotspot, data);
  const local = hotspot.authority_ids.map((id) => data.authorityById[id]).filter(Boolean);
  const rule = (hotspot.problem_type && data.routingByType[hotspot.problem_type]) || null;
  // Comparison sites name their first contact directly (no Routing Rules row yet).
  const firstAuthority = (hotspot.first_contact_id && data.authorityById[hotspot.first_contact_id]) || null;
  return {
    general,
    local,
    rule,                                   // Routing Rules row for this problem type (or null)
    firstAuthority,                         // authority to contact first, when the sheet names one
    firstContact: rule ? rule.first_contact : firstAuthority ? firstAuthority.office : "",
    escalation: rule ? rule.escalate : [],
    unverified: [...general, ...local].filter((a) => !a.verified).map((a) => a.id),
  };
}
