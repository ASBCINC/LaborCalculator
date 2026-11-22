// v8.29.0 Roles and what each one can open. Used by every page (home, calculator, calendar, job recaps,
// pipeline, leaderboard, quote log, user roles). The Firestore rules enforce the database side
// (user roles admin-only, pipeline admin + sales director, installers only their assigned jobs).
// A user's role is config/users[email].access. Older entries without it are read from role/allQuotes.
(function () {
  const DEFS = {
    admin:     { label: 'Admin',          pages: ['calendar', 'calculator', 'recaps', 'pipeline', 'leaderboard', 'quotes', 'users'], quotes: 'all',  recaps: 'all' },
    director:  { label: 'Sales Director', pages: ['calendar', 'calculator', 'pipeline', 'leaderboard', 'quotes'],                    quotes: 'all',  recaps: 'none' },
    manager:   { label: 'Sales Manager',  pages: ['calendar', 'calculator', 'leaderboard', 'quotes'],                                quotes: 'own',  recaps: 'none' },
    lead:      { label: 'Team Lead',      pages: ['calendar', 'calculator', 'recaps', 'quotes'],                                     quotes: 'all',  recaps: 'assigned' },
    installer: { label: 'Installer',      pages: ['calendar', 'recaps'],                                                             quotes: 'none', recaps: 'assigned' }
  };
  const ORDER = ['admin', 'director', 'manager', 'lead', 'installer'];
  const PAGES = {
    calendar:    { label: 'Install Calendar',   href: './calendar.html' },
    calculator:  { label: 'Labor Calculator',   href: './index.html?calc=1' },
    recaps:      { label: 'Job Recaps',         href: './jobs.html' },
    pipeline:    { label: 'Pipeline Dashboard', href: './pipeline.html' },
    leaderboard: { label: 'Leaderboard',        href: './leaderboard.html' },
    quotes:      { label: 'Quote Log',          href: './log.html' },
    users:       { label: 'User Roles',         href: './users.html' }
  };
  // The fields older code reads (role: admin | rep | tech, allQuotes) for each role.
  const LEGACY = { admin: { role: 'admin', allQuotes: true }, director: { role: 'rep', allQuotes: true }, manager: { role: 'rep', allQuotes: false },
                   lead: { role: 'tech', allQuotes: true }, installer: { role: 'tech', allQuotes: false } };
  const OWNER = 'a.ward@asbc.us';
  function accessOf(p, email) {
    if (String(email || '').toLowerCase() === OWNER) return 'admin';
    if (!p) return null;
    if (p.access && DEFS[p.access]) return p.access;
    if (p.role === 'admin') return 'admin';
    if (p.role === 'tech') return p.allQuotes ? 'lead' : 'installer';
    return p.allQuotes ? 'director' : 'manager';
  }
  const can = (access, page) => !!(DEFS[access] && DEFS[access].pages.includes(page));
  function deny(page, el) {
    const box = el || document.body;
    box.innerHTML = `<div style="max-width:520px;margin:60px auto;text-align:center;color:#c9ccd2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <div style="font-size:18px;font-weight:700;color:#fff">${(PAGES[page] || {}).label || 'This page'} isn't part of your role</div>
      <div style="margin-top:8px;font-size:14px">Ask Anthony if you need access.</div>
      <a href="./home.html" style="display:inline-block;margin-top:16px;padding:10px 16px;border-radius:10px;background:#C7A66A;color:#050505;font-weight:700;text-decoration:none">Back to Home</a></div>`;
  }
  window.ASBCRoles = { DEFS, ORDER, PAGES, LEGACY, OWNER, accessOf, can, deny };
})();
