// v10.9.8 client phone from D-Tools (primary contact), tap to call
const phoneLine = q => { const c = (q.project || {}).clientContact; return c && c.phone ? `<div class="qmeta" style="font-size:14px;margin-top:4px">📞 ${c.name ? esc(c.name) + ' · ' : ''}<a href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}" style="color:#1F6FD1">${esc(c.phone)}</a></div>` : ''; };
// v10.9.6 where the quoted time comes from (replaces the old "Job report without a labor quote" line)
const quoteLine = q => { const h = quotedHrs(q);
  if (!h.est) return '<div class="qmeta" style="color:#A1440B">No labor quoted (no calculator quote or labor line on the D-Tools proposal)</div>';
  return `<div class="qmeta">Quoted: <b>${hrs(h.est)} hrs</b>${h.prog ? ' (install ' + hrs(h.inst) + ' · programming ' + hrs(h.prog) + ')' : ''} from the ${esc(h.src)}</div>`; };
// v8.21.0: who did each task (item lines and extra work)
const jobTechs = () => { const ids = ((typeof Q !== 'undefined' && Q && Q.schedule) || {}).techs || []; const list = techs().filter(t => ids.includes(t.email)); return list.length ? list : techs(); };
const techPick = (cls, attrs, sel) => { const cur = sel != null && sel !== '' ? sel : (ME && ME.role === 'tech' ? ME.email : '');
  return `<select class="${cls}" ${attrs} style="width:auto;max-width:48%;padding:8px 6px" title="Who did this"><option value="">Who did it…</option>${jobTechs().map(t => `<option value="${esc(t.email)}" ${t.email === cur ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}<option value="*" ${cur === '*' ? 'selected' : ''}>Multiple techs</option></select>`; };
const techLabel = v => v === '*' ? 'Multiple' : v ? nameOf(v) : '—';
const STATUS = { draft: 'Draft', won: 'Won', scheduled: 'Scheduled', submitted: 'Awaiting approval', closed: 'Submitted' };  // v8.24.0: no approval step; a submitted report is final (status closed)
const stBadge = s => `<span class="st st-${esc(s || 'draft')}">${esc((STATUS[s] || 'Draft').toUpperCase())}</span>`;
let ME = null, USERS = {}, CATALOG = new Map();
const app = () => document.getElementById('app');
const qid = new URLSearchParams(location.search).get('quote');
const techs = () => Object.entries(USERS).filter(([e, u]) => u.role === 'tech').map(([e, u]) => ({ email: e, name: u.name }));
const nameOf = e => (USERS[e] && USERS[e].name) || e;
const tWin = sc => { const f = v => { if (!v) return ''; const [h, m] = v.split(':').map(Number); return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' AM' : ' PM'); }; return f(sc.start) + (sc.end ? '–' + f(sc.end) : ''); };  // v8.26.0 time window
// v8.32.0: install days with their own D-Tools time window, e.g. "Mon, Nov 23 11:00 AM–4:00 PM"
const dayWins = (sc, sep) => (sc.dates || []).map(d => fmtDate(d) + (sc.times && sc.times[d] ? ' ' + tWin(sc.times[d]) : (!sc.times || !Object.keys(sc.times).length) && sc.start ? ' ' + tWin(sc) : sc.fromDtools ? ' (all day)' : '')).join(sep || ', ');
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
// v8.33.0: jobs linked to D-Tools are titled by the D-Tools project name; the quote's own name shows underneath when different
const label = q => (q.project && q.project.dtoolsProjectName) || q.label || (q.project && q.project.customerName) || 'Untitled';
const subLabel = q => { const a = q.label || (q.project && q.project.customerName) || ''; return a && a !== label(q) ? 'Quote: ' + a : ''; };
const teamCls = q => ASBCTeams.ofEmails((q.schedule || {}).techs, USERS);
// v10.9.0 quoted labor for a job: the calculator labor quote first, else the D-Tools proposal's INSTALL_SERVICE / SRV-PROG lines (QTY = hours)
function quotedHrs(q) {
  let inst = 0, prog = 0; const r = x => Math.round(x * 100) / 100;
  ((q && q.items) || []).forEach(it => { const c = it.isCustom ? it : (CATALOG.get(it.id) || {}), n = Number(it.qty) || 0;
    inst += ((Number(c.installHours) || 0) + (it.addon ? Number(it.addon.installHours) || 0 : 0)) * n;
    prog += ((Number(c.programmingHours) || 0) + (it.addon ? Number(it.addon.programmingHours) || 0 : 0)) * n; });
  if (inst + prog > 0) return { est: r(inst + prog), inst: r(inst), prog: r(prog), src: 'labor quote' + (q.laborQuote && q.laborQuote.label ? ' (' + q.laborQuote.label + ')' : '') };
  const d = (q && q.dtoolsLabor) || {}, df = Number(d.flat) || 0, di = (Number(d.install) || 0) + df, dp = Number(d.prog) || 0;
  if (di + dp > 0) return { est: r(di + dp), inst: r(di), prog: r(dp), src: 'D-Tools proposal' + (df ? ' (incl. ' + r(df) + ' hrs estimated from an older install line (Labor Flat Rate / Installation) at $200/hr)' : '') };
  return { est: 0, inst: 0, prog: 0, src: '' };
}
function lineEst(it) {
  const c = it.isCustom ? it : (CATALOG.get(it.id) || {});
  const per = (Number(c.installHours) || 0) + (Number(c.programmingHours) || 0) + (it.addon ? (Number(it.addon.installHours) || 0) + (Number(it.addon.programmingHours) || 0) : 0);
  return per * (Number(it.qty) || 0);
}
const lineName = it => (it.isCustom ? it.name : ((CATALOG.get(it.id) || {}).name || it.id)) + (it.addon && it.addon.name ? ' + ' + it.addon.name : '');

// v10.9.9 iPhone (mostly the installed app): the database's offline storage can stall the first reads for minutes
// (Eugene, Nov 25: stuck at "loading users and catalog" and on the job list). quick() waits 5 s, then reads the same
// data straight from the server over REST with the person's sign-in, so the page always loads. Writes still use the SDK.
const FS_REST = 'https://firestore.googleapis.com/v1/projects/asbc-calculator/databases/(default)/documents';
function fsVal(v) { if (!v) return null; if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue; if ('timestampValue' in v) return v.timestampValue; if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsVal); if ('mapValue' in v) return fsObj(v.mapValue.fields); return null; }
const fsObj = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fsVal(v)]));
const restSnap = (id, fields) => { const d = fsObj(fields); return { id, exists: !!fields, data: () => d }; };
async function restDoc(path) {
  const tok = await firebase.auth().currentUser.getIdToken();
  const r = await fetch(FS_REST + '/' + path, { headers: { Authorization: 'Bearer ' + tok } });
  if (r.status === 404) return restSnap(path.split('/').pop(), null);
  if (!r.ok) throw new Error('read ' + r.status); const j = await r.json(); return restSnap(path.split('/').pop(), j.fields || {});
}
async function restQuery(field, op, value) {
  const tok = await firebase.auth().currentUser.getIdToken();
  const r = await fetch(FS_REST + ':runQuery', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'quotes' }], where: { fieldFilter: { field: { fieldPath: field }, op, value: { stringValue: value } } } } }) });
  if (!r.ok) throw new Error('query ' + r.status);
  return (await r.json()).filter(x => x.document).map(x => restSnap(x.document.name.split('/').pop(), x.document.fields || {}));
}
async function quick(sdk, rest, what) {
  const r = await Promise.race([sdk().then(v => ({ v }), e => ({ e })), new Promise(res => setTimeout(() => res(null), 5000))]);
  if (r && 'v' in r) return r.v;
  window.ASBCDiag && ASBCDiag.stage(what + ' (server fallback)');
  try { return await rest(); } catch (e) { if (r && r.e) throw r.e; return sdk(); }
}
