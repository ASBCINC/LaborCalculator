// v11.11.0 Hourly D-Tools calendar import WITHOUT a browser: reads the D-Tools "Company Calendar Feed" (iCal link, GitHub secret
// DTOOLS_ICS) and runs the app's own importer (dtools-schedule.js asbcImportSchedule) with firebase-admin, so installs, crews,
// times and new jobs reach the app every hour even when nobody clicks the ASBC sync bookmark.
// The feed has no task status, task notes or company holidays: those are carried over from the last bookmark / evening-pull import
// (config/dtoolsEvents), so the hourly run never blanks them or re-messages techs. The bookmark is still what pushes stage changes.
// Feed quirk (Nov 2026): timed entries are written in UTC as if D-Tools times were US Eastern, so they are read back in FEED_TZ
// (default America/New_York) to get the times as entered. If that ever changes, the run stops with a clear problem instead of
// shifting everyone's install times.
// Run: node scripts/feed_import.js [--dry] [--force]   (env: DTOOLS_ICS, FIREBASE_SA, optional DTS_API_KEY)
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const FEED_TZ = process.env.FEED_TZ || 'America/New_York';
const DRY = process.argv.includes('--dry'), FORCE = process.argv.includes('--force');

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const unesc = s => String(s || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function parseIcs(text) {
  const out = [];
  for (const block of String(text).replace(/\r?\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1)) {
    const f = {};
    for (const line of block.split('END:VEVENT')[0].split(/\r?\n/)) { const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/); if (m) f[m[1]] = { params: m[2], value: m[3] }; }
    out.push(f);
  }
  return out;
}
function wall(v, params) {  // -> { date: 'YYYY-MM-DD', time: 'HH:MM' | '' } as entered in D-Tools
  v = String(v || '');
  if (/VALUE=DATE(?!-)/.test(params || '') || /^\d{8}$/.test(v)) return { date: v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8), time: '' };
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d{2}(Z?)$/); if (!m) return null;
  if (m[6] !== 'Z') return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
  const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]));
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: FEED_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
function descFields(desc) {  // "Project: …\nAssigned to: a, b\nAddress: line\ncity\ncountry\n\nnotes\n\nView in D-Tools Cloud: url"
  const f = { notes: '' }, rest = []; let inAddr = false;
  for (const l of unesc(desc).split('\n')) {
    const m = l.match(/^(Project|Assigned to|Address): ?(.*)$/);
    if (m) { f[m[1]] = m[2]; inAddr = m[1] === 'Address'; continue; }
    if (/^View in D-Tools Cloud:/.test(l)) { inAddr = false; continue; }
    if (inAddr && l.trim()) { f.Address += '\n' + l; continue; }
    inAddr = false; if (l.trim()) rest.push(l.trim());
  }
  f.notes = rest.join('\n'); return f;
}
// feed entries + last import + pipeline -> the same { projects, extra } the bookmark builds
function build(entries, prev, pipe, today) {
  const from = addDays(today, -7), to = addDays(today, 60);
  const prevById = {}, prevByName = {};
  (prev.events || []).forEach(e => { prevById[e.id] = e; if (!e.kind && e.name) prevByName[fold(e.name)] = Object.assign({}, prevByName[fold(e.name)] || {}, e); });
  const pipeByName = {}; Object.values(pipe || {}).forEach(p => { if (p && p.name) pipeByName[fold(p.name)] = p; });
  const by = {}, meetings = [], check = [], stats = { events: 0, meetings: 0, tasks: 0, skipped: 0 };
  for (const f of entries) {
    const m = String((f.UID || {}).value || '').match(/^(event|meeting|task)-(\d+)-/); if (!m || !f.DTSTART) { stats.skipped++; continue; }
    const s = wall(f.DTSTART.value, f.DTSTART.params), e = f.DTEND ? wall(f.DTEND.value, f.DTEND.params) : null;
    if (!s || s.date < from || s.date > to) { stats.skipped++; continue; }
    const d = descFields((f.DESCRIPTION || {}).value);
    if (m[1] === 'task') { stats.tasks++; continue; }   // standalone D-Tools to-dos: the bookmark doesn't import them either
    if (m[1] === 'event') {
      stats.events++;
      const id = 'ev' + m[2], pv = prevById[id] || {};
      const name = (d.Project || unesc((f.SUMMARY || {}).value).replace(/^Project Event:\s*/, '')).trim();
      const pn = prevByName[fold(name)] || {}, pp = pipeByName[fold(name)] || {};
      const p = by[fold(name)] || (by[fold(name)] = { pid: pv.pid || pn.pid || null, name, number: pv.number || pn.number || '', client: pv.client || pn.client || pp.client || '',
        stage: pp.stage || pv.stage || pn.stage || '', rep: pp.rep || '', mine: !!pp.id, tasks: [] });
      const assignees = (d['Assigned to'] || '').split(',').map(x => x.trim()).filter(Boolean);
      p.tasks.push({ id, taskId: null, name: 'Project Event', start: s.time ? s.date + ' ' + s.time : s.date, end: s.time && e && e.time ? e.date + ' ' + e.time : '',
        status: pv.status || '', assignees, desc: d.notes || pv.desc || '', address: d.Address || unesc((f.LOCATION || {}).value) || pv.address || '' });
      if (pv.date === s.date && pv.start && s.time) check.push([pv.start, s.time]);
    } else {
      stats.meetings++;
      const pv = prevById['mt' + m[2] + '-' + s.date] || {};
      const title = unesc((f.SUMMARY || {}).value).replace(/^Meeting:\s*/, '').trim() || 'Event';
      const endD = e ? (e.time ? e.date : addDays(e.date, -1)) : s.date;
      meetings.push({ id: m[2], title, allDay: !s.time, start: s.date + 'T' + (s.time || '00:00') + ':00', end: (endD < s.date ? s.date : endD) + 'T' + ((e && e.time) || '00:00') + ':00',
        location: (d.Address || unesc((f.LOCATION || {}).value) || pv.address || '').trim(), people: pv.people || [] });
      if (pv.start && s.time) check.push([pv.start, s.time]);
    }
  }
  // time-zone guard: if every matching timed entry moved by the same whole-hour amount, the feed's time handling changed
  const mins = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const diffs = check.map(([a, b]) => mins(b) - mins(a));
  const tzProblem = diffs.length >= 3 && diffs.every(x => x === diffs[0]) && diffs[0] !== 0 && diffs[0] % 60 === 0
    ? `feed times are all ${diffs[0] / 60} h off from the last import (D-Tools changed the feed's time zone handling?)` : '';
  return { projects: Object.values(by), extra: { meetings, holidays: prev.holidays || [], via: 'feed' }, stats, tzProblem };
}

async function lookupProjects(projects) {  // other PMs' projects the app has never seen: id/number/client/stage from the D-Tools API
  const key = process.env.DTS_API_KEY; if (!key) return 0;
  const H = { 'X-API-Key': key, Authorization: 'Basic RFRDbG91ZEFQSVVzZXI6MyNRdVkrMkR1QCV3Kk15JTU8Yi1aZzlV', Accept: 'application/json' };
  let n = 0;
  for (const p of projects.filter(p => !p.pid && !p.number && !p.mine).slice(0, 10)) {
    try {
      const r = await fetch('https://dtcloudapi.d-tools.cloud/api/v1/Projects/GetProjects?' + new URLSearchParams({ search: p.name, includeArchived: 'false', page: 1, pageSize: 10 }), { headers: H });
      const hit = ((await r.json()).projects || []).find(x => fold(x.name) === fold(p.name)); if (!hit) continue;
      Object.assign(p, { dtoolsId: hit.id, number: hit.number || '', client: p.client || hit.clientName || '', stage: p.stage || hit.stage || '' }); n++;
      await new Promise(r => setTimeout(r, 600));
    } catch (e) { console.log('lookup', p.name, e.message); }
  }
  return n;
}

async function main() {
  const hr = +new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' });
  if (!process.env.DTOOLS_ICS) return console.log('DTOOLS_ICS not set: skipped');
  if (!FORCE && (hr < 6 || hr > 21)) return console.log('outside 6 AM-9 PM Pacific: skipped (no overnight tech messages)');
  const admin = require('firebase-admin'), { GoogleAuth } = require('google-auth-library');
  const sa = JSON.parse(process.env.FIREBASE_SA);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore(); db.settings({ ignoreUndefinedProperties: true });
  const status = (o) => DRY ? null : db.collection('config').doc('feedStatus').set(Object.assign({ at: new Date().toISOString() }, o), { merge: true });
  let text;
  try { const r = await fetch(process.env.DTOOLS_ICS.replace(/^webcal:/, 'https:')); if (!r.ok) throw new Error('HTTP ' + r.status); text = await r.text(); }
  catch (e) { console.log('::warning::feed not readable: ' + e.message); await status({ ok: false, problem: 'feed not readable (' + e.message + '): regenerate the link in D-Tools and update the DTOOLS_ICS secret' }); return; }
  if (!/BEGIN:VCALENDAR/.test(text)) { await status({ ok: false, problem: 'feed returned no calendar (link revoked?)' }); return console.log('::warning::not a calendar'); }
  const prev = (await db.collection('config').doc('dtoolsEvents').get()).data() || {};
  let pipe = {}; try { pipe = JSON.parse(((await db.collection('pipeline').doc('data').get()).data() || {}).json || '{}').projects || {}; } catch (e) {}
  const B = build(parseIcs(text), prev, pipe, todayPT());
  console.log('feed:', JSON.stringify(B.stats), 'projects', B.projects.length);
  if (B.tzProblem) { console.log('::error::' + B.tzProblem); await status({ ok: false, problem: B.tzProblem }); process.exitCode = 1; return; }
  const looked = await lookupProjects(B.projects); if (looked) console.log('looked up', looked, 'project(s) in the D-Tools API');
  if (DRY) { console.log(JSON.stringify(B, null, 1).slice(0, 4000)); return; }
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/userinfo.email'] });
  const token = await auth.getAccessToken();
  globalThis.window = globalThis;
  globalThis.firebase = { firestore: Object.assign(() => db, { FieldValue: admin.firestore.FieldValue }), auth: () => ({ currentUser: { email: sa.client_email, isService: true, getIdToken: async () => token } }) };
  for (const f of ['roles.js', 'dtools-schedule.js']) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  const res = await window.asbcImportSchedule(B.projects, B.extra);
  const n = v => Array.isArray(v) ? v.length : (Number(v) || 0);
  const summary = `${n(res.updated)} updated, ${n(res.created)} new jobs, ${n(res.linked)} linked, ${n(res.events)} events, ${n(res.notified)} techs notified`;
  console.log('import:', summary, JSON.stringify({ updated: res.updated, created: res.created, notified: res.notified, missing: res.missing }));
  await status({ ok: true, problem: '', summary });
}
if (require.main === module) main().catch(async e => { console.log('::error::' + e.stack); process.exitCode = 1; });
module.exports = { parseIcs, wall, descFields, build };
