// Who is responsible for a hotspot. Pure logic, no HTML, so it can be tested
// (tests/js/responsibility.test.mjs) and reused by the panel and the complaint helper.

// City-wide offices shown for every hotspot, in this order.
const GENERAL_ROLES = ["Citizen complaint helpline", "Pollution regulator"];

export function responsibleFor(hotspot, data) {
  const general = data.authorities
    .filter((a) => a.scope === "general" && GENERAL_ROLES.includes(a.role))
    .sort((a, b) => GENERAL_ROLES.indexOf(a.role) - GENERAL_ROLES.indexOf(b.role));
  const local = hotspot.authority_ids.map((id) => data.authorityById[id]).filter(Boolean);
  const rule = data.routingByType[hotspot.problem_type] || null;
  return {
    general,
    local,
    rule,                                   // Routing Rules row for this problem type (or null)
    firstContact: rule ? rule.first_contact : "",
    escalation: rule ? rule.escalate : [],
    unverified: [...general, ...local].filter((a) => !a.verified).map((a) => a.id),
  };
}
