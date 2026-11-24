// Cloudflare Worker: "asbc-dtools-relay" (deployed as yellow-cloud-830a). Paste into the Worker's code editor.
// 1) GET  /hook/<HOOK_SECRET>  starts the "Sync D-Tools opportunities" GitHub workflow (D-Tools webhook + cron-job.org).
// 2) POST /recap  (v8.22.0) instant Teams message when an installer submits a job report.
//    The Jobs page sends {quote: <id>} with the signed-in user's Firebase ID token. The Worker reads the quote from
//    Firestore WITH THAT TOKEN (so Firestore itself proves who is calling and what they may see), builds a card and
//    posts it to the Power Automate "Send webhook alerts to a chat" flow, once for the admin and once for the rep.
//    {test: true} sends only to the admin.
// 3) POST /notify (v8.33.0) Teams messages to the techs assigned to a job, sent by an ADMIN's signed-in session (the D-Tools
//    calendar sync): {kind: 'schedule', quote, change: 'new'|'updated'} when an install is added or its days/times/techs change,
//    {kind: 'nudge', quote} at the end of an install day when no job report was submitted. The caller must be an admin in config/users.
// Variables and Secrets (Worker > Settings):
//   GITHUB_TOKEN  fine-grained token, only ASBCINC/LaborCalculator, "Actions: Read and write"
//   HOOK_SECRET   the random string in the webhook URL
//   TEAMS_HOOK    the Power Automate webhook URL (type: Secret)
//   ADMIN_EMAIL   optional: the work address that always gets the Teams message
// 4) POST /ramp (v9.6.0) Ramp receipts + project expenses, called by the app with the signed-in user's Firebase ID token.
//    {action:'txns', from, to, email?} card charges in that window (admins/management: everyone's or one person's; others: only their own)
//    {action:'attach', txn, image, title}  uploads the receipt photo to that charge and puts the project title in front of its memo
//    {action:'ping'}                  checks the Ramp keys work (admins)
//   RAMP_CLIENT_ID / RAMP_CLIENT_SECRET  Ramp developer app "Labor Calculator" (client credentials; scopes transactions:read,
//                 receipts:read/write, memos:read/write, users:read). Nothing here can move money or change cards.
//                 (if not set: every config/users entry with role "admin")
// 5) /photo (v10.6.0) install photos taken in the app, kept in Workers KV (binding PHOTOS; free plan: 1 GB, 1,000 saves a day).
//    POST {action:'put', quote, image: JPEG data URL}  caller must be able to read that job in Firestore (or it is a brand-new job-<time> id)
//    POST {action:'del', k}                            the tech who took it, or an admin
//    GET  /photo/<job id>/<random id>.jpg              serves the photo; the random id makes the link unguessable (like an "anyone with the link" share)
const WORKFLOW = 'https://api.github.com/repos/ASBCINC/LaborCalculator/actions/workflows/sync-opportunities.yml/dispatches';
const FS = 'https://firestore.googleapis.com/v1/projects/asbc-calculator/databases/(default)/documents/';
const APP_ORIGIN = 'https://asbcinc.github.io';
const PHOTO_KEY = /^[\w-]{1,100}\/[0-9a-f-]{36}\.jpg$/;
const PHOTO_BASE = 'https://yellow-cloud-830a.a-ward-612.workers.dev/photo/';
const CORS = { 'Access-Control-Allow-Origin': APP_ORIGIN, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' };

async function startSync(env, why) {
  const r = await fetch(WORKFLOW, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'asbc-dtools-relay', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' })
  });
  console.log('dispatch', why, r.status);
  return r.status;
}

// Firestore REST value -> plain JS
function val(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('mapValue' in v) return obj(v.mapValue.fields);
  return null;
}
const obj = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, val(v)]));
async function getDoc(path, token) {
  const r = await fetch(FS + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return obj((await r.json()).fields);
}

const clip = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const pt = iso => { try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return iso || ''; } };

function buildCard(q, id, users) {
  const j = q.job || {}, p = q.project || {}, rec = j.recap || {}, so = q.signoff || {}, sk = j.signoffSkip || {};
  const name = e => ((users[e] || {}).name) || e || '';
  const job = q.label || p.customerName || 'Job';
  const status = j.jobStatus || 'status not set';
  const hours = Math.round((j.log || []).reduce((a, r) => a + (Number(r.hours) || 0), 0) * 100) / 100;
  const techs = ((q.schedule || {}).techs || []).map(name).join(', ');
  const facts = [['Status', status], ['Client', p.dtoolsClientName], ['D-Tools #', p.dtoolsOppNumber], ['Sales rep', p.salesManagerName],
    ['Submitted', (name(j.submittedBy) + ' · ' + pt(j.submittedAt)).trim()], ['Techs', techs], ['Time on site', hours ? hours + ' hrs' : '']]
    .filter(([, v]) => v).map(([title, value]) => ({ title, value: String(value) }));
  let signoff = '';
  if (so.status === 'signed') signoff = 'Client signed off: ' + (so.name || '') + (so.concerns ? ' — CLIENT CONCERNS, see report' : '');
  else if (sk.status === 'not-present') signoff = 'No client signature: client not present' + (sk.reason ? ' — ' + clip(sk.reason, 120) : '');
  else if (sk.status === 'declined') signoff = 'No client signature: client declined' + (sk.reason ? ' — ' + clip(sk.reason, 120) : '');
  else if (j.jobStatus === 'Complete') signoff = 'Client sign-off: not recorded';
  const body = [
    { type: 'TextBlock', size: 'Medium', weight: 'Bolder', wrap: true, text: (Number(j.revision) > 1 ? 'Job report updated (rev ' + j.revision + '): ' : 'Job report submitted: ') + clip(job, 80) },
    { type: 'FactSet', facts }
  ];
  const section = (label, text) => { if (String(text || '').trim()) body.push({ type: 'TextBlock', wrap: true, spacing: 'Small', text: '**' + label + ':** ' + clip(text, 400) }); };
  if (Number(j.revision) > 1) section('What changed', j.changeSummary);  // v8.24.0: tech edited and resubmitted
  section('Work completed', rec.work);
  section('Problems', rec.issues);
  section('Open items / return visit', rec.followups);
  section('Client feedback', rec.client);
  (j.extras || []).filter(x => x && (x.desc || x.hours)).forEach(x =>
    body.push({ type: 'TextBlock', wrap: true, color: 'Attention', text: 'Possible change order: ' + clip(x.desc, 160) + (x.hours ? ' (' + x.hours + ' hrs)' : '') }));
  if (signoff) body.push({ type: 'TextBlock', wrap: true, color: so.concerns ? 'Attention' : 'Default', text: signoff });
  // v10.6.0 install photos taken in the app: up to 4 thumbnails (tap for full size), the rest are in the report
  const pics = ((j.photos || {}).list || []).filter(x => x && PHOTO_KEY.test(String(x.k || '')));
  if (pics.length) {
    body.push({ type: 'TextBlock', wrap: true, spacing: 'Medium', text: '**Install photos (' + pics.length + ')**' + (pics.length > 4 ? ' · ' + (pics.length - 4) + ' more in the report' : '') });
    body.push({ type: 'ImageSet', imageSize: 'Medium', images: pics.slice(0, 4).map(x => ({ type: 'Image', url: PHOTO_BASE + x.k, altText: 'Install photo', selectAction: { type: 'Action.OpenUrl', url: PHOTO_BASE + x.k } })) });
  }
  return {
    type: 'AdaptiveCard', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', version: '1.4', body,
    actions: [{ type: 'Action.OpenUrl', title: 'View report', url: 'https://asbcinc.github.io/LaborCalculator/jobs.html?quote=' + encodeURIComponent(id) }]
  };
}

async function postTeams(env, to, card) {
  const r = await fetch(env.TEAMS_HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }] }) });
  return r.status;
}

async function recap(request, env) {
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (!env.TEAMS_HOOK) return json({ error: 'TEAMS_HOOK not set' }, 500);
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  let b = {}; try { b = await request.json(); } catch (e) {}
  const id = String(b.quote || '');
  if (!token || !/^[\w-]{1,100}$/.test(id)) return json({ error: 'bad request' }, 400);
  let q, users = {};
  try { q = await getDoc('quotes/' + encodeURIComponent(id), token); } catch (e) { return json({ error: 'cannot read job: ' + e.message }, 403); }
  if (!['submitted', 'closed'].includes(q.status) || !(q.job || {}).submittedAt) return json({ error: 'job not submitted' }, 409);
  try { users = (await getDoc('config/users', token)).users || {}; } catch (e) {}
  const work = e => /@asbc\.us$/.test(e);
  const admins = (env.ADMIN_EMAIL ? [String(env.ADMIN_EMAIL)] : Object.keys(users).filter(e => (users[e] || {}).role === 'admin'))
    .map(e => e.trim().toLowerCase()).filter(work);
  if (!admins.length) return json({ error: 'no admin recipient' }, 500);
  const card = buildCard(q, id, users);
  const repName = (q.project || {}).salesManagerName || '';
  const repEmail = (Object.keys(users).find(e => (users[e] || {}).name === repName) || '').toLowerCase();
  const sent = {};
  for (const a of admins) sent['admin' + (admins.length > 1 ? admins.indexOf(a) + 1 : '')] = await postTeams(env, a, card);
  if (!b.test && work(repEmail) && !admins.includes(repEmail)) sent.rep = await postTeams(env, repEmail, card);
  else if (!b.test) sent.rep = repEmail ? 'skipped (same as admin or not a work address)' : 'skipped (rep not found in users list)';
  // v9.10.0 completed jobs also go to the store's manager (config/settings.completionNotify: store name -> work email)
  if (!b.test && (q.job || {}).jobStatus === 'Complete') { let cn = {}; try { cn = (await getDoc('config/settings', token)).completionNotify || {}; } catch (e) {}
    const tn = ((q.schedule || {}).techs || []).map(e => String((users[e] || {}).name || e).split(/[\s@.]/)[0].toLowerCase());
    let store = (users[repEmail] || {}).store || ''; if (!store || store === 'none') store = tn.some(n => ['joseph', 'eugene'].includes(n)) ? 'San Francisco' : tn.some(n => ['ivan', 'mina'].includes(n)) ? 'West Hollywood' : '';
    const to = String(cn[store] || '').trim().toLowerCase();
    if (work(to) && !admins.includes(to) && to !== repEmail) sent.store = await postTeams(env, to, card); else sent.store = to ? 'skipped (same person)' : 'no store manager for ' + (store || 'unknown store'); }
  console.log('recap', id, JSON.stringify(sent));
  return json({ ok: true, sent });
}

const t12 = v => { if (!v) return ''; const [h, m] = String(v).split(':').map(Number); return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' AM' : ' PM'); };
const dayTxt = d => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) { return d; } };
function scheduleLines(sc) {
  return (sc.dates || []).map(d => { const w = (sc.times || {})[d] || (!sc.times || !Object.keys(sc.times).length ? sc : null);
    return dayTxt(d) + (w && w.start ? ' · ' + t12(w.start) + (w.end ? '–' + t12(w.end) : '') : ' · all day'); }).join('\n');
}
function jwtEmail(token) { try { const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return String(p.email || '').toLowerCase(); } catch (e) { return ''; } }
async function notifyTechs(request, env) {
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (!env.TEAMS_HOOK) return json({ error: 'TEAMS_HOOK not set' }, 500);
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  let b = {}; try { b = await request.json(); } catch (e) {}
  const kind = ['nudge', 'prep', 'opp'].includes(b.kind) ? b.kind : 'schedule';
  if (kind === 'opp') return notifyOpp(token, b, env, json);
  const id = String(b.quote || '');
  if (!token || !/^[\w-]{1,100}$/.test(id)) return json({ error: 'bad request' }, 400);
  let q, users = {};
  try { q = await getDoc('quotes/' + encodeURIComponent(id), token); users = (await getDoc('config/users', token)).users || {}; }
  catch (e) { return json({ error: 'cannot read job: ' + e.message }, 403); }
  const caller = jwtEmail(token);  // the token passed Firestore's own check above, so its email is genuine
  if (!((env.ADMIN_EMAIL && caller === String(env.ADMIN_EMAIL).toLowerCase()) || (users[caller] || {}).role === 'admin' || (users[caller] || {}).access === 'admin')) return json({ error: 'admin only' }, 403);
  const sc = q.schedule || {}, p = q.project || {};
  const techs = (sc.techs || []).map(e => String(e).toLowerCase()).filter(e => /@asbc\.us$/.test(e));
  const repEmail = (Object.keys(users).find(e => (users[e] || {}).name === p.salesManagerName) || '').toLowerCase();
  const to = kind === 'prep' ? [repEmail].filter(e => /@asbc\.us$/.test(e)) : techs;
  if (!to.length) return json({ ok: true, sent: {}, note: kind === 'prep' ? 'rep not found' : 'no techs' });
  const name = e => ((users[e] || {}).name) || e;
  const job = p.dtoolsProjectName || q.label || p.customerName || 'Job';
  const url = 'https://asbcinc.github.io/LaborCalculator/jobs.html?quote=' + encodeURIComponent(id);
  const facts = [['When', scheduleLines(sc)], ['Address', sc.address], ['Client', p.dtoolsClientName], ['Crew', techs.map(name).join(', ')], ['Sales rep', p.salesManagerName]]
    .filter(([, v]) => v).map(([title, value]) => ({ title, value: String(value) }));
  const body = [{ type: 'TextBlock', size: 'Medium', weight: 'Bolder', wrap: true,
    text: kind === 'nudge' ? 'Reminder: submit today\'s job report — ' + clip(job, 80) : kind === 'prep' ? ((b.unstaged || []).length ? 'Products not staged in D-Tools — upcoming install: ' : 'Install in 2 days: please confirm the site is ready — ') + clip(job, 80) : (b.change === 'new' ? 'New install scheduled: ' : 'Install schedule changed: ') + clip(job, 80) }];
  if (kind === 'nudge') body.push({ type: 'TextBlock', wrap: true, text: 'No job report has been submitted for today yet. Open the job, log your time and submit the recap before you finish.' });
  body.push({ type: 'FactSet', facts });
  if (kind === 'prep') { const parts = q.parts || {}; const us = Array.isArray(b.unstaged) ? b.unstaged.slice(0, 15) : []; if (us.length) { facts.push({ title: 'Not staged', value: clip(us.join(', '), 300) }); body.push({ type: 'TextBlock', wrap: true, color: 'Attention', text: 'These products are not set to Staged in D-Tools yet. Please confirm they are received and staged before the install, or tell Anthony what is missing.' }); } else if (parts.total) facts.push({ title: 'Parts', value: parts.ready >= parts.total ? 'All ' + parts.total + ' ready' : (parts.total - parts.ready) + ' of ' + parts.total + ' not staged: ' + clip((parts.notReady || []).join(', '), 200) });
    body.push({ type: 'TextBlock', wrap: true, weight: 'Bolder', spacing: 'Medium', text: 'Please confirm with the client:' });
    (Array.isArray(b.checklist) ? b.checklist : []).slice(0, 12).forEach(c => body.push({ type: 'TextBlock', wrap: true, spacing: 'Small', text: '• ' + clip(c, 160) })); }
  (sc.notes || []).forEach(n => body.push({ type: 'TextBlock', wrap: true, spacing: 'Small', text: '**Notes:** ' + clip(n, 300) }));
  const card = { type: 'AdaptiveCard', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', version: '1.4', body,
    actions: [{ type: 'Action.OpenUrl', title: kind === 'nudge' ? 'Open job report' : 'View job', url }] };
  const sent = {};
  for (const t of to) sent[t] = await postTeams(env, t, card);
  console.log('notify', kind, id, JSON.stringify(sent));
  return json({ ok: true, sent });
}

// v9.3.0 opportunity in Proposal / Customer Review with no labor quote: Teams message to its sales rep (admin session only)
async function notifyOpp(token, b, env, json) {
  const id = String(b.opp || '');
  if (!token || !/^[\w-]{1,100}$/.test(id)) return json({ error: 'bad request' }, 400);
  let o, users = {};
  try { o = await getDoc('opportunities/' + encodeURIComponent(id), token); users = (await getDoc('config/users', token)).users || {}; }
  catch (e) { return json({ error: 'cannot read opportunity: ' + e.message }, 403); }
  const caller = jwtEmail(token);
  if (!((env.ADMIN_EMAIL && caller === String(env.ADMIN_EMAIL).toLowerCase()) || (users[caller] || {}).role === 'admin' || (users[caller] || {}).access === 'admin')) return json({ error: 'admin only' }, 403);
  const rep = (Object.keys(users).find(e => (users[e] || {}).name === o.owner) || '').toLowerCase();
  if (!/@asbc\.us$/.test(rep)) return json({ ok: true, sent: {}, note: 'rep not found' });
  const card = { type: 'AdaptiveCard', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', version: '1.4', body: [
    { type: 'TextBlock', size: 'Medium', weight: 'Bolder', wrap: true, text: 'Labor quote needed: ' + clip(o.name, 90) },
    { type: 'TextBlock', wrap: true, text: 'This opportunity is in ' + (o.stage || 'Proposal') + ' but has no labor quote in the labor calculator. If it includes installation, please build the labor quote before the proposal goes to the client.' },
    { type: 'FactSet', facts: [['Client', o.clientName], ['Opportunity', o.number], ['Value', o.total ? '$' + Number(o.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '']].filter(([, v]) => v).map(([title, value]) => ({ title, value: String(value) })) }],
    actions: [{ type: 'Action.OpenUrl', title: 'Open the labor calculator', url: 'https://asbcinc.github.io/LaborCalculator/index.html?calc=1' }] };
  const st = await postTeams(env, rep, card);
  console.log('notify opp', id, rep, st);
  return json({ ok: true, sent: { [rep]: st } });
}
// ---------- v9.6.0 Ramp ----------
const RAMP = 'https://api.ramp.com/developer/v1/';
const RAMP_SCOPES = 'transactions:read receipts:read receipts:write memos:read memos:write users:read';
let rampTok = null, rampExp = 0;
async function rampToken(env) {
  if (rampTok && Date.now() < rampExp) return rampTok;
  if (!env.RAMP_CLIENT_ID || !env.RAMP_CLIENT_SECRET) throw new Error('RAMP_CLIENT_ID / RAMP_CLIENT_SECRET not set');
  const r = await fetch(RAMP + 'token', { method: 'POST', headers: { Authorization: 'Basic ' + btoa(env.RAMP_CLIENT_ID + ':' + env.RAMP_CLIENT_SECRET), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent(RAMP_SCOPES) });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {}
  if (!r.ok || !j.access_token) throw new Error('Ramp sign-in ' + r.status + ' ' + t.slice(0, 160));
  rampTok = j.access_token; rampExp = Date.now() + Math.max(60, (Number(j.expires_in) || 3600) - 300) * 1000; return rampTok;
}
async function ramp(env, path, opt) {
  opt = opt || {};
  const r = await fetch(path.startsWith('http') ? path : RAMP + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + await rampToken(env), Accept: 'application/json' }, opt.headers || {}) }));
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { j = { raw: t.slice(0, 200) }; }
  if (!r.ok) throw new Error((opt.method || 'GET') + ' ' + path.split('?')[0].replace(RAMP, '') + ' ' + r.status + ' ' + t.slice(0, 200));
  return j;
}
async function rampAll(env, path, max) {
  let out = [], next = path, n = 0;
  while (next && n++ < (max || 10)) { const j = await ramp(env, next); out = out.concat(j.data || []); next = j.page && j.page.next; }
  return out;
}
async function rampUsers(env) { return (await rampAll(env, 'users?page_size=100', 5)).map(u => ({ id: u.id, email: String(u.email || '').toLowerCase(), name: ((u.first_name || '') + ' ' + (u.last_name || '')).trim() })); }
const money = a => { if (a == null) return 0; if (typeof a === 'object') return Number(a.amount || 0) / (Number(a.minor_unit_conversion_rate) || 100); return Number(a) || 0; };
async function rampRoute(request, env) {
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  let b = {}; try { b = await request.json(); } catch (e) {}
  if (!token) return json({ error: 'sign in first' }, 401);
  let users = {};
  try { users = (await getDoc('config/users', token)).users || {}; } catch (e) { return json({ error: 'not approved: ' + e.message }, 403); }
  const caller = jwtEmail(token), me = users[caller] || {};
  if (!users[caller] && caller !== String(env.ADMIN_EMAIL || '-').toLowerCase()) return json({ error: 'not approved' }, 403);
  const boss = caller === String(env.ADMIN_EMAIL || '-').toLowerCase() || me.role === 'admin' || ['admin', 'management'].includes(me.access);
  try {
    if (b.action === 'ping') { const u = await rampUsers(env); return json({ ok: true, users: u.length }); }
    if (b.action === 'txns') {
      const from = String(b.from || '').slice(0, 10), to = String(b.to || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return json({ error: 'from/to dates needed' }, 400);
      const us = await rampUsers(env), byId = Object.fromEntries(us.map(u => [u.id, u]));
      let q = `transactions?page_size=100&from_date=${from}T00:00:00Z&to_date=${to}T23:59:59Z`;
      if (!boss || b.email) { const who = boss ? String(b.email).toLowerCase() : caller; const mine = us.find(u => u.email === who); if (!mine) return json({ ok: true, txns: [], note: 'no Ramp user with ' + who }); q += '&user_id=' + mine.id; }
      const tx = await rampAll(env, q, boss ? 10 : 3);
      return json({ ok: true, txns: tx.map(t => { const uid = (t.card_holder || {}).user_id || t.user_id; const u = byId[uid] || {};
        return { id: t.id, amount: money(t.amount), date: String(t.user_transaction_time || t.settlement_date || '').slice(0, 10), merchant: t.merchant_name || t.merchant_descriptor || '',
          memo: t.memo || '', receipts: (t.receipts || []).length, state: t.state || '', email: u.email || '', who: u.name || [((t.card_holder || {}).first_name || ''), ((t.card_holder || {}).last_name || '')].join(' ').trim() }; }) });
    }
    if (b.action === 'attach') {
      const id = String(b.txn || ''); if (!/^[\w-]{6,80}$/.test(id)) return json({ error: 'bad txn' }, 400);
      const t = await ramp(env, 'transactions/' + id);
      const us = await rampUsers(env); const uid = (t.card_holder || {}).user_id || t.user_id; const owner = (us.find(u => u.id === uid) || {}).email || '';
      if (!boss && owner !== caller) return json({ error: 'that charge is not on your card' }, 403);
      const out = { ok: true, txn: id, amount: money(t.amount), merchant: t.merchant_name || '', date: String(t.user_transaction_time || '').slice(0, 10), receipt: false, memo: false };
      const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(String(b.image || ''));
      if (m) {
        const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)); if (bytes.length > 9e6) return json({ error: 'receipt file too big' }, 413);
        const fd = new FormData();
        fd.append('transaction_id', id); if (uid) fd.append('user_id', uid); fd.append('idempotency_key', crypto.randomUUID());
        fd.append('receipt', new File([bytes], 'receipt.' + (m[1].includes('pdf') ? 'pdf' : 'jpg'), { type: m[1] }));
        try { await ramp(env, 'receipts', { method: 'POST', body: fd }); out.receipt = true; } catch (e) { out.receiptErr = e.message; }
      }
      const title = String(b.title || '').trim().slice(0, 120);
      if (title) {
        const old = String(t.memo || '').trim();
        if (old.toLowerCase().includes(title.toLowerCase())) out.memo = 'already';
        else { const memo = old ? title + ' · ' + old : title;
          try { await ramp(env, 'memos/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memo }) }); out.memo = true; out.memoText = memo; }
          catch (e) { out.memoErr = e.message; } }
      }
      console.log('ramp attach', id, caller, JSON.stringify(out));
      return json(out);
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) { console.log('ramp error', e.message); return json({ error: e.message }, 502); }
}
async function photoRoute(request, env) {
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (!env.PHOTOS) return json({ error: 'photo storage is not set up' }, 500);
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  let b = {}; try { b = await request.json(); } catch (e) {}
  if (!token) return json({ error: 'sign in first' }, 401);
  let users = {};
  try { users = (await getDoc('config/users', token)).users || {}; } catch (e) { return json({ error: 'not approved' }, 403); }
  const caller = jwtEmail(token), admin = caller === String(env.ADMIN_EMAIL || '-').toLowerCase() || (users[caller] || {}).role === 'admin';
  if (!users[caller] && !admin) return json({ error: 'not approved' }, 403);
  if (b.action === 'put') {
    const id = String(b.quote || ''); if (!/^[\w-]{1,100}$/.test(id)) return json({ error: 'bad job id' }, 400);
    let ok = false;
    try { await getDoc('quotes/' + encodeURIComponent(id), token); ok = true; }
    catch (e) { const t = Number((/^job-(\d{13})$/.exec(id) || [])[1]); ok = t > 0 && Math.abs(Date.now() - t) < 7 * 864e5; }  // new job report not saved yet
    if (!ok) return json({ error: 'you cannot add photos to that job' }, 403);
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(String(b.image || '')); if (!m) return json({ error: 'not a photo' }, 400);
    const bytes = Uint8Array.from(atob(m[1]), c => c.charCodeAt(0)); if (bytes.length > 3e6) return json({ error: 'photo too big' }, 413);
    const k = id + '/' + crypto.randomUUID() + '.jpg';
    await env.PHOTOS.put(k, bytes, { metadata: { by: caller, at: new Date().toISOString() } });
    console.log('photo put', k, caller, bytes.length);
    return json({ ok: true, k, url: new URL(request.url).origin + '/photo/' + k });
  }
  if (b.action === 'del') {
    const k = String(b.k || ''); if (!PHOTO_KEY.test(k)) return json({ error: 'bad photo id' }, 400);
    const l = await env.PHOTOS.list({ prefix: k, limit: 1 }), meta = ((l.keys || [])[0] || {}).metadata || {};
    if (!(l.keys || []).length) return json({ ok: true, gone: true });
    if (!admin && meta.by !== caller) return json({ error: 'only the person who took it (or Anthony) can remove it' }, 403);
    await env.PHOTOS.delete(k); console.log('photo del', k, caller);
    return json({ ok: true });
  }
  return json({ error: 'unknown action' }, 400);
}
async function photoGet(path, env) {
  const k = decodeURIComponent(path.slice('/photo/'.length));
  if (!env.PHOTOS || !PHOTO_KEY.test(k)) return new Response('Not found', { status: 404 });
  const v = await env.PHOTOS.get(k, 'arrayBuffer');
  if (!v) return new Response('Not found', { status: 404 });
  return new Response(v, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': APP_ORIGIN } });
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/notify') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (request.method === 'POST') return notifyTechs(request, env);
      return new Response('Not found', { status: 404 });
    }
    if (path === '/ramp') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (request.method === 'POST') return rampRoute(request, env);
      return new Response('Not found', { status: 404 });
    }
    if (path === '/photo') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (request.method === 'POST') return photoRoute(request, env);
      return new Response('Not found', { status: 404 });
    }
    if (path.startsWith('/photo/') && request.method === 'GET') return photoGet(path, env);
    if (path === '/recap') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (request.method === 'POST') return recap(request, env);
      return new Response('Not found', { status: 404 });
    }
    if (!env.HOOK_SECRET || path !== `/hook/${env.HOOK_SECRET}`) return new Response('Not found', { status: 404 });
    const status = await startSync(env, 'webhook');
    return new Response(status === 204 ? 'ok: sync started' : `GitHub said ${status}`, { status: status === 204 ? 200 : 502 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(startSync(env, 'cron'));
  }
};
