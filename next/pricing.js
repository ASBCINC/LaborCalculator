// ASBC Labor Calculator pricing rules (v8.12.0). Used by BOTH index.html and log.html so the
// calculator, printed SOW and Quote Log always agree. Settings come from config/settings.
(function () {
  const DEFAULTS = {
    hourlyRate: 200, recyclingFee: 75, materialsPct: 5,
    tripFee: 150,            // flat trip / mobilization charge per quote (when Trip = Yes)
    minHours: 2,             // minimum billable labor hours on any non-empty quote
    pmPct: 8,                // project management, % of adjusted labor hours
    commissioningPct: 5,     // testing, commissioning, client handoff, % of adjusted labor hours
    commissioningMin: 0.5,   // ...but never less than this many hours
    moderatePct: 15,         // site conditions: Moderate adds this % to INSTALL hours
    difficultPct: 35,        // site conditions: Difficult adds this % to INSTALL hours
    productiveHoursPerDay: 6.5
  };
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  function settings(s) {
    const out = {}; s = s || {};
    for (const k in DEFAULTS) out[k] = num(s[k], DEFAULTS[k]);
    return out;
  }
  // install/prog = catalog hours (qty included); itemCount = number of units on the quote.
  // opts: { pricingV, site: 'standard'|'moderate'|'difficult', trip: 'yes'|'no', pm: 'yes'|'no', recycling, customRecycling, crew }
  function price(install, prog, itemCount, opts, s) {
    s = settings(s); opts = opts || {};
    const v2 = opts.pricingV === 2;           // quotes saved before v8.12 keep their old math
    const has = itemCount > 0;
    const sitePct = !v2 ? 0 : opts.site === 'difficult' ? s.difficultPct : opts.site === 'moderate' ? s.moderatePct : 0;
    const siteHours = install * sitePct / 100;
    const adjusted = install + siteHours + prog;
    const pmOn = opts.pm == null ? true : opts.pm === 'yes'; // v8.21.3: PM is a Yes/No option (No by default for new quotes); quotes saved without it keep PM
    const pmHours = v2 && has && pmOn ? adjusted * s.pmPct / 100 : 0;
    const commHours = v2 && has ? Math.max(s.commissioningMin, adjusted * s.commissioningPct / 100) : 0;
    const subtotal = adjusted + pmHours + commHours;
    const minApplied = v2 && has && subtotal < s.minHours;
    const billedHours = minApplied ? s.minHours : subtotal;
    const labor = billedHours * s.hourlyRate;
    const materials = labor * s.materialsPct / 100;
    let recycling = 0;
    if (has || !v2) {
      if (opts.recycling === 'yes') recycling = s.recyclingFee;
      else if (opts.recycling === 'custom') recycling = num(opts.customRecycling, 0);
    }
    const trip = v2 && has && opts.trip !== 'no' ? s.tripFee : 0;
    const crew = Math.max(1, num(opts.crew, 1));
    const days = billedHours / (crew * (v2 ? s.productiveHoursPerDay : 8));
    return { v2, sitePct, siteHours, pmHours, commHours, billedHours, minApplied, labor, materials, recycling, trip, days,
             total: labor + materials + recycling + trip, settings: s };
  }
  window.ASBCPricing = { DEFAULTS, settings, price };
})();
