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
    responsibilityPanel: false, // Week 6 (Sanskar): first contact + escalation from Routing Rules
    complaintHelper: false,     // Week 7: WhatsApp / X message; needs the PMC CARE number verified (Progress P3-01)
    photoReports: false,        // Phase 4: resident uploads with face blurring and a review queue (needs Supabase)
  },

  // Phase 4 only. The PUBLIC anon key may go here; the service_role key never goes in website code.
  supabase: { url: "", anonKey: "" },
};
