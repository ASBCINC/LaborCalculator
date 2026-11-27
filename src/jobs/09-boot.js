// ---------- bullet points in recap boxes (v8.15.3) ----------
// "• Bullet" starts a bullet on the current line; Enter on a bullet line starts the next bullet;
// Enter on an empty bullet ends the list.
const BUL = '\u2022 ';
document.addEventListener('click', e => {
  const b = e.target.closest('.bl'); if (!b) return;
  const ta = document.querySelector(`.rc[data-k="${b.dataset.k}"]`); if (!ta) return;
  const v = ta.value, pos = ta.selectionStart ?? v.length;
  const lineStart = v.lastIndexOf('\n', pos - 1) + 1;
  if (v.slice(lineStart, lineStart + BUL.length) === BUL) { ta.focus(); return; }
  const lineEmpty = v.slice(lineStart, pos).trim() === '' && (v.indexOf('\n', pos) === -1 ? v.slice(pos) : v.slice(pos, v.indexOf('\n', pos))).trim() === '';
  const insertAt = lineEmpty ? lineStart : lineStart;
  ta.value = v.slice(0, insertAt) + BUL + v.slice(insertAt);
  ta.focus(); const c = pos + BUL.length; ta.setSelectionRange(c, c);
});
document.addEventListener('keydown', e => {
  const ta = e.target; if (!ta.classList || !ta.classList.contains('rc') || e.key !== 'Enter' || e.shiftKey) return;
  const v = ta.value, pos = ta.selectionStart, lineStart = v.lastIndexOf('\n', pos - 1) + 1, line = v.slice(lineStart, pos);
  if (!line.startsWith(BUL)) return;
  e.preventDefault();
  if (line.trim() === BUL.trim()) { ta.value = v.slice(0, lineStart) + v.slice(pos); ta.setSelectionRange(lineStart, lineStart); return; }
  ta.value = v.slice(0, pos) + '\n' + BUL + v.slice(pos); const c = pos + 1 + BUL.length; ta.setSelectionRange(c, c);
});

// ---------- install as an app (v8.15.2) ----------
// Same installable app as the calculator; when a tech opens it, sign-in sends them straight to Jobs.
(function () {
  const btn = document.getElementById('installBtn');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; btn.style.display = ''; });
  window.addEventListener('appinstalled', () => { btn.style.display = 'none'; });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  btn.style.display = ''; // always offered in the browser; hidden once running as the installed app
  btn.addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; btn.style.display = 'none'; return; }
    alert(ios ? 'To install: tap the Share button (square with an arrow) at the bottom of Safari, then "Add to Home Screen".'
              : 'To install: open the browser menu (⋮) and choose "Install app" or "Add to Home screen".');
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();

firebase.auth().onAuthStateChanged(async (u) => {
  if (!u || !u.emailVerified) { window.ASBCDiag && ASBCDiag.ready('signed out'); app().innerHTML = '<div class="empty">Sign in (and confirm your email) on the <a href="./" style="text-decoration:underline">calculator</a> first, then reopen Jobs.</div>'; return; }
 try { if (!(await u.getIdTokenResult()).claims.email_verified) { await u.reload(); await u.getIdToken(true); } } catch (e) {}  // v8.28.1: refresh a sign-in token issued before the email was confirmed
  window.ASBCDiag && ASBCDiag.stage('loading users and catalog');
  const [us, cs] = await Promise.all([quick(() => db.collection('config').doc('users').get(), () => restDoc('config/users'), 'users').catch(() => null), quick(() => db.collection('config').doc('catalog').get(), () => restDoc('config/catalog'), 'catalog').catch(() => null)]);
  USERS = (us && us.exists && us.data().users) || {};
  if (cs && cs.exists) (cs.data().items || []).forEach(i => CATALOG.set(i.id, i));
  const email = (u.email || '').toLowerCase();
  const p = USERS[email] || (email === 'a.ward@asbc.us' ? { name: 'Anthony Ward', role: 'admin' } : null);
  if (!p) { app().innerHTML = '<div class="empty">' + esc(email) + ' is not approved yet. Ask Anthony.</div>'; return; }
  ME = { email, name: p.name, role: p.role || 'rep', allQuotes: !!p.allQuotes, access: ASBCRoles.accessOf(p, email) };
  if (!ASBCRoles.can(ME.access, 'recaps')) return ASBCRoles.deny('recaps', app());  // v8.29.0 roles
  if (['admin', 'management'].includes(ME.access)) { try { const st = await db.collection('config').doc('settings').get(); SETTINGS = (st.exists && st.data()) || {}; } catch (e) {} }  // v10.0.0 rates for revenue/loss
    window.ASBCDiag && ASBCDiag.stage(qid ? 'opening job' : 'loading job list');
    try { if (qid) await showJob(qid); else if (new URLSearchParams(location.search).get('new') && ME.role !== 'rep') showNew(); else await showList(); window.ASBCDiag && ASBCDiag.ready(qid ? 'job' : 'list'); }
    catch (e) { app().innerHTML = '<div class="empty">Could not load: ' + esc(e.message) + '</div>'; window.ASBCDiag && ASBCDiag.fail('Could not load: ' + e.message); }  // v10.8.0 error log
});
