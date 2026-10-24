// Interface text in more than one language, with no build step.
//
// - All interface strings live in i18n/en.json. Other languages (i18n/mr.json) use the same
//   keys; an empty or missing string falls back to English.
// - Pages are written in English. Elements with data-i18n="key" (text) or
//   data-i18n-html="key" (trusted markup from our own string files) are swapped when another
//   language is chosen.
// - Choose a language with ?lang=mr, the header switch, or localStorage. Only languages
//   listed in config.languages are used.
// - Sheet data (hotspot descriptions, office names) is not translated here.

import { config } from "./config.js";

let strings = {};
let english = {};
export let lang = config.defaultLanguage;

function pickLanguage() {
  const wanted = new URLSearchParams(location.search).get("lang") || safeGet("lang") || config.defaultLanguage;
  return config.languages.includes(wanted) ? wanted : config.defaultLanguage;
}

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: language just isn't remembered */ }
}

async function load(code) {
  try {
    const res = await fetch(`${config.i18nPath}${code}.json`, { cache: "no-cache" });
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

// t("map.count", { n: 3 }) -> "3 hotspots ...". {name} placeholders are filled from vars.
export function t(key, vars = {}) {
  const text = strings[key] || english[key] || key;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function applyToPage() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
}

function addSwitch() {
  if (config.languages.length < 2) return;
  const header = document.querySelector(".site-header");
  if (!header) return;
  const select = document.createElement("select");
  select.className = "lang-switch";
  select.setAttribute("aria-label", t("lang.label"));
  for (const code of config.languages) {
    const opt = new Option(t(`lang.${code}`), code, false, code === lang);
    select.add(opt);
  }
  select.addEventListener("change", () => {
    safeSet("lang", select.value);
    const url = new URL(location.href);
    url.searchParams.set("lang", select.value);
    location.href = url.toString();
  });
  header.append(select);
}

// Menu links for features that are switched off stay hidden (data-feature="photoReports").
function showFeatureLinks() {
  document.querySelectorAll("[data-feature]").forEach((el) => { if (config.features[el.dataset.feature]) el.hidden = false; });
}

// Call once at the start of every page script.
export async function initI18n() {
  showFeatureLinks();
  lang = pickLanguage();
  english = await load("en");
  strings = lang === "en" ? english : await load(lang);
  if (lang !== "en") applyToPage();
  addSwitch();
  return lang;
}
