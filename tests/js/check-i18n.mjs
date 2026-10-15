// Checks the translation files in web/i18n/:
//  1. every language file has exactly the keys of en.json (empty values are fine;
//     they fall back to English);
//  2. every key the website uses, in t("...") calls and data-i18n attributes,
//     exists in en.json.
// Run: node tests/js/check-i18n.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const web = new URL("../../web/", import.meta.url).pathname;
const load = (f) => JSON.parse(readFileSync(join(web, "i18n", f), "utf8"));
const keysOf = (o) => Object.keys(o).filter((k) => !k.startsWith("_"));
const problems = [];

const en = load("en.json");
const enKeys = new Set(keysOf(en));
for (const f of readdirSync(join(web, "i18n")).filter((f) => f.endsWith(".json") && f !== "en.json")) {
  const other = new Set(keysOf(load(f)));
  for (const k of enKeys) if (!other.has(k)) problems.push(`${f}: missing key "${k}"`);
  for (const k of other) if (!enKeys.has(k)) problems.push(`${f}: key "${k}" is not in en.json`);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]);
}
const used = new Map();
for (const file of walk(web).filter((f) => /\.(js|html)$/.test(f) && !f.includes("/assets/vendor/"))) {
  // drop // comment lines so examples in comments don't count
  const text = readFileSync(file, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  for (const m of text.matchAll(/\bt\(\s*["']([\w.]+)["']/g)) used.set(m[1], file);
  for (const m of text.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)) used.set(m[1], file);
}
for (const [k, file] of used) if (!enKeys.has(k)) problems.push(`${file.replace(web, "web/")}: uses "${k}", which is not in en.json`);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`i18n ok: ${enKeys.size} keys, ${used.size} used by the site`);
