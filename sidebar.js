// v11.0.0 ASBC Tools sidebar (D-Tools style). Desktop: fixed blue sidebar on the left. Phones: blue top bar with a
// menu button that slides the same sidebar in. Links follow the signed-in person's role (roles.js), like nav.js.
// The old top-menu links (nav.js / the calculator header) are hidden by tools.css; buttons marked data-keep stay in the page header.
(function () {
  if (window.ASBCSidebar) return;
  const LINKS = [
    ['home', 'Dashboard', './home.html?dash=1', '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'],
    ['calculator', 'Calculator', './index.html?calc=1', '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M8 16h2M12 16h2"/>'],
    ['recaps', 'Jobs', './jobs.html', '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'],
    ['calendar', 'Calendar', './calendar.html', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
    ['pipeline', 'Pipeline', './pipeline.html', '<path d="M4 6h16M7 12h10M10 18h4"/>'],
    ['quotes', 'Quote Log', './log.html', '<path d="M7 4h10l3 3v13H4V4z"/><path d="M8 11h8M8 15h6"/>'],
    ['leaderboard', 'Leaderboard', './leaderboard.html', '<path d="M6 20V10M12 20V4M18 20v-7"/>'],
    ['expenses', 'Project Expenses', './expenses.html', '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>'],
    ['design', 'Design Center', './design.html', '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2z"/>'],
    ['users', 'User Roles', './users.html', '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M21 20a6 6 0 0 0-4-5.6"/>']];
  const PAGE = { 'home.html': 'home', 'index.html': 'calculator', '': 'calculator', 'jobs.html': 'recaps', 'calendar.html': 'calendar', 'pipeline.html': 'pipeline',
    'log.html': 'quotes', 'leaderboard.html': 'leaderboard', 'expenses.html': 'expenses', 'users.html': 'users', 'design.html': 'design', 'tool-wire.html': 'design', 'tool-poe.html': 'design', 'tool-tv.html': 'design', 'tool-rack.html': 'design', 'tool-shades.html': 'design', 'tool-lighting.html': 'design', 'tool-ip.html': 'design' }[location.pathname.split('/').pop()] || '';
  const LOGO = '<svg aria-hidden="true" width="40" height="40" viewBox="0 0 120 120"><rect x="4" y="4" width="112" height="112" rx="26" fill="#FFFFFF"/><path d="M36 92 L60 28 L84 92" fill="none" stroke="#2F7FD1" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><rect x="38" y="62" width="44" height="12" rx="6" fill="#C7A66A"/><circle cx="60" cy="68" r="3.5" fill="#FFFFFF"/></svg>';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = p => `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  let side, bar, scrim;
  function build() {
    document.documentElement.classList.add('has-side');
    side = document.createElement('aside'); side.id = 'asbcSide'; side.setAttribute('aria-label', 'Main menu');
    bar = document.createElement('div'); bar.id = 'asbcBar';
    const title = (LINKS.find(l => l[0] === PAGE) || [])[1] || document.title.split('|')[0].trim();
    bar.innerHTML = `<button type="button" id="asbcMenuBtn" aria-label="Open menu" aria-expanded="false"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><div class="t">${esc(title)}</div><a href="./home.html" class="lg" aria-label="ASBC Tools home">${LOGO.replace(/width="40" height="40"/, 'width="32" height="32"')}</a>`;
    scrim = document.createElement('div'); scrim.id = 'asbcScrim';
    document.body.prepend(scrim); document.body.prepend(side); document.body.prepend(bar);
    const open = v => { document.documentElement.classList.toggle('side-open', v); bar.querySelector('#asbcMenuBtn').setAttribute('aria-expanded', String(v)); };
    bar.querySelector('#asbcMenuBtn').onclick = () => open(!document.documentElement.classList.contains('side-open'));
    scrim.onclick = () => open(false);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
  }
  function render(access, name, role) {
    if (!side) build();
    const links = access ? LINKS.filter(([k]) => k === 'home' || ASBCRoles.can(access, k)) : [LINKS[0]];
    const roleTxt = { admin: 'Admin', management: 'Management', director: 'Director', manager: 'Sales', lead: 'Lead tech', installer: 'Installer' }[access] || '';
    side.innerHTML = `<a class="brand" href="./home.html">${LOGO}<span>ASBC<br>Tools</span></a>
      <nav>${links.map(([k, t, h, p]) => `<a class="it${k === PAGE ? ' on' : ''}" href="${h}"${k === PAGE ? ' aria-current="page"' : ''}>${icon(p)}<span>${t}</span></a>`).join('')}</nav>
      ${name !== undefined ? `<div class="me"><div class="nm">${esc(name || '')}</div><div class="rl">${esc(roleTxt)}</div><button type="button" id="asbcSideOut">Sign out</button></div>` : ''}`;
    const out = document.getElementById('asbcSideOut');
    if (out) out.onclick = () => { if (confirm('Sign out on this device?')) firebase.auth().signOut().then(() => location.replace('./index.html')); };
  }
  function start() {
    render(null);
    if (!window.firebase || !firebase.apps || !firebase.apps.length) return;
    firebase.auth().onAuthStateChanged(async u => {
      if (!u) return render(null);
      const email = (u.email || '').toLowerCase();
      let p = null;
      try { const s = await firebase.firestore().collection('config').doc('users').get(); p = ((s.exists && s.data().users) || {})[email] || null; } catch (e) {}
      render(ASBCRoles.accessOf(p, email), (p && p.name) || (email === ASBCRoles.OWNER ? 'Anthony Ward' : email));
    });
  }
  window.ASBCSidebar = { render };
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
