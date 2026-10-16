// Site-wide settings. Turn features on here when they are ready; nothing else needs editing.

export const config = {
  // Languages offered in the header switch. Add "mr" once i18n/mr.json is translated
  // (empty strings in mr.json fall back to English, so a half-done file is safe to test
  // with ?lang=mr before switching it on here).
  languages: ["en"],
  defaultLanguage: "en",

  repoUrl: "https://github.com/Pranav2188/water-pollution-silent-crisis",
  dataPath: "data/",
  i18nPath: "i18n/",

  features: {
    areaFilter: true,           // area buttons above the map (data/areas.csv)
    responsibilityPanel: true,  // "What to do about it": first contact, channels, escalation (features/respond-panel.js)
    complaintHelper: false,     // Week 7: WhatsApp / X message; needs the PMC CARE number verified (Progress P3-01)
    photoReports: false,        // Phase 4: resident uploads with face blurring and a review queue (needs Supabase)
  },

  // Phase 4 only. The PUBLIC publishable key (sb_publishable_…, or the legacy anon key) may go here.
  // The secret key (sb_secret_… / service_role) never goes in website code: see supabase/README.md.
  supabase: { url: "", anonKey: "" },
};
