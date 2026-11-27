// ---------- one job ----------
let Q = null, REF = null;
async function showJob(id) {
  REF = db.collection('quotes').doc(id);
  const s = await quick(() => REF.get(), () => restDoc('quotes/' + id), 'job');
  if (!s.exists) { app().innerHTML = '<div class="empty">Job not found.</div>'; return; }
  Q = s.data();
  const assigned = ((Q.schedule || {}).techs || []).includes(ME.email);
  const canEdit = (assigned || ME.role === 'admin') && ['submitted', 'closed'].includes(Q.status);
  if (EDIT && !canEdit) EDIT = false;
  if (EDIT) { Q._live = Q.job || {}; if (Q.jobDraft) Q.job = Object.assign({}, Q.job, Q.jobDraft); }
  if (ME.role === 'tech' && !assigned) { app().innerHTML = '<div class="empty">This job is not assigned to you.</div>'; return; }
  if (ME.role === 'rep' && !ME.allQuotes && (Q.project || {}).salesManagerName !== ME.name) { app().innerHTML = '<div class="empty">This job belongs to another sales rep.</div>'; return; }
  if (ME.role === 'rep' && !['submitted', 'closed'].includes(Q.status)) { app().innerHTML = '<div class="empty">The installer has not submitted a report for this job yet.</div>'; return; }
  document.getElementById('pageTitle').textContent = label(Q);
  const st = Q.status || 'draft';
  let html = `<div class="card"><div class="qtop"><div><div class="qname">${esc(label(Q))} ${stBadge(st)} ${jsBadge((Q.job || {}).jobStatus)}</div>
    <div class="qmeta">${esc((Q.project || {}).dtoolsClientName || '')}${(Q.project || {}).dtoolsOppNumber ? ' · D-Tools #' + esc(Q.project.dtoolsOppNumber) : ''} · Rep: ${esc((Q.project || {}).salesManagerName || '—')}</div>
    ${subLabel(Q) ? `<div class="qmeta">${esc(subLabel(Q))}</div>` : ''}${quoteLine(Q)}${phoneLine(Q)}<div class="qmeta">Dates: ${esc(dayWins(Q.schedule || {}) || '—')} · Techs: ${esc(((Q.schedule || {}).techs || []).map(nameOf).join(', ') || '—')}</div>${(Q.schedule || {}).address ? `<div class="qmeta">Address: <a href="https://maps.google.com/?q=${encodeURIComponent(Q.schedule.address)}" target="_blank" rel="noopener" style="color:#1F6FD1">${esc(Q.schedule.address)}</a></div>` : ''}${((Q.schedule || {}).notes || []).length ? `<div class="qmeta" style="white-space:pre-wrap;color:#374151">D-Tools notes: ${esc(Q.schedule.notes.join('\n'))}</div>` : ''}${(Q.project || {}).proposalPdf ? `<div class="qmeta"><a href="${esc(Q.project.proposalPdf)}" target="_blank" rel="noopener" style="color:#1F6FD1">Open proposal PDF</a></div>` : ''}${((Q.project || {}).files || []).filter(f => f.url !== (Q.project || {}).proposalPdf).map(f => `<div class="qmeta"><a href="${esc(f.url)}" target="_blank" rel="noopener" style="color:#1F6FD1">${esc(f.name)}</a></div>`).join('')}${Q.parts && Q.parts.total ? `<div class="qmeta" style="color:${Q.parts.ready >= Q.parts.total ? '#0E7A4D' : '#B42318'}">Parts: ${Q.parts.ready >= Q.parts.total ? 'all ' + Q.parts.total + ' staged' : (Q.parts.total - Q.parts.ready) + ' of ' + Q.parts.total + ' not staged' + ((Q.parts.notReady || []).length ? ' (' + esc(Q.parts.notReady.join(', ')) + ')' : '')}</div>` : ''}</div></div>
    ${Q.job && Q.job.reviewNote && st === 'scheduled' ? `<div class="qmeta" style="color:#A1440B;margin-top:6px">Sent back by ${esc(nameOf(Q.job.reviewedBy))}: ${esc(Q.job.reviewNote)}</div>` : ''}</div>`;
  if (ME.role === 'admin') html += scheduleCard(st);
  html += '<div id="visits"></div>';
  if (EDIT) html += `<div class="card no-print" style="border-color:#E0B860"><div style="color:#8A5A00;font-weight:700">Editing rev ${Q._live.revision || 1} of this report</div><div class="qmeta" style="font-size:12px">Changes save as you go but stay private until you tap Resubmit to PM.</div></div>` + logForm();
  else if (st === 'scheduled' && (assigned || ME.role === 'admin')) html += logForm();
  else if (st === 'submitted' || st === 'closed') html += report(ME.role === 'admin', canEdit);
  if (['scheduled', 'submitted', 'closed'].includes(st)) html += expensesCard(assigned || ME.role === 'admin');  // v9.6.0
  app().innerHTML = html;
  steppers(); if (document.querySelector('.step')) { goStep(STEP); saveState(EDIT && Q.jobDraft ? 'Unsent edits restored' : ''); }
  wire(); projectVisits();
}
// v9.6.0 Expenses: receipts go to the matching Ramp charge (photo + project title in the memo); charges whose Ramp memo
// names this project are added by the hourly sync. Waiting = the charge hasn't posted in Ramp yet; it's matched automatically.
function expensesCard(canAdd) {
  const ex = (Q.expenses || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const tot = ex.reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const usd = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `<div class="card"><div class="sect" style="margin-top:0">Expenses${ex.length ? ' · ' + usd(tot) : ''}</div>
    ${ex.map(e => `<div class="qmeta" style="display:flex;justify-content:space-between;gap:8px"><span>${esc(e.date || '')} · ${esc(e.merchant || 'Receipt')}${e.who || e.by ? ' · ' + esc(e.who || nameOf(e.by)) : ''}${e.note ? `<br><span style="color:#A1440B">${esc(e.note)}</span>` : ''}</span>
      <span style="white-space:nowrap">${usd(e.amount)} ${ME.role === 'admin' ? `<button class="qbtn no-print" data-rmx="${esc(e.id || e.pid || '')}" title="Not this job" style="padding:0 6px;min-height:0;height:22px">✕</button> ` : ''}${e.status === 'pending' ? '<span class="st" style="color:#8A5A00">WAITING FOR CHARGE</span>' : `<span class="st st-closed">IN RAMP${e.receipt ? ' · RECEIPT' : ''}</span>`}</span></div>`).join('') || '<div class="qmeta">No expenses on this job yet.</div>'}
    ${canAdd ? `<div class="no-print" style="border-top:1px solid var(--line);margin-top:10px;padding-top:10px">
      <div class="qmeta">Add a receipt: it's attached to your Ramp charge with this project in the memo. If the charge hasn't posted yet, it's matched automatically when it does.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;align-items:center"><input type="file" id="rcFile" accept="image/*,application/pdf" style="max-width:230px">
      <input type="number" id="rcAmt" min="0" step="0.01" placeholder="Total $" style="width:110px"><input type="date" id="rcDate" value="${new Date().toISOString().slice(0, 10)}" style="width:150px">
      <button class="qbtn gold" id="rcSave">Add receipt</button><span class="qmeta" id="rcMsg"></span></div></div>` : ''}</div>`;
}
document.addEventListener('click', async e => {
  const rm = e.target.closest && e.target.closest('[data-rmx]');
  if (rm && REF && Q && ME.role === 'admin') { const k = rm.dataset.rmx; if (!k || !confirm('Remove this expense from the job? (Nothing changes in Ramp.)')) return;
    const keep = (Q.expenses || []).filter(x => (x.id || x.pid) !== k), gone = (Q.expenses || []).find(x => (x.id || x.pid) === k) || {};
    await REF.update({ expenses: keep, expensesIgnored: firebase.firestore.FieldValue.arrayUnion(k) }); if (gone.pid) await db.collection('rampPending').doc(gone.pid).delete().catch(() => {}); return showJob(REF.id); }
  if (!e.target.closest || !e.target.closest('#rcSave') || !REF || !Q) return;
  const msg = t => { const m = document.getElementById('rcMsg'); if (m) m.textContent = t; }, b = document.getElementById('rcSave');
  const f = (document.getElementById('rcFile').files || [])[0], amt = document.getElementById('rcAmt').value, d = document.getElementById('rcDate').value;
  if (!f) return msg('Pick the receipt photo first.'); if (!(Number(amt) > 0)) return msg('Enter the receipt total.');
  b.disabled = true; msg('Sending…');
  try { const r = await asbcRamp.addReceipt({ ref: REF, q: Q, file: f, amount: amt, date: d || new Date().toISOString().slice(0, 10), email: ME.email });
    msg(r.status === 'pending' ? 'Saved. Waiting for the charge to post in Ramp.' : 'Attached to the Ramp charge' + (r.note ? ' (' + r.note + ')' : '') + '.');
    setTimeout(() => showJob(REF.id), 1200); }
  catch (err) { msg('Could not add: ' + err.message); b.disabled = false; }
});
function scheduleCard(st) {
  const sc = Q.schedule || {}; const dates = (sc.dates || []).concat(['']);
  return `<details class="card no-print" ${['draft', 'won'].includes(st) ? 'open' : ''}><summary>Schedule &amp; assign</summary>
    <div class="sect">Install date(s)</div><div id="dates">${dates.map(d => `<input type="date" class="dt" value="${esc(d)}" style="margin-bottom:6px">`).join('')}</div>
    <button type="button" class="qbtn" onclick="document.getElementById('dates').insertAdjacentHTML('beforeend','<input type=date class=dt style=margin-bottom:6px>')">+ Add date</button>
    <div class="sect">Time window (shown on the Calendar)</div><div class="row2"><input type="time" id="tStart" value="${esc(sc.start || '')}" aria-label="Start time"><input type="time" id="tEnd" value="${esc(sc.end || '')}" aria-label="End time"></div>
    <div class="sect">Technicians</div>${techs().map(t => `<label class="chk"><input type="checkbox" class="tk" value="${esc(t.email)}" ${(sc.techs || []).includes(t.email) ? 'checked' : ''}> ${esc(t.name)}</label>`).join('') || '<div class="qmeta">No techs on the Approved users list yet.</div>'}
    <div class="sect">Status</div><select id="stSel">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === st ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <div class="qactions"><button class="qbtn gold" id="saveSched">Save schedule</button></div><div id="schedMsg" class="qmeta"></div></details>`;
}
// v10.0.0 crew time log: one row per day = hours on site + the techs on site. Labor hours = hours on site × techs.
// Older reports have one row per tech ({date, who, hours}); they count as hours × 1 and are regrouped by day when edited.
const rowLabor = r => (Number(r.hours) || 0) * (Array.isArray(r.techs) ? Math.max(1, r.techs.length) : 1);
const laborHours = log => Math.round((log || []).reduce((a, r) => a + rowLabor(r), 0) * 100) / 100;
const siteHours = log => { const by = {}; (log || []).forEach(r => { const k = r.date || '?'; by[k] = Array.isArray(r.techs) ? (by[k] || 0) + (Number(r.hours) || 0) : Math.max(by[k] || 0, Number(r.hours) || 0); }); return Math.round(Object.values(by).reduce((a, h) => a + h, 0) * 100) / 100; };
const rowTechs = r => Array.isArray(r.techs) ? r.techs : (r.who ? [r.who] : []);
function crewRows(log) {  // old per-tech rows -> one row per day
  if (!(log || []).length || (log || []).every(r => Array.isArray(r.techs))) return log || [];
  const by = {}; log.forEach(r => { const k = r.date || ''; const x = by[k] || (by[k] = { date: k, hours: 0, techs: [] }); x.hours = Math.max(x.hours, Number(r.hours) || 0); rowTechs(r).forEach(t => { if (!x.techs.includes(t)) x.techs.push(t); }); });
  return Object.values(by).sort((a, b) => a.date.localeCompare(b.date));
}
function logRowHtml(r) {
  const on = rowTechs(r), list = techs(), assigned = ((Q && Q.schedule) || {}).techs || [];
  const show = list.filter(t => assigned.includes(t.email) || on.includes(t.email) || t.email === ME.email).concat(list.filter(t => !(assigned.includes(t.email) || on.includes(t.email) || t.email === ME.email)));
  return `<tr><td><input type="date" class="ld" value="${esc(r.date || '')}"></td><td><input type="number" class="lh" min="0" step="0.25" inputmode="decimal" placeholder="hrs" value="${esc(r.hours ?? '')}"></td>
    <td class="lt">${show.map(t => `<label class="tchip"><input type="checkbox" class="lk" value="${esc(t.email)}" ${on.includes(t.email) ? 'checked' : ''}>${esc(String(t.name).split(' ')[0])}</label>`).join('')}</td></tr>`;
}
function logTable(rows) { return `<table id="logT"><tr><th style="width:150px">Date</th><th style="width:90px">Hours on site</th><th>Techs on site</th></tr>${rows.map(logRowHtml).join('')}</table>`; }
function collectLog() {
  return [...document.querySelectorAll('#logT tr')].slice(1).map(tr => { const t = [...tr.querySelectorAll('.lk:checked')].map(x => x.value);
    return { date: tr.querySelector('.ld').value, hours: Number(tr.querySelector('.lh').value) || 0, techs: t.length ? t : (ME.role === 'tech' ? [ME.email] : []) }; }).filter(r => r.date && r.hours);
}
// v10.0.0 products to bring out (D-Tools product lines on the project); techs tick each one installed
const prodList = q => ((q && q.parts && q.parts.items) || []).filter(x => x && x.name);
function productsCard(j) {
  const P = prodList(Q), done = new Set(j.installedItems || []);
  if (!P.length) return `<div class="card"><div class="sect" style="margin-top:0">Products to bring</div><div class="qmeta">No product list from D-Tools for this project yet.</div></div>`;
  return `<div class="card"><div class="sect" style="margin-top:0;display:flex;justify-content:space-between;align-items:center">Products to bring (${P.length})<button type="button" class="qbtn" id="allInst" style="height:26px;padding:0 10px">Mark all installed</button></div>
    <div class="qmeta">Check each product once it's installed.</div>
    ${P.map((x, i) => `<label class="prod"><input type="checkbox" class="pi" value="${esc(x.name)}" ${done.has(x.name) ? 'checked' : ''}><span>${esc(x.name)}${Number(x.qty) > 1 ? ' <b>×' + esc(x.qty) + '</b>' : ''}</span>${x.install ? `<span class="ds">D-Tools: ${esc(x.install)}</span>` : ''}</label>`).join('')}</div>`;
}
function productsReport(j) {
  const P = prodList(Q); if (!P.length) return '';
  if (!Array.isArray(j.installedItems)) return `<div class="card"><div class="sect" style="margin-top:0">Products</div><div class="qmeta">This report was submitted before the product checklist was on the form, so installs weren't ticked.</div></div>`;  // v10.5.0
  const done = new Set(j.installedItems || []), n = P.filter(x => done.has(x.name)).length;
  return `<div class="card"><div class="sect" style="margin-top:0">Products installed (${n} of ${P.length})</div>${P.map(x => `<div class="prod" style="padding:6px 0"><span class="${done.has(x.name) ? 'pl' : 'mi'}">${done.has(x.name) ? '✓' : '✗'}</span><span>${esc(x.name)}${Number(x.qty) > 1 ? ' ×' + esc(x.qty) : ''}</span></div>`).join('')}</div>`;
}
let SETTINGS = {};
function moneyCard(j, show) {  // v10.2.0 time quoted vs time on site (no dollars); bid points for the rep
  const lab = j.laborHours != null ? j.laborHours : laborHours(j.log), site = j.siteHours != null ? j.siteHours : siteHours(j.log);
  const days = new Set((j.log || []).map(r => r.date)).size, qh = quotedHrs(Q), est = qh.est;
  const d = est ? (lab - est) / est : 0, pts = est ? ASBCBoard.accuracyPoints(est, lab) : 0, diff = Math.round((lab - est) * 100) / 100;
  const verdict = !est ? '' : Math.abs(d) <= 0.10 ? ['Bid correctly', 'pl'] : d < 0 ? ['Finished under the quote', 'pl'] : ['Ran over the quote', 'mi'];
  return `<div class="card"><div class="print-only"><b>ASBC Job Report</b> · ${esc(label(Q))} · printed ${new Date().toLocaleDateString('en-US')}</div><div class="sect" style="margin-top:0">Time quoted vs time on site</div>
    <div style="display:flex;gap:22px;flex-wrap:wrap">${est ? `<div><div class="qmeta">Time quoted</div><div style="font-size:22px;font-weight:800">${hrs(est)} hrs</div><div class="qmeta">Install ${hrs(qh.inst)} · Programming ${hrs(qh.prog)} · from the ${esc(qh.src)}</div></div>` : ''}
    <div><div class="qmeta">Actual labor (${hrs(site)} hrs on site × techs)</div><div style="font-size:22px;font-weight:800;color:var(--gold)">${hrs(lab)} hrs</div></div>
    <div><div class="qmeta">Days</div><div style="font-size:22px;font-weight:800">${days}</div></div></div>
    ${est ? `<div style="margin-top:10px;font-size:15px"><b class="${verdict[1]}">${verdict[0]}</b>: ${diff > 0 ? hrs(diff) + ' hrs over' : diff < 0 ? hrs(-diff) + ' hrs under' : 'right on'} (${d > 0 ? '+' : ''}${Math.round(d * 100)}%)${show ? ` · <span class="${pts >= 0 ? 'pl' : 'mi'}">${pts > 0 ? '+' : ''}${pts} pts</span> to ${esc((Q.project || {}).salesManagerName || 'the rep')}` : ''}</div>`
      : `<div class="qmeta" style="margin-top:6px"><b style="color:#A1440B">No labor quoted</b>: no calculator labor quote and no INSTALL_SERVICE / SRV-PROG / flat-rate labor on the D-Tools proposal, so there is no quoted time to compare.</div>`}</div>`;
}
function logForm() {
  const j = Q.job || {}; const lines = j.lines || [];
  const items = (Q.items || []).map((it, i) => ({ it, i, prev: lines.find(l => l.i === i) || {} }));
  const zones = [...new Set(items.map(x => x.it.zone || 'General'))];
  // v8.32.0: a new report starts with one row per scheduled day per assigned tech (from the Calendar / D-Tools)
  const sc0 = Q.schedule || {}, who0 = (sc0.techs || []).length ? sc0.techs : (ME.role === 'tech' ? [ME.email] : []);
  const pre = (sc0.dates || []).map(d => ({ date: d, hours: '', techs: who0.slice() }));
  let log = (j.log && j.log.length ? crewRows(j.log) : pre.length ? pre : [{ date: new Date().toISOString().slice(0, 10), hours: '', techs: who0.slice() }]);
  // v10.1.0 multi-day jobs: every scheduled day gets a row, and "Log another day" adds the next one (next scheduled day without hours, else today)
  if (j.log && j.log.length) { const have = new Set(log.map(r => r.date)); (sc0.dates || []).filter(d => !have.has(d)).forEach(d => log.push({ date: d, hours: '', techs: who0.slice() })); log.sort((a, b) => String(a.date).localeCompare(String(b.date))); }
  if (ADD_DAY) { const today = new Date().toISOString().slice(0, 10); if (!log.some(r => r.date === today)) log.push({ date: today, hours: '', techs: who0.slice() }); ADD_DAY = false; }
  const tOpts = sel => techs().map(t => `<option value="${esc(t.email)}" ${t.email === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const clock = ((j.clocks || {})[ME.email]) || null;
  const extras = (j.extras && j.extras.length) ? j.extras : [{ desc: '', hours: '' }];
  const timer = `<div class="card no-print"><div class="sect" style="margin-top:0">Day timer</div>
    ${clock ? `<div class="qmeta">Clocked in at <b>${esc(new Date(clock.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}</b> (${esc(new Date(clock.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))}).</div>
      <div class="qactions"><button class="qbtn gold" id="clockOut">End day</button><button class="qbtn" id="clockCancel">Cancel timer</button></div>`
    : `<div class="qmeta">Tap Start when you arrive; tap End when you leave. Your hours are added to the time log below.</div><div class="qactions"><button class="qbtn gold" id="clockIn">Start day</button></div>`}</div>`;
  const parent = Q.returnFor ? `<div class="card" style="border-color:#E0B860"><div class="sect" style="margin-top:0;color:#8A5A00">Return visit</div><div class="qmeta">For: ${esc(Q.returnFor.label || '')}</div><div style="white-space:pre-wrap;margin-top:6px">${esc(Q.returnFor.openItems || '')}</div></div>` : '';
  const extrasCard = `<div class="card"><div class="sect" style="margin-top:0">Unplanned / extra work</div>
    <div class="qmeta">Anything done that was NOT on the quote (possible change order). Anthony and the sales rep are flagged.</div>
    <table id="exT"><tr><th>What was done</th><th style="width:80px">Hours</th><th style="width:130px">Who</th></tr>${extras.map(x => `<tr><td><input class="exd" value="${esc(x.desc || '')}" placeholder="e.g. Moved outlet behind TV"></td><td><input type="number" class="exh" min="0" step="0.25" value="${esc(x.hours ?? '')}"></td><td>${techPick('exw', '', x.by).replace('max-width:48%', 'max-width:100%;width:100%')}</td></tr>`).join('')}</table>
    <button type="button" class="qbtn" id="addEx" style="margin-top:6px">+ Add extra</button></div>`;
  return stepNav(true) + parent + `<section class="step" data-step="1">` + timer + `
    <div class="card"><div class="sect" style="margin-top:0">Time on site</div><div class="qmeta">One row per day: total hours on site, and check every tech who was there. Labor hours = hours × techs.</div>
    ${logTable(log)}
    <button type="button" class="qbtn" id="addLog" style="margin-top:6px">+ Add another day</button>${(sc0.dates || []).length > 1 ? `<div class="qmeta" style="margin-top:6px">Scheduled days: ${esc((sc0.dates || []).map(fmtDate).join(', '))}. Leave a day blank if nobody went; you can save now and come back to add the next day.</div>` : ''}</div></section>
    <section class="step" data-step="2">${productsCard(j)}${extrasCard}</section>
    <section class="step" data-step="3"><div class="card"><div class="sect" style="margin-top:0">Job recap</div>${jsSelect(((typeof Q !== 'undefined' && Q && Q.job) || {}).jobStatus || '')}
    ${[['work', 'Work completed'], ['issues', 'Problems / what took longer'], ['followups', 'Open items / return visit needed'], ['client', 'Client feedback']].map(([k, t]) => `<div class="qmeta" style="margin-top:8px;display:flex;justify-content:space-between;align-items:center">${t}<button type="button" class="qbtn bl" data-k="${k}" style="height:24px;padding:0 8px">• Bullet</button></div><textarea class="rc" data-k="${k}" rows="3" placeholder="${k === 'work' ? 'Required' : 'Optional'}">${esc((j.recap || {})[k] || '')}</textarea>`).join('')}
    </div></section>
    <section class="step" data-step="4"><div class="card">${photoBox(Q).replace('border-top:1px solid var(--line);margin-top:12px;padding-top:10px', '')}<div class="no-print" style="margin-top:12px"><a class="qbtn" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none" href="${ipHref(REF && REF.id)}">${ipDevs(Q).length ? 'Network / IP plan (' + ipDevs(Q).length + ')' : '+ Network / IP plan'}</a><div class="qmeta">Opens in a new tab so this report stays open.</div></div>${signoffBox(Q)}<div id="jobMsg" class="qmeta"></div></div></section>${actBar()}`;
}
function collectJob() {
  const log = collectLog(), inst = document.querySelectorAll('.pi').length ? [...document.querySelectorAll('.pi:checked')].map(x => x.value) : ((Q.job || {}).installedItems || []);
  const recap = {}; document.querySelectorAll('.rc').forEach(t => recap[t.dataset.k] = t.value.trim());
  const extras = [...document.querySelectorAll('#exT tr')].slice(1).map(tr => ({ desc: tr.querySelector('.exd').value.trim(), hours: Number(tr.querySelector('.exh').value) || 0, by: (tr.querySelector('.exw') || {}).value || '' })).filter(x => x.desc || x.hours);
  const jsEl = document.getElementById('jobStatus');
  return Object.assign({}, Q.job || {}, { jobStatus: jsEl ? jsEl.value : ((Q.job || {}).jobStatus || ''), lines: [], log, siteHours: siteHours(log), laborHours: laborHours(log), installedItems: inst, recap, extras, signoffSkip: signoffSkip(), photos: photosVal() || (Q.job || {}).photos || null, extrasHours: Math.round(extras.reduce((a, x) => a + x.hours, 0) * 100) / 100, savedAt: new Date().toISOString(), savedBy: ME.email });
}
// v11.10.0 D-Tools updates Anthony makes by hand (weekly list on his dashboard): upload the recap, set the installer task.
function dtoolsMarks(j) {
  const up = (j.dtoolsUploaded || {}).for === j.submittedAt, tk = (Q.dtoolsTasks || {}).for === j.submittedAt;
  const d = x => x ? new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  return (j.jobStatus === 'Complete' ? (up ? `<span class="qmeta" style="align-self:center">✓ Recap uploaded to D-Tools ${esc(d(j.dtoolsUploaded.at))}</span>` : '<button class="qbtn" id="markUploaded">Mark recap uploaded to D-Tools</button>') : '')
    + (tk ? `<span class="qmeta" style="align-self:center">✓ D-Tools task: ${esc(Q.dtoolsTasks.result || 'updated')}</span>` : '<button class="qbtn" id="markTask">Mark D-Tools task updated</button>');
}
function report(admin, canEdit) {
  const j = Q.job || {}, show = admin || ME.access === 'management';
  const daily = () => `    <div class="card"><div class="sect" style="margin-top:0">Time on site by day</div><table><tr><th>Date</th><th class="right">Hours on site</th><th>Techs</th><th class="right">Labor hrs</th></tr>
    ${crewRows(j.log).map(r => `<tr><td>${esc(fmtDate(r.date))}</td><td class="right">${hrs(r.hours)}</td><td>${esc(rowTechs(r).map(nameOf).join(', ') || '—')}</td><td class="right">${hrs(rowLabor(r))}</td></tr>`).join('') || '<tr><td colspan=4>—</td></tr>'}</table></div>`;
  const recapCard = () => `    <div class="card"><div class="sect" style="margin-top:0">Recap ${jsBadge(j.jobStatus)}</div>${[['work', 'Work completed'], ['issues', 'Problems / what took longer'], ['followups', 'Open items / return visit'], ['client', 'Client feedback']].map(([k, t]) => `<div class="qmeta" style="margin-top:6px">${t}</div><div style="white-space:pre-wrap">${esc((j.recap || {})[k] || '—')}</div>`).join('')}
    <div class="qmeta" style="margin-top:10px">Submitted by ${esc(nameOf(j.submittedBy))}${j.submittedAt ? ' · ' + esc(new Date(j.submittedAt).toLocaleString('en-US')) : ''}${j.reviewedAt && (Q.status === 'closed') ? ' · Approved by ' + esc(nameOf(j.reviewedBy)) + ' ' + esc(new Date(j.reviewedAt).toLocaleDateString('en-US')) : ''}</div></div>`;
  const actions = revisionsCard() + `<div class="qactions no-print"><button class="qbtn" id="pdfJob">Export PDF</button><a class="qbtn" style="display:inline-flex;align-items:center;text-decoration:none" href="${ipHref(REF && REF.id)}">${ipDevs(Q).length ? 'IP plan' : '+ IP / VLAN plan'}</a>${canEdit ? '<button class="qbtn gold" id="addDayJob">+ Log another day</button><button class="qbtn" id="editJob">Edit &amp; resubmit</button>' : ''}${canEdit && (Q.project || {}).dtoolsOpportunityId ? `<a class="qbtn" style="display:inline-flex;align-items:center;text-decoration:none" href="?new=1&opp=${encodeURIComponent(Q.project.dtoolsOpportunityId)}&rep=${encodeURIComponent(Q.project.salesManagerName || '')}">+ Another report for this project</a>` : ''}<button class="qbtn" onclick="window.print()">Print / Save PDF</button>
    ${admin && (j.recap || {}).followups && !j.returnVisitId ? '<button class="qbtn" id="makeReturn" style="border-color:#E0B860;color:#8A5A00">Create return visit</button>' : ''}${admin && j.returnVisitId ? '<a class="qbtn" style="display:inline-flex;align-items:center;text-decoration:none" href="?quote=' + encodeURIComponent(j.returnVisitId) + '">Open return visit</a>' : ''}
    ${admin && Q.status === 'closed' && j.submittedAt ? dtoolsMarks(j) : ''}
    ${admin && Q.status === 'submitted' ? '<button class="qbtn gold" id="approveJob">Approve &amp; close</button><button class="qbtn qbtn-del" id="sendBack">Send back</button>' : ''}</div><div id="revMsg" class="qmeta no-print"></div>`;
  const ex = (j.extras || []).filter(x => x.desc || x.hours);
  const extrasCard = ex.length ? `<div class="card" style="border-color:#F3B98F"><div class="sect" style="margin-top:0;color:#A1440B">Unplanned / extra work: possible change order (${hrs(ex.reduce((a, x) => a + (Number(x.hours) || 0), 0))} hrs)</div>
    <table><tr><th>What was done</th><th class="right">Hours</th><th>Who</th></tr>${ex.map(x => `<tr><td>${esc(x.desc)}</td><td class="right">${hrs(x.hours)}</td><td>${esc(techLabel(x.by))}</td></tr>`).join('')}</table></div>` : '';
  const parentCard = Q.returnFor ? `<div class="card"><div class="qmeta">Return visit for <b>${esc(Q.returnFor.label || '')}</b>. Open items were:</div><div style="white-space:pre-wrap">${esc(Q.returnFor.openItems || '')}</div></div>` : '';
  return parentCard + moneyCard(j, show) + productsReport(j) + extrasCard + daily() + recapCard() + punchCard(admin || canEdit) + photoReport(Q) + ipPlanCard(Q) + signoffReport(Q) + actions;
}
