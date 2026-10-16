// Turns contact text from the sheet ("PMC CARE: WhatsApp 96899 00002, toll-free 1800-1030-222,
// X @PMCPune") into tap-able channels. Pure logic, tested in tests/js/contacts.test.mjs.
// The sheet holds office contacts only, never personal numbers, so nothing here filters for that.

// Order on screen: the channels that give a trackable token come first; X last, because PMC
// says complaints made on X cannot be tracked (Sources SRC-52).
const ORDER = ["whatsapp", "phone", "email", "web", "x"];

const digits = (s) => s.replace(/\D/g, "");

// Parts of the text that warn against using a channel are left out: a sentence that says
// "not a complaint line" (for example MPCB's online-services helpdesk number), and any
// comma-separated item marked "to verify" (for example a portal nobody has checked yet).
export function usableText(text) {
  return String(text || "")
    .split(/;\s|\.\s/)
    .filter((sentence) => !/not a complaint/i.test(sentence))
    .flatMap((sentence) => sentence.split(/,\s/))
    .filter((item) => !/to verify/i.test(item))
    .join(" ; ");
}

export function channelsIn(text) {
  const usable = usableText(text);
  let rest = ` ${usable} `;
  const found = [];
  const take = (re, make) => {
    rest = rest.replace(re, (...m) => {
      const c = make(...m);
      if (c) found.push(c);
      return " ";
    });
  };

  // Emails first, so "mpcb.gov.in" inside an address is not also read as a website.
  take(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, (m) => ({ kind: "email", label: m, href: `mailto:${m}` }));
  // WhatsApp: a 10-digit Indian mobile number after the word WhatsApp.
  take(/WhatsApp:?\s*(?:\+?91[\s-]?)?([6-9]\d{4}[\s-]?\d{5})/gi, (m, n) => ({
    kind: "whatsapp", label: n.trim(), href: `https://wa.me/91${digits(n)}`,
  }));
  // Toll-free numbers (1800 ...).
  take(/\b1800[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g, (m) => ({ kind: "phone", label: m, href: `tel:${digits(m)}` }));
  // Landlines with an STD code (020-25811694).
  take(/\b0\d{2,4}[\s-]\d{6,8}\b/g, (m) => ({ kind: "phone", label: m, href: `tel:${digits(m)}` }));
  // X handles (@PMCPune).
  take(/(?<![\w.])@([A-Za-z_]\w{1,14})\b/g, (m, h) => ({ kind: "x", label: `@${h}`, href: `https://x.com/${h}` }));
  // Bare web addresses (complaint.pmc.gov.in).
  take(/\b((?:[a-z0-9-]+\.)+(?:gov\.in|nic\.in|org|com|in))(\/[^\s,;)]*)?/gi, (m) => ({
    kind: "web", label: m, href: `https://${m}`,
  }));

  const seen = new Set();
  return found
    .filter((c) => !seen.has(c.href) && seen.add(c.href))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

// Channels for an office, from its contact text and official handle.
export function officeChannels(authority) {
  return authority ? channelsIn(`${authority.contact}; ${authority.handle}`) : [];
}

// Channels for a route: those written in the rule's "How to Reach", plus the channels of any
// listed office the text names (so "PMC CARE, plus a written complaint" still gets PMC CARE's
// numbers). Duplicates are dropped and the order is kept.
export function routeChannels(howToReach, offices) {
  const text = howToReach || "";
  const named = offices.filter((a) => {
    const short = a.office.split(/[(,:]/)[0].trim();
    return short.length > 3 && text.includes(short);
  });
  const seen = new Set();
  return [channelsIn(text), ...named.map(officeChannels)].flat()
    .filter((c) => !seen.has(c.href) && seen.add(c.href))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
