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
    photoReports: false,        // Phase 4: report.html (resident photo reports) and its "Report a spot" menu link. Until switched on, the page opens only with ?pilot in the address
    residentReports: true,      // Phase 4: approved resident reports on the map and under "Recent reports" on report.html (read from Supabase with the public key)
  },

  // Phase 4 only. The PUBLIC publishable key (sb_publishable_…, or the legacy anon key) may go here.
  // The secret key (sb_secret_… / service_role) never goes in website code: see supabase/README.md.
  // url: the project address (not a secret); the report page sends to <url>/functions/v1/submit-report.
  // anonKey: the publishable key (sb_publishable_…, safe in website code); the review page signs in with it.
  supabase: { url: "https://enungxucvdqqeyzpyyxl.supabase.co", anonKey: "sb_publishable_iq6rKO8yDsjq6rtDi-Xs9w_CRLaTMsc" },
};
