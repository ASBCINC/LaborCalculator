// v8.33.0 Shared top navigation for every page except the calculator (which has the same look built in).
// Each page puts <nav id="asbcNav" data-page="<page key>"></nav> in its header; anything inside it marked data-keep
// (e.g. Refresh, Install app) stays in front of the links. Links follow the signed-in person's role (roles.js).
(function () {
  const LINKS = [['home', 'Home', './home.html'], ['calendar', 'Calendar', './calendar.html'], ['calculator', 'Calculator', './index.html?calc=1'],
    ['recaps', 'Jobs', './jobs.html'], ['pipeline', 'Pipeline', './pipeline.html'], ['expenses', 'Expenses', './expenses.html'], ['leaderboard', 'Leaderboard', './leaderboard.html'],
    ['quotes', 'Quotes', './log.html'], ['users', 'Users', './users.html']];
  const EXTRA = ['expenses', 'leaderboard', 'quotes', 'users'];  // folded into "More" on phones
  const css = `#asbcNav{display:flex;gap:6px;flex-wrap:wrap;align-items:center;justify-content:flex-end}
#asbcNav .hnav{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border-radius:9px;border:1px solid #26292f;background:#1a1d23;color:#fff;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap;cursor:pointer;font-family:inherit}
#asbcNav .hnav:hover{border-color:#C7A66A}#asbcNav .hnav.on{border-color:#C7A66A;color:#C7A66A}
#asbcNav .more{display:none;position:relative}#asbcNav .menu{display:none;position:absolute;right:0;top:40px;z-index:50;background:#111318;border:1px solid #26292f;border-radius:10px;padding:6px;min-width:150px;box-shadow:0 8px 24px rgba(0,0,0,.5)}
#asbcNav .menu a{display:block;padding:9px 10px;border-radius:7px;color:#fff;text-decoration:none;font-size:14px}#asbcNav .menu a:hover{background:#1a1d23}#asbcNav .more.open .menu{display:block}
@media(max-width:639px){#asbcNav .hnav{height:34px;padding:0 10px;font-size:12px}#asbcNav .navx{display:none}#asbcNav .more{display:inline-block}}
@media print{#asbcNav{display:none}}`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function render(access, name) {
    const nav = document.getElementById('asbcNav'); if (!nav) return;
    if (!document.getElementById('asbcNavCss')) { const st = document.createElement('style'); st.id = 'asbcNavCss'; st.textContent = css; document.head.appendChild(st); }
    const page = nav.dataset.page || '';
    const keep = [...nav.querySelectorAll('[data-keep]')];
    const links = access ? LINKS.filter(([k]) => k === 'home' || ASBCRoles.can(access, k)) : [['home', 'Home', './home.html']];
    nav.innerHTML = '';
    keep.forEach(k => nav.appendChild(k));
    nav.insertAdjacentHTML('beforeend', links.map(([k, t, h]) => `<a class="hnav${k === page ? ' on' : ''}${EXTRA.includes(k) ? ' navx' : ''}" href="${h}">${t}</a>`).join(''));
    const extra = links.filter(([k]) => EXTRA.includes(k));
    if (extra.length) nav.insertAdjacentHTML('beforeend', `<span class="more"><button type="button" class="hnav" aria-haspopup="true">More ▾</button><span class="menu">${extra.map(([k, t, h]) => `<a href="${h}">${t}</a>`).join('')}</span></span>`);
    if (name !== undefined) nav.insertAdjacentHTML('beforeend', `<button type="button" class="hnav" id="asbcNavOut" title="Sign out on this device">${esc(String(name || '').split(' ')[0] || 'Me')} · Sign out</button>`);
    const more = nav.querySelector('.more');
    if (more) { more.querySelector('button').onclick = e => { e.stopPropagation(); more.classList.toggle('open'); }; document.addEventListener('click', () => more.classList.remove('open')); }
    const out = document.getElementById('asbcNavOut');
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
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
