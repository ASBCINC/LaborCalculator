// Smoke test: opens every page with a stand-in Firebase (tests/mock-firebase.js) and fails on any JavaScript error
// or a page whose main content never renders. Run: node tests/smoke.js   (needs: npm i playwright; npx playwright install chromium)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), PORT = 4173 + Math.floor(Math.random() * 500);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-firebase.js'), 'utf8');

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'labor-catalog.json'), 'utf8')).slice(0, 60);
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const FIXTURE = {
  user: { email: 'tester@asbc.us' },
  docs: {
    'config/users': { users: { 'tester@asbc.us': { name: 'Test Admin', access: 'admin', role: 'admin' }, 'tech@asbc.us': { name: 'Test Tech', access: 'installer', role: 'tech' } } },
    'config/catalog': { items: catalog },
    'config/settings': { laborRate: 200 },
    'config/designCenter': { links: [], seedV: 99 },
    'config/knowledgeCenter': { items: [{ id: 'k1', cat: 'Audio', sub: 'Test', product: 'Speaker', title: 'Guide', url: 'https://example.com', kind: 'Install guide' }], seedV: 99 },
    'config/productWatch': { json: JSON.stringify({ queue: [], done: [] }) },
    'config/laborReview': { json: JSON.stringify({ weekOf: day(0), summary: 'Test review', suggestions: [], overruns: [] }) }
  },
  collections: {
    quotes: {
      q1: { status: 'scheduled', label: 'Test Job', items: [{ id: catalog[0].id, qty: 2 }], project: { customerName: 'Test Client', salesManagerName: 'Test Admin' }, schedule: { dates: [day(1)], techs: ['tech@asbc.us'] }, ownerEmail: 'tester@asbc.us' },
      q2: { status: 'closed', label: 'Done Job', items: [{ id: catalog[1].id, qty: 1 }], project: { customerName: 'Other Client', salesManagerName: 'Test Admin' }, schedule: { dates: [day(-3)], techs: ['tech@asbc.us'] }, job: { submittedAt: new Date().toISOString(), laborHours: 3, siteHours: 3, log: [], recap: { work: 'Installed', issues: '' } } }
    },
    opportunities: {}, expenses: {}, stats: {}
  }
};

// page, CSS selector that must end up with real content
const PAGES = [
  ['index.html?calc=1', '#productGrid > *'],
  ['home.html?dash=1', '#app, main'],
  ['jobs.html', '#app'],
  ['jobs.html?quote=q2', '#app'],
  ['calendar.html', 'body'],
  ['pipeline.html', 'body'],
  ['log.html', 'body'],
  ['leaderboard.html', 'body'],
  ['expenses.html', 'body'],
  ['users.html', '#app'],
  ['design.html', '#app .sect'],
  ['knowledge.html', '#app .br'],
  ['labor-review.html', '#app .box'],
  ['tool-wire.html', '#res .tile'], ['tool-poe.html', '#out .tile'], ['tool-tv.html', '#rec .tile'], ['tool-rack.html', '#out .tile'],
  ['tool-shades.html', '#sum .tile'], ['tool-lighting.html', '#sum .tile'], ['tool-ip.html', '#sum .tile']
];
const IGNORE = [/favicon/i, /net::ERR/i, /Failed to load resource/i, /service ?worker/i, /ResizeObserver loop/i];

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch(); let failed = 0;
  for (const [vp, label] of [[{ width: 1280, height: 900 }, 'desktop'], [{ width: 390, height: 844 }, 'phone']]) {
    const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
    await ctx.addInitScript(fx => { window.__FIXTURE = fx; try { localStorage.setItem('asbcSeenOnboarding', '1'); } catch (e) {} }, FIXTURE);
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (/firebasejs\/.*firebase-app-compat\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: MOCK });
      if (/firebasejs\//.test(u)) return r.fulfill({ contentType: 'text/javascript', body: '' });
      if (u.startsWith(`http://localhost:${PORT}/`)) return r.continue();
      if (/cdnjs\.cloudflare\.com/.test(u)) return r.continue().catch(() => r.fulfill({ body: '' }));
      return r.fulfill({ status: 200, body: '' });  // fonts, workers, Google, etc.
    });
    for (const [pg, sel] of PAGES) {
      const page = await ctx.newPage(), errs = [];
      page.on('pageerror', e => errs.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error' && !IGNORE.some(rx => rx.test(m.text()))) errs.push('console: ' + m.text().slice(0, 200)); });
      page.on('dialog', d => d.dismiss());
      try {
        await page.goto(`http://localhost:${PORT}/${pg}`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(1500);
        const ok = await page.evaluate(s => [...document.querySelectorAll(s)].some(e => (e.innerText || '').trim().length > 0 || e.children.length), sel);
        if (!ok) errs.push(`nothing rendered in "${sel}"`);
        const stuck = await page.evaluate(() => /Could not load|Loading…$/.test((document.getElementById('app') || {}).innerText || ''));
        if (stuck) errs.push('page stuck on Loading / Could not load');
      } catch (e) { errs.push('navigation: ' + e.message.split('\n')[0]); }
      console.log(`${errs.length ? 'FAIL' : 'ok  '} [${label}] ${pg}${errs.length ? '\n      ' + errs.join('\n      ') : ''}`);
      failed += errs.length ? 1 : 0; await page.close();
    }
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(failed ? `\n${failed} page check(s) failed` : '\nall pages ok'); process.exit(failed ? 1 : 0);
})();
