// v8.25.0: "Update available" button on the calculator and Jobs pages.
// The installed app (PWA) can stay frozen in the background for days. This checks the live version
// (from sw.js, never cached) when the page opens, whenever it comes back on screen, and every 30 minutes.
// If a newer version is live, a gold button appears at the top; tapping it saves any open recap and reloads.
// ASBC_VERSION is kept in step by `python3 scripts/release.py bump X.Y.Z`.
(function () {
  const ASBC_VERSION = '10.5.0';
  const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  let shown = false, last = 0;
  function show(v) {
    if (shown) return; shown = true;
    const b = document.createElement('button');
    b.id = 'asbcUpdateBtn'; b.type = 'button';
    b.textContent = 'Update available (v' + v + ') - tap to update';
    b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(8px + env(safe-area-inset-top));z-index:9999;background:#C7A66A;color:#050505;border:0;border-radius:999px;padding:12px 18px;font:700 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.5);max-width:calc(100% - 24px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer';
    b.onclick = async () => {
      b.textContent = 'Updating...'; b.disabled = true;
      try { if (typeof window.asbcBeforeUpdate === 'function') await window.asbcBeforeUpdate(); } catch (e) {}
      try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch (e) {}
      try { if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } } catch (e) {}
      location.reload();
    };
    document.body.appendChild(b);
  }
  async function check() {
    if (shown || !navigator.onLine || Date.now() - last < 60000) return; last = Date.now();
    try {
      const r = await fetch('./sw.js?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const m = (await r.text()).match(/asbc-calc-v([\d.]+)/);
      if (m && newer(m[1], ASBC_VERSION)) show(m[1]);
    } catch (e) {}
  }
  window.asbcCheckForUpdate = check;
  setTimeout(check, 3000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('online', check);
  setInterval(check, 30 * 60 * 1000);
})();
