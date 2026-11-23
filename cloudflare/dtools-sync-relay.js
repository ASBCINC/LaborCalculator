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
//                 (if not set: every config/users entry with role "admin")
const WORKFLOW = 'https://api.github.com/repos/ASBCINC/LaborCalculator/actions/workflows/sync-opportunities.yml/dispatches';
const FS = 'https://firestore.googleapis.com/v1/projects/asbc-calculator/databases/(default)/documents/';
const APP_ORIGIN = 'https://asbcinc.github.io';
const CORS = { 'Access-Control-Allow-Origin': APP_ORIGIN, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  const id = String(b.quote || ''), kind = b.kind === 'nudge' ? 'nudge' : 'schedule';
  if (!token || !/^[\w-]{1,100}$/.test(id)) return json({ error: 'bad request' }, 400);
  let q, users = {};
  try { q = await getDoc('quotes/' + encodeURIComponent(id), token); users = (await getDoc('config/users', token)).users || {}; }
  catch (e) { return json({ error: 'cannot read job: ' + e.message }, 403); }
  const caller = jwtEmail(token);  // the token passed Firestore's own check above, so its email is genuine
  if (!(caller === 'a.ward@asbc.us' || (users[caller] || {}).role === 'admin' || (users[caller] || {}).access === 'admin')) return json({ error: 'admin only' }, 403);
  const sc = q.schedule || {}, p = q.project || {};
  const techs = (sc.techs || []).map(e => String(e).toLowerCase()).filter(e => /@asbc\.us$/.test(e));
  if (!techs.length) return json({ ok: true, sent: {}, note: 'no techs' });
  const name = e => ((users[e] || {}).name) || e;
  const job = p.dtoolsProjectName || q.label || p.customerName || 'Job';
  const url = 'https://asbcinc.github.io/LaborCalculator/jobs.html?quote=' + encodeURIComponent(id);
  const facts = [['When', scheduleLines(sc)], ['Address', sc.address], ['Client', p.dtoolsClientName], ['Crew', techs.map(name).join(', ')], ['Sales rep', p.salesManagerName]]
    .filter(([, v]) => v).map(([title, value]) => ({ title, value: String(value) }));
  const body = [{ type: 'TextBlock', size: 'Medium', weight: 'Bolder', wrap: true,
    text: kind === 'nudge' ? 'Reminder: submit today\'s job report — ' + clip(job, 80) : (b.change === 'new' ? 'New install scheduled: ' : 'Install schedule changed: ') + clip(job, 80) }];
  if (kind === 'nudge') body.push({ type: 'TextBlock', wrap: true, text: 'No job report has been submitted for today yet. Open the job, log your time and submit the recap before you finish.' });
  body.push({ type: 'FactSet', facts });
  (sc.notes || []).forEach(n => body.push({ type: 'TextBlock', wrap: true, spacing: 'Small', text: '**Notes:** ' + clip(n, 300) }));
  const card = { type: 'AdaptiveCard', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', version: '1.4', body,
    actions: [{ type: 'Action.OpenUrl', title: kind === 'nudge' ? 'Open job report' : 'View job', url }] };
  const sent = {};
  for (const t of techs) sent[t] = await postTeams(env, t, card);
  console.log('notify', kind, id, JSON.stringify(sent));
  return json({ ok: true, sent });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/notify') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (request.method === 'POST') return notifyTechs(request, env);
      return new Response('Not found', { status: 404 });
    }
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
