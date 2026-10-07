// ============================================================
// Labor Estimator: client settings
// This is the only file you normally edit for a new client.
// (new-client.py writes it for you from a few answers.)
// ============================================================
window.LABOR_CONFIG = {
  company: {
    name: "Summit Ridge Home Technology",          // full name, used on the printed scope of work
    shortName: "Summit Ridge",                     // used in titles and share text
    appName: "Labor Estimator",            // small label in the header
    tagline: "Sample Calculator",               // tiny caption above the app name
    printLine: "Summit Ridge Home Technology (sample company)",// line under "Scope of Work & Labor Estimate"
    logo: "./logo.svg",                    // main header logo (png, jpg or svg)
    secondaryLogo: "",                     // optional second logo (e.g. a brand partner); leave "" to hide
    secondaryName: "",
    defaultManager: "Summit Ridge Operations"      // shown when no manager is typed on a quote
  },
  theme: {
    accent: "#3BB39A",      // buttons, totals, highlights
    background: "#06100E",  // app background
    panel: "#0D0D0D"        // card background
  },
  pricing: {
    hourlyRate: 165,        // labor rate per hour
    standardDayHours: 8,    // hours per technician per day (drives "Est. Days")
    currency: "USD",
    locale: "en-US"
  },
  fees: {
    recycling: { enabled: true, label: "Recycling", amount: 75 },
    materialsOptions: [0, 5, 10]   // % options in the Materials fee dropdown
  },
  text: {
    signatureLabel: "Summit Ridge Project Specialist",
    managerLabel: "Sales Manager",
    // {rate} is replaced with the hourly rate
    terms: "Labor estimates are formulated based on the defined scope of work, access, and site conditions. Modifications requested during installation or unforeseen concealed site conditions will be billed at the standard hourly labor rate of {rate}/hr."
  },
  catalog: {
    // Option A (simplest): leave sheetCsvUrl empty and edit labor-catalog.json
    // Option B: publish a Google Sheet (File > Share > Publish to web > CSV) with columns
    //           Category, Item Name, Install Hours, Programming Hours  and paste the CSV link here
    sheetCsvUrl: "",
    appsScriptUrl: ""   // optional: enables the in-app catalog editor (writes back to the Sheet)
  },
  admin: {
    pin: ""             // PIN for the in-app catalog editor; leave "" to turn the editor off
  },
  storage: {
    prefix: "summitridgeLabor",    // keeps each client's saved data separate in the browser
    collection: "quotes",   // Firestore collection name (only used with firebase below)
    retentionDays: 60       // cloud quotes older than this are auto-deleted (templates are kept)
  },
  // Optional shared team quotes. Leave as null and quotes are saved on each device.
  // To share quotes across the team, create a free Firebase project, add a Web app,
  // enable Firestore, and paste its config object here.
  firebase: null
};
