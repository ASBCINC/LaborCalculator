function wire() {
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  on('saveSched', async () => {
    const dates = [...document.querySelectorAll('.dt')].map(x => x.value).filter(Boolean).sort();
    const ts = [...document.querySelectorAll('.tk:checked')].map(x => x.value);
    let st = document.getElementById('stSel').value;
    if (['draft', 'won'].includes(st) && dates.length && ts.length) st = 'scheduled';
    const tS = document.getElementById('tStart').value || '', tE = document.getElementById('tEnd').value || '', sc0 = Q.schedule || {};
    const sched = { dates, techs: ts, start: tS, end: tE, updatedAt: new Date().toISOString(), updatedBy: ME.email };
    if (tS !== (sc0.start || '') || tE !== (sc0.end || '')) sched.times = firebase.firestore.FieldValue.delete();  // v8.32.0: a hand-set window replaces the per-day D-Tools windows
    await save(REF, { status: st, jobHidden: false, jobDeleted: false, schedule: sched });
    showJob(qid);
  });
  on('addEx', () => { const tr = document.querySelector('#exT tr:last-child').cloneNode(true); tr.querySelectorAll('input').forEach(i => i.value = ''); document.getElementById('exT').appendChild(tr); });
  on('clockIn', async () => {
    const clocks = Object.assign({}, (Q.job || {}).clocks, { [ME.email]: { start: new Date().toISOString() } });
    await save(REF, { job: Object.assign({}, collectJob(), { clocks }) }); showJob(qid);
  });
  on('clockCancel', async () => {
    if (!confirm('Cancel the running timer? Nothing will be added to the time log.')) return;
    const clocks = Object.assign({}, (Q.job || {}).clocks); delete clocks[ME.email];
    await save(REF, { job: Object.assign({}, collectJob(), { clocks }) }); showJob(qid);
  });
  on('clockOut', async () => {
    const c = ((Q.job || {}).clocks || {})[ME.email]; if (!c) return;
    const h = Math.max(0.25, Math.round((Date.now() - new Date(c.start).getTime()) / 3600000 * 4) / 4);
    if (!confirm('End day: ' + h.toFixed(2) + ' hours on site. Add to the time log?')) return;
    const job = collectJob();
    const day = new Date(c.start); const d = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
    const row = (job.log || []).find(r => r.date === d);
    if (row) { row.hours = Math.max(Number(row.hours) || 0, h); row.techs = [...new Set((row.techs || []).concat([ME.email]))]; }
    else job.log = (job.log || []).concat([{ date: d, hours: h, techs: [ME.email] }]);
    job.siteHours = siteHours(job.log); job.laborHours = laborHours(job.log);
    job.clocks = Object.assign({}, job.clocks); delete job.clocks[ME.email];
    await save(REF, { job }); showJob(qid);
  });
  on('makeReturn', async () => {
    const j = Q.job || {}; const id = 'job-' + Date.now();
    await db.collection('quotes').doc(id).set({
      id, label: 'Return visit: ' + label(Q), noQuote: true, status: 'scheduled', items: [],
      project: Object.assign({}, Q.project || {}), returnFor: { id: qid, label: label(Q), openItems: (j.recap || {}).followups || '' },
      schedule: { dates: [], techs: ((Q.schedule || {}).techs || []).slice(), updatedAt: new Date().toISOString(), updatedBy: ME.email },
      updatedAt: new Date(), isTemplate: false, counted: 'return-visit'
    });
    await save(REF, { job: Object.assign({}, j, { returnVisitId: id }) });
    location.href = '?quote=' + encodeURIComponent(id);
  });
  on('addLog', () => { const tr = document.querySelector('#logT tr:last-child').cloneNode(true); tr.querySelector('.lh').value = ''; const d = tr.querySelector('.ld'); if (d.value) { const x = new Date(d.value + 'T12:00:00'); x.setDate(x.getDate() + 1); d.value = x.toISOString().slice(0, 10); } document.getElementById('logT').appendChild(tr); });
  on('allInst', () => { document.querySelectorAll('.pi').forEach(c => c.checked = true); autosave(); });
  on('soOpen', async () => { await save(REF, { job: collectJob() }); location.href = './signoff.html?quote=' + encodeURIComponent(qid); });
  on('saveJob', async () => { clearTimeout(SAVE_T); await save(REF, { job: collectJob() }); saveState('Saved ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })); flash('Saved. You can come back and finish later.'); });
  on('stepNext', () => goStep(STEP + 1));
  on('stepBack', () => goStep(STEP - 1));
  on('pdfJob', () => jobPdf(document.getElementById('pdfJob')));  // v10.6.0
  on('linkQuote', () => linkQuotePicker());  // v11.12.0
  on('markUploaded', async () => { const j = Q.job || {}; await save(REF, { job: Object.assign({}, j, { dtoolsUploaded: { for: j.submittedAt, at: new Date().toISOString(), by: ME.email } }) }); showJob(qid); });  // v11.10.0
  on('markTask', async () => { const j = Q.job || {}; await save(REF, { dtoolsTasks: { for: j.submittedAt, at: new Date().toISOString(), result: 'marked by ' + (ME.name || ME.email) } }); showJob(qid); });
  on('editJob', () => { EDIT = true; STEP = 1; showJob(qid); });
  on('addDayJob', () => { EDIT = true; ADD_DAY = true; STEP = 1; showJob(qid); });  // v10.1.0
  on('cancelEdit', async () => {
    clearTimeout(SAVE_T);
    if (!confirm('Discard your edits? The report stays as it was last submitted.')) return;
    await save(REF, { jobDraft: firebase.firestore.FieldValue.delete() }); EDIT = false; STEP = 1; showJob(qid);
  });
  on('submitJob', async () => {
    clearTimeout(SAVE_T);
    const job = collectJob();
    const { must, check } = checkJob(job);
    markMissing(must.concat(check));
    if (must.length) return sheet({ title: 'A few things are missing', sub: 'Tap an item to jump to it.', must, check });
    if (check.length && !(await sheet({ title: 'Before you submit', sub: 'These are optional. Tap one to fix it, or submit anyway.', check, okLabel: EDIT ? 'Resubmit anyway' : 'Submit anyway' }))) return;
    const now = new Date().toISOString();
    job.submittedAt = now; job.submittedBy = ME.email; job.reviewNote = '';
    if (EDIT) {
      const prev = Q._live || {};
      job.revision = (prev.revision || 1) + 1; job.changeSummary = diffJob(prev, job); job.firstSubmittedAt = prev.firstSubmittedAt || prev.submittedAt || now;
      delete job.reviewedAt; delete job.reviewedBy;
    } else { job.revision = job.revision || 1; job.firstSubmittedAt = job.firstSubmittedAt || now; }
    const data = { job, status: 'closed' }, act = actualsFrom(job); if (act) data.actuals = act;
    if (!(Q.punch || []).length) { const pl = punchFrom((job.recap || {}).followups); if (pl.length) data.punch = pl; }  // v9.3.0 punch list from Open items
    if (EDIT) { data.jobDraft = firebase.firestore.FieldValue.delete(); data.jobRevisions = firebase.firestore.FieldValue.arrayUnion(Object.assign({}, Q._live || {}, { revision: (Q._live || {}).revision || 1, clocks: null })); }
    await save(REF, data);
    if (act && job.jobStatus === 'Complete' && !Q.accScored) { try { await ASBCBoard.recordAccuracy(db, (Q.project || {}).salesManagerName, act.totalEstHours, act.totalActualHours); await REF.set({ accScored: { at: new Date().toISOString(), est: act.totalEstHours, act: act.totalActualHours } }, { merge: true }); } catch (err) { console.warn('accuracy tally', err); } }  // v10.2.0 scored once, when the job is marked Complete (all days logged)
    EDIT = false;
    notifyRecap(qid);
    STEP = 1; await showJob(qid);
    flash(job.revision > 1 ? 'Report resubmitted (rev ' + job.revision + '). Anthony and the sales rep were notified.' : 'Report submitted. Anthony and the sales rep were notified.');
  });
  on('approveJob', async () => {
    const j = Q.job || {}; const lines = [];
    (Q.items || []).forEach((it, i) => { const l = (j.lines || []).find(x => x.i === i); if (l && l.actualHours != null && lineEst(it) > 0) lines.push({ id: it.id, name: lineName(it), zone: it.zone || 'General', qty: it.qty, estHours: Math.round(lineEst(it) * 100) / 100, actualHours: l.actualHours, note: l.note || '' }); });
    const actuals = { lines, totalEstHours: Math.round(lines.reduce((a, l) => a + l.estHours, 0) * 100) / 100, totalActualHours: Math.round(lines.reduce((a, l) => a + l.actualHours, 0) * 100) / 100,
      notes: [(j.recap || {}).issues, (j.recap || {}).followups].filter(Boolean).join(' | '), savedAt: new Date().toISOString(), source: 'job report' };
    if (!lines.length) { await REF.set({ status: 'closed', job: Object.assign({}, j, { reviewedAt: new Date().toISOString(), reviewedBy: ME.email }) }, { merge: true }); return showJob(qid); }
    await REF.set({ status: 'closed', actuals, job: Object.assign({}, j, { reviewedAt: new Date().toISOString(), reviewedBy: ME.email }) }, { merge: true });
    if (!Q.actuals) { try { await ASBCBoard.recordAccuracy(db, (Q.project || {}).salesManagerName, actuals.totalEstHours, actuals.totalActualHours); } catch (err) { console.warn('accuracy tally', err); } }  // v8.24.0: a resubmitted job is tallied once
    showJob(qid);
  });
  on('sendBack', async () => {
    const note = prompt('What needs fixing? (the tech will see this)'); if (note === null) return;
    await REF.set({ status: 'scheduled', job: Object.assign({}, Q.job || {}, { reviewNote: note, reviewedBy: ME.email, reviewedAt: new Date().toISOString() }) }, { merge: true });
    showJob(qid);
  });
}
