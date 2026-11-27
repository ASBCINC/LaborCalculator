// v10.8.0 App error log (Anthony, Nov 24 2026, after Eugene reported the Jobs page not loading).
// Records, per page view, into Firestore clientLogs (admins read it on the Users page > App problems):
//   error  - a script error or a failed promise on the page
//   failed - the page showed "Could not load" (ASBCDiag.fail)
//   slow   - the page was not ready 10 s after it opened (pages that call ASBCDiag.ready: Jobs, Calculator)
//   late   - it did become ready, but only after the slow mark (how long it really took)
// Each entry: who, page, what happened, seconds since open, app version, phone/browser, connection type,
// online or not, installed app or browser. At most 6 entries a page view, the same message only once.
// Nothing is written before sign-in; entries wait in memory and are sent once the person is signed in.
(function () {
  if (window.ASBCDiag) return;
  const T0 = 0, SLOW_MS = 10000, MAX = 6;  // times count from when the page was opened
  const page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
  let sent = 0, ready = false, slowLogged = false;
  const seen = new Set(), queue = [];
  const secs = () => Math.round((performance.now() - T0) / 100) / 10;
  function base() {
    const c = navigator.connection || {};
    return {
      page, at: new Date().toISOString(), secs: secs(), ver: window.ASBC_VERSION || '',
      ua: String(navigator.userAgent || '').slice(0, 220),
      net: [c.effectiveType, c.downlink ? c.downlink + 'Mbps' : '', c.saveData ? 'data-saver' : ''].filter(Boolean).join(' '),
      online: navigator.onLine !== false,
      app: (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true ? 'installed' : 'browser',
      visible: document.visibilityState
    };
  }
  function flush() {
    const fb = window.firebase; if (!fb || !fb.apps || !fb.apps.length || !fb.auth) return;
    const u = fb.auth().currentUser; if (!u || !u.email) return;
    while (queue.length) {
      const e = queue.shift(); e.email = u.email.toLowerCase();
      try { fb.firestore().collection('clientLogs').add(e).catch(() => {}); } catch (x) {}
    }
  }
  function log(kind, msg, extra) {
    msg = String(msg || '').slice(0, 300);
    const key = kind + '|' + msg; if (seen.has(key) || sent >= MAX) return; seen.add(key); sent++;
    queue.push(Object.assign(base(), { kind, msg }, extra || {})); flush();
  }
  window.addEventListener('error', e => {
    if (e && e.target && e.target !== window && (e.target.src || e.target.href)) return log('error', 'could not load ' + (e.target.src || e.target.href));
    log('error', (e && e.message) || 'script error', { where: e && e.filename ? String(e.filename).split('/').pop() + ':' + e.lineno : '', stack: e && e.error && e.error.stack ? String(e.error.stack).slice(0, 600) : '' });
  }, true);
  window.addEventListener('unhandledrejection', e => { const r = e && e.reason; log('error', (r && (r.message || r.code)) || String(r), { stack: r && r.stack ? String(r.stack).slice(0, 600) : '' }); });
  window.addEventListener('offline', () => { if (!ready) log('offline', 'phone went offline while the page was loading'); });
  // pages that call ASBCDiag.ready() get the 10-second check
  let watch = null;
  function arm() { if (watch || ready) return; watch = setTimeout(() => { if (!ready && document.visibilityState === 'visible') { slowLogged = true; log('slow', 'not ready after ' + SLOW_MS / 1000 + ' s', { stage: window.ASBCDiagStage || '' }); } }, Math.max(0, SLOW_MS - performance.now())); }
  window.ASBCDiag = {
    track() { arm(); },                                  // call early on pages that will call ready()
    stage(s) { window.ASBCDiagStage = String(s).slice(0, 60); },
    ready(what) { if (ready) return; ready = true; clearTimeout(watch); if (slowLogged) log('late', 'ready after ' + secs() + ' s', { stage: what || '' }); },
    fail(msg) { ready = true; clearTimeout(watch); log('failed', msg); },
    flush
  };
  if (['jobs', 'index'].includes(page)) arm();
  // send anything waiting once sign-in finishes
  let tries = 0; const iv = setInterval(() => { flush(); if (++tries > 60 || (queue.length === 0 && tries > 5 && sent)) clearInterval(iv); }, 2000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
})();
