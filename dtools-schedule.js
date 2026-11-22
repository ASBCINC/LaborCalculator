// v8.31.0 D-Tools installer schedule -> labor calculator jobs (Install Calendar + Job Recaps).
// D-Tools' API has no task schedule, so the hourly "ASBC D-Tools pull" scheduled task reads each project's Tasks
// view on the D-Tools website and calls window.asbcImportSchedule(projects) in this app, signed in as an admin:
//   projects = [{ name, number, client, rep, stage?, dtoolsId?, tasks: [{ id, name, start, due, status, assignees: [names] }] }]
//   start/due like "2026-11-24 9:00 AM", "2026-11-24" or null.
// For each project the tasks that have an installer (Team Lead / Installer role) assigned become the job's
// install dates, time window and techs. The job is the project's labor quote when there is one; otherwise a
// scheduled job without a quote is created. A job is only changed when its D-Tools tasks changed since the
// last import (schedule.dtoolsHash); dates or techs Anthony added by hand are kept (merged, never removed).
(function () {
  const pad = n => String(n).padStart(2, '0');
  function parse(v) {  // -> { date: 'YYYY-MM-DD', time: 'HH:MM' | '' }
    if (!v) return null;
    const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?/);
    if (!m) return null;
    let t = '';
    if (m[2] != null) { let h = Number(m[2]); const ap = (m[4] || '').toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; t = pad(h) + ':' + m[3]; }
    return { date: m[1], time: t };
  }
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  function hash(o) { const s = JSON.stringify(o); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); }
  async function importSchedule(projects) {
    const db = firebase.firestore(), u = firebase.auth().currentUser;
    if (!u) throw new Error('not signed in');
    const users = ((await db.collection('config').doc('users').get()).data() || {}).users || {};
    const me = (u.email || '').toLowerCase();
    if (ASBCRoles.accessOf(users[me], me) !== 'admin') throw new Error('admin only');
    const techByName = {};
    Object.entries(users).forEach(([e, p]) => { const a = ASBCRoles.accessOf(p, e); if (a === 'lead' || a === 'installer') techByName[fold(p.name)] = e; });
    let pipe = {};
    try { const s = await db.collection('pipeline').doc('data').get(); if (s.exists) pipe = (JSON.parse(s.data().json || '{}').projects) || {}; } catch (e) {}
    const idByName = {}, stageOf = {}; Object.values(pipe).forEach(p => { idByName[fold(p.name)] = p.id; stageOf[p.id] = p.stage || ''; });
    const out = { updated: [], created: [], unchanged: 0, skipped: [] };
    for (const p of projects || []) {
      const tasks = (p.tasks || []).map(t => ({ ...t, techs: (t.assignees || []).map(n => techByName[fold(n)]).filter(Boolean), when: parse(t.start) || parse(t.due) }))
        .filter(t => t.techs.length && t.when);
      if (!tasks.length) { out.skipped.push(p.name + ' (no installer task with a date)'); continue; }
      const dates = [...new Set(tasks.map(t => t.when.date))].sort();
      const techs = [...new Set(tasks.flatMap(t => t.techs))].sort();
      const timed = tasks.filter(t => t.when.time).sort((a, b) => a.when.date.localeCompare(b.when.date));
      const start = timed.length ? timed[0].when.time : '';
      const sig = hash({ dates, techs, start, t: tasks.map(t => [t.id, t.when.date, t.when.time, t.status]).sort() });
      const dtoolsId = p.dtoolsId || idByName[fold(p.name)] || '';
      const finished = /installed|completed/i.test(p.stage || stageOf[dtoolsId] || '');  // D-Tools says the install is done: never reopen or create a job for it
      let docs = [];
      if (dtoolsId) docs = (await db.collection('quotes').where('project.dtoolsOpportunityId', '==', dtoolsId).get()).docs;
      if (!docs.length) docs = (await db.collection('quotes').where('label', '==', p.name).get()).docs;
      docs = docs.filter(d => { const q = d.data(); return !q.isTemplate && !q.jobDeleted; });
      const rank = q => ({ scheduled: 0, won: 1, submitted: 2, closed: 3, draft: 4 }[q.status] ?? 5);
      docs.sort((a, b) => rank(a.data()) - rank(b.data()));
      const now = new Date().toISOString();
      if (docs.length) {
        const ref = docs[0].ref, q = docs[0].data(), sc = q.schedule || {};
        if (sc.dtoolsHash === sig) { out.unchanged++; continue; }
        const prevImport = sc.dtoolsImport || { dates: [], techs: [] };
        const keepDates = (sc.dates || []).filter(d => !prevImport.dates.includes(d));   // added by hand
        const keepTechs = (sc.techs || []).filter(t => !prevImport.techs.includes(t));
        const schedule = Object.assign({}, sc, {
          dates: [...new Set(keepDates.concat(dates))].sort(), techs: [...new Set(keepTechs.concat(techs))],
          start: start || sc.start || '', dtoolsHash: sig, dtoolsImport: { dates, techs, at: now }, fromDtools: true,
          updatedAt: now, updatedBy: 'D-Tools tasks' });
        const open = !finished && tasks.some(t => !/complete/i.test(t.status || ''));  // all tasks done or project installed: record the dates, don't reopen the job
        const st = open && ['draft', 'won', undefined, ''].includes(q.status) ? 'scheduled' : q.status;
        await ref.set(Object.assign({ schedule, status: st }, open ? { jobHidden: false } : {}), { merge: true });
        out.updated.push(p.name);
      } else if (finished || !tasks.some(t => !/complete/i.test(t.status || ''))) {
        out.skipped.push(p.name + ' (install done in D-Tools, no job in the calculator)');
      } else {
        const id = 'job-dt-' + (dtoolsId || fold(p.name).replace(/[^a-z0-9]+/g, '-')).slice(0, 60);
        await db.collection('quotes').doc(id).set({
          id, label: p.name, noQuote: true, status: 'scheduled', items: [], isTemplate: false, counted: 'dtools-schedule', updatedAt: new Date(),
          project: { customerName: p.name, salesManagerName: p.rep || '', dtoolsOpportunityId: dtoolsId, dtoolsOppNumber: p.number || '', dtoolsClientName: p.client || '' },
          schedule: { dates, techs, start, end: '', dtoolsHash: sig, dtoolsImport: { dates, techs, at: now }, fromDtools: true, updatedAt: now, updatedBy: 'D-Tools tasks' }
        }, { merge: true });
        out.created.push(p.name);
      }
    }
    return out;
  }
  window.asbcImportSchedule = importSchedule;
})();
