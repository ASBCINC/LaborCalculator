// ---------- v8.24.0: steps, missing-field sheet, steppers, autosave, edit & resubmit ----------
let STEP = 1, EDIT = false, SAVE_T = null, ADD_DAY = false;  // v10.1.0 ADD_DAY: edit opened from "Log another day"
const STEP_NAMES = ['Time', 'Products', 'Recap', 'Photos & sign-off'];
function stepNav(hasItems) { return `<div class="steps no-print">${STEP_NAMES.map((t, i) => `<button type="button" data-go="${i + 1}"><b>${i + 1}</b>${t}</button>`).join('')}</div>`; }
function goStep(n) {
  const secs = document.querySelectorAll('.step'); if (!secs.length) return;
  STEP = Math.max(1, Math.min(secs.length, n));
  secs.forEach(x => x.classList.toggle('on', Number(x.dataset.step) === STEP));
  document.querySelectorAll('.steps button').forEach(b => b.classList.toggle('on', Number(b.dataset.go) === STEP));
  const back = document.getElementById('stepBack'), next = document.getElementById('stepNext'), sub = document.getElementById('submitJob');
  if (back) back.style.visibility = STEP > 1 ? 'visible' : 'hidden';
  if (next) next.style.display = STEP < secs.length ? '' : 'none';
  if (sub) sub.style.display = STEP < secs.length ? 'none' : '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function stepOf(el) { const s = el && el.closest('.step'); return s ? Number(s.dataset.step) : 0; }
function actBar() {
  return `<div class="actbar no-print"><span id="saveState"></span>
    <button type="button" class="qbtn slim" id="stepBack">‹ Back</button>
    ${EDIT ? '<button type="button" class="qbtn slim" id="cancelEdit">Cancel</button>' : '<button type="button" class="qbtn slim" id="saveJob">Save</button>'}
    <button type="button" class="qbtn gold" id="stepNext">Next ›</button>
    <button type="button" class="qbtn gold" id="submitJob">${EDIT ? 'Resubmit to PM' : 'Submit to PM'}</button></div>`;
}
// Missing-field check. "Must fix" blocks the submit; "Please check" can be submitted anyway.
function checkJob(job) {
  const must = [], check = [];
  if (!(job.log || []).length) must.push(['Add at least one day of time on site (date and hours)', '#logT']);
  if (!job.jobStatus) must.push(['Pick a job status', '#jobStatus']);
  if (!((job.recap || {}).work || '').trim()) must.push(['Fill in "Work completed"', '.rc[data-k="work"]']);
  const soP = signoffProblem(Q, job.jobStatus, job.signoffSkip); if (soP) must.push([soP.replace(/\.$/, ''), '#soCard']);
  const P = prodList(Q), left = P.filter(x => !(job.installedItems || []).includes(x.name));
  if (P.length && left.length && job.jobStatus === 'Complete') check.push([left.length + ' product' + (left.length > 1 ? 's' : '') + ' not marked installed', '.pi']);
  if (!(job.photos && job.photos.uploaded) && document.getElementById('phGrid')) check.push(['No install photos taken', '#phGrid']);
  return { must, check };
}
function markMissing(list) {
  document.querySelectorAll('.miss').forEach(x => x.classList.remove('miss'));
  list.forEach(([, sel]) => { const el = document.querySelector(sel); if (el) el.classList.add('miss'); });
  document.querySelectorAll('.steps button').forEach(b => b.classList.toggle('bad', list.some(([, sel]) => stepOf(document.querySelector(sel)) === Number(b.dataset.go))));
}
function jumpTo(sel) {
  const el = document.querySelector(sel); if (!el) return; const n = stepOf(el); if (n) goStep(n);
  setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const f = el.matches('input,select,textarea') ? el : el.querySelector('input:not([type=checkbox]),select,textarea'); if (f && f.type !== 'checkbox') f.focus({ preventScroll: true }); }, 250);
}
function sheet({ title, sub, must = [], check = [], okLabel }) {
  return new Promise(res => {
    const bg = document.createElement('div'); bg.className = 'sheetbg no-print';
    const row = ([t, sel]) => `<button type="button" class="it" data-sel="${esc(sel)}"><span>${esc(t)}</span><span>Fix ›</span></button>`;
    bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${sub ? `<div class="qmeta" style="font-size:13px">${esc(sub)}</div>` : ''}
      ${must.length ? `<div class="grp" style="color:#B42318">Must fix before submitting</div>${must.map(row).join('')}` : ''}
      ${check.length ? `<div class="grp" style="color:#8A5A00">Please check</div>${check.map(row).join('')}` : ''}
      <div class="acts">${must.length || !okLabel ? '<button type="button" class="qbtn gold" data-x="0">OK, fix it</button>' : `<button type="button" class="qbtn" data-x="0">Go back</button><button type="button" class="qbtn gold" data-x="1">${esc(okLabel)}</button>`}</div></div>`;
    const done = (v, sel) => { bg.remove(); res(v); if (sel) jumpTo(sel); };
    bg.addEventListener('click', e => {
      const it = e.target.closest('.it'); if (it) return done(false, it.dataset.sel);
      const b = e.target.closest('[data-x]'); if (b) return done(b.dataset.x === '1', b.dataset.x === '0' && must[0] ? must[0][1] : null);
      if (e.target === bg) done(false);
    });
    document.body.appendChild(bg);
  });
}
// +/- buttons (quarter hours) on hour fields; number pad on phones
function steppers(root) {
  (root || document).querySelectorAll('input.ah, input.lh, input.exh').forEach(inp => {
    inp.setAttribute('inputmode', 'decimal'); if (inp.parentElement.classList.contains('stp')) return;
    const w = document.createElement('div'); w.className = 'stp'; inp.parentNode.insertBefore(w, inp);
    const mk = (t, d) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.setAttribute('aria-label', d > 0 ? 'Add 15 minutes' : 'Remove 15 minutes');
      b.onclick = () => { const v = Math.max(0, Math.round(((Number(inp.value) || 0) + d) * 4) / 4); inp.value = v ? v : ''; inp.dispatchEvent(new Event('input', { bubbles: true })); }; return b; };
    w.appendChild(mk('−', -0.25)); w.appendChild(inp); w.appendChild(mk('+', 0.25));
  });
}
// v8.25.0: save an open recap before the Update button reloads the page
window.asbcBeforeUpdate = async () => { if (REF && document.querySelector('.step')) { clearTimeout(SAVE_T); try { await REF.set(EDIT ? { jobDraft: collectJob() } : { job: collectJob() }, { merge: true }); } catch (e) {} } };
function saveState(t) { const el = document.getElementById('saveState'); if (el) el.textContent = t; }
function autosave() {
  if (!REF || !document.querySelector('.step')) return;
  clearTimeout(SAVE_T); saveState('Saving…');
  SAVE_T = setTimeout(() => {
    const data = EDIT ? { jobDraft: collectJob() } : { job: collectJob() };
    REF.set(data, { merge: true }).then(() => saveState('Saved ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))).catch(() => {});
    if (!navigator.onLine) saveState('Saved on this phone (offline)');
  }, 1200);
}
document.addEventListener('input', e => { if (!e.target.closest) return; const m = e.target.closest('.miss'); if (m) m.classList.remove('miss'); if (e.target.closest('.step')) autosave(); });
document.addEventListener('change', e => { if (!e.target.closest) return; const m = e.target.closest('.miss'); if (m) m.classList.remove('miss'); if (e.target.closest('.step')) autosave(); });
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-go]'); if (b) goStep(Number(b.dataset.go)); });
// v8.24.0: no approval step. Submitting files the report right away and records actual vs estimated hours (Labor Calibration).
// v9.3.0 learned hours: per catalog item, sum of quantity, quoted hours and actual hours from submitted reports (stats/items)
function recordItemHours(act) {
  try { const inc = firebase.firestore.FieldValue.increment, items = {};
    (act.lines || []).forEach(l => { if (!l.id || !(Number(l.qty) > 0)) return; const k = String(l.id);
      items[k] = { n: inc(1), qty: inc(Number(l.qty) || 1), est: inc(Math.round((Number(l.estHours) || 0) * 100) / 100), act: inc(Math.round((Number(l.actualHours) || 0) * 100) / 100), name: l.name }; });
    if (Object.keys(items).length) db.collection('stats').doc('items').set({ items, updatedAt: new Date() }, { merge: true }).catch(e => console.warn('item hours', e));
  } catch (e) { console.warn('item hours', e); }
}
// v9.3.0 punch list: one item per line/bullet of "Open items / return visit"
document.addEventListener('change', async e => { const c = e.target.closest('.pk'); if (!c || !REF || !Q) return; const pl = (Q.punch || []).slice(), i = Number(c.dataset.i); if (!pl[i]) return;
  pl[i] = Object.assign({}, pl[i], c.checked ? { done: true, by: ME.email, at: new Date().toISOString() } : { done: false, by: null, at: null }); Q.punch = pl; await save(REF, { punch: pl }); showJob(new URLSearchParams(location.search).get('quote')); });
function punchFrom(text) { return String(text || '').split(/\n|•|;/).map(x => x.replace(/^[\s\-–*\d.)]+/, '').trim()).filter(x => x.length > 2).slice(0, 15).map(t => ({ t, done: false })); }
function punchCard(canTick) {
  const pl = Q.punch || []; if (!pl.length) return '';
  const open = pl.filter(x => !x.done).length;
  return `<div class="card" style="border-color:${open ? '#8a6d2f' : 'var(--line)'}"><div class="sect" style="margin-top:0;color:${open ? '#8A5A00' : 'inherit'}">Punch list (${open} open of ${pl.length})</div>
    ${pl.map((x, i) => `<label class="chk" style="display:flex;gap:8px;align-items:flex-start;padding:4px 0"><input type="checkbox" class="pk" data-i="${i}" ${x.done ? 'checked' : ''} ${canTick ? '' : 'disabled'}><span style="${x.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(x.t)}${x.done && x.by ? ` <span class="qmeta">· ${esc(nameOf(x.by))} ${esc(new Date(x.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span>` : ''}</span></label>`).join('')}</div>`;
}
function actualsFrom(j) {  // v10.0.0 whole-project hours: quoted catalog hours vs labor hours (hours on site × techs)
  const qh = quotedHrs(Q), est = qh.est, act = j.laborHours != null ? j.laborHours : laborHours(j.log);
  if (!est || !act) return null;
  return { lines: [], estSource: qh.src, estInstall: qh.inst, estProg: qh.prog, totalEstHours: est, totalActualHours: act, siteHours: j.siteHours != null ? j.siteHours : siteHours(j.log),
    notes: [(j.recap || {}).issues, (j.recap || {}).followups].filter(Boolean).join(' | '), savedAt: new Date().toISOString(), source: 'job report (project hours)' };
}
// What changed between two submissions (revision history + Teams message)
function diffJob(a, b) {
  a = a || {}; b = b || {}; const out = [];
  const th = j => Math.round((j.log || []).reduce((x, r) => x + (Number(r.hours) || 0), 0) * 100) / 100;
  if (th(a) !== th(b)) out.push(`time on site ${hrs(th(a))} → ${hrs(th(b))} hrs`);
  if ((a.jobStatus || '') !== (b.jobStatus || '')) out.push(`status ${a.jobStatus || '—'} → ${b.jobStatus || '—'}`);
  const ih = (j, i) => ((j.lines || []).find(l => l.i === i) || {}).actualHours;
  const n = (b.lines || []).filter(l => (ih(a, l.i) ?? null) !== (l.actualHours ?? null)).length; if (n) out.push(n + ' item hour' + (n > 1 ? 's' : '') + ' changed');
  const lbl = { work: 'work completed', issues: 'problems', followups: 'open items', client: 'client feedback' };
  Object.keys(lbl).forEach(k => { if (((a.recap || {})[k] || '') !== ((b.recap || {})[k] || '')) out.push(lbl[k] + ' edited'); });
  const ex = j => JSON.stringify((j.extras || []).filter(x => x.desc || x.hours)); if (ex(a) !== ex(b)) out.push('extra work changed');
  { const n = j => ((j.photos || {}).list || []).length; if (n(a) !== n(b)) out.push('photos ' + n(a) + ' → ' + n(b)); else if (!!(a.photos || {}).uploaded !== !!(b.photos || {}).uploaded) out.push('photos ' + ((b.photos || {}).uploaded ? 'uploaded' : 'unmarked')); }
  return out.join('; ') || 'resubmitted with no changes to hours, status or recap';
}
function revisionsCard() {
  const j = Q.job || {}, revs = (Q.jobRevisions || []).slice().sort((x, y) => (y.revision || 1) - (x.revision || 1));
  if (!revs.length && !(j.revision > 1)) return '';
  const th = r => hrs((r.log || []).reduce((x, l) => x + (Number(l.hours) || 0), 0));
  return `<div class="card"><div class="sect" style="margin-top:0">Revisions</div>
    <div style="font-size:13px"><b>Rev ${j.revision || 1} (current)</b> · ${esc(nameOf(j.submittedBy))} · ${esc(j.submittedAt ? new Date(j.submittedAt).toLocaleString('en-US') : '')}${j.changeSummary ? `<div class="qmeta">Changed: ${esc(j.changeSummary)}</div>` : ''}</div>
    ${revs.map(r => `<div style="font-size:13px;margin-top:8px;color:#374151">Rev ${r.revision || 1} · ${esc(nameOf(r.submittedBy))} · ${esc(r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-US') : '')} · ${esc(r.jobStatus || '—')} · ${th(r)} hrs${r.changeSummary ? `<div class="qmeta">Changed: ${esc(r.changeSummary)}</div>` : ''}</div>`).join('')}</div>`;
}
// Other visits on the same D-Tools project (original install + return visits)
async function projectVisits() {
  const box = document.getElementById('visits'); if (!box) return;
  const opp = (Q.project || {}).dtoolsOpportunityId; if (!opp) return;
  try {
    const snap = await db.collection('quotes').where('project.dtoolsOpportunityId', '==', opp).get();
    const list = snap.docs.map(d => ({ _id: d.id, ...d.data() })).filter(q => q._id !== qid && q.status && q.status !== 'draft' && !q.jobDeleted && !q.isTemplate)
      .filter(q => ME.role !== 'tech' || ((q.schedule || {}).techs || []).includes(ME.email))
      .filter(q => ME.role !== 'rep' || ['submitted', 'closed'].includes(q.status));
    if (!list.length) return;
    box.innerHTML = `<div class="card no-print"><div class="sect" style="margin-top:0">Other visits on this project</div>${list.map(q => `<a href="?quote=${encodeURIComponent(q._id)}" class="qrow" style="display:block;text-decoration:none;color:inherit;margin:6px 0 0"><div class="qname" style="font-size:14px">${esc(label(q))} ${stBadge(q.status)} ${jsBadge((q.job || {}).jobStatus)}</div><div class="qmeta">${esc(((q.schedule || {}).dates || []).map(fmtDate).join(', ') || 'No dates')}${(q.job || {}).revision > 1 ? ' · rev ' + q.job.revision : ''}</div></a>`).join('')}</div>`;
  } catch (e) { console.warn('visits', e); }
}

