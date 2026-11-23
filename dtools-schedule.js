// v8.31.0 D-Tools installer schedule -> labor calculator jobs (Install Calendar + Job Recaps).
// v8.32.0: the hourly "ASBC D-Tools pull" scheduled task reads EVERY event on the D-Tools scheduling calendar
// (Events/GetEvents3, from the signed-in D-Tools page in the built-in browser) and calls, signed in here as an admin:
//   window.asbcImportSchedule(projects)
//   projects = [{ name, number, client, rep, stage, mine, tasks: [{ id, name, start, end, status, assignees: [names], desc, address }] }]
//   one task entry per calendar event day; start/end like "2026-11-24 09:00" (or "2026-11-24 9:00 AM"); a date alone = all day.
//   mine = Anthony is the project's PM.
// For each project:
//   - a labor quote in the calculator for it (D-Tools id, project number, project name, or the client's name) becomes the job:
//     its install dates, per-day time windows, techs, address and event notes are filled in from the calendar, and the
//     D-Tools project is linked to it. A placeholder job this importer made earlier for the same project is removed
//     (only while it has no report).
//   - no quote, Anthony's project, install not done: a job without a quote is created (as before).
//   - anything else is shown on the Calendar as a D-Tools event (config/dtoolsEvents), with its team color and notes.
// A job only changes when its calendar events changed (schedule.dtoolsHash). Dates and techs Anthony added by hand are kept.
// v8.33.0: every event is kept in config/dtoolsEvents (with the job it belongs to, so the Pipeline can show the next install);
// the D-Tools project name is stored on the job (project.dtoolsProjectName) and shown as its title; when an install is added
// or its days, times or techs change, the assigned techs get a Teams message (relay /notify); window.asbcRecapNudge() reminds
// techs about today's jobs with no report (run by the D-Tools pull at its 5:37 PM run).
(function () {
  const pad = n => String(n).padStart(2, '0');
  function parse(v) {  // -> { date: 'YYYY-MM-DD', time: 'HH:MM' | '' }
    if (!v) return null;
    const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?/);
    if (!m) return null;
    let t = '';
    if (m[2] != null) { let h = Number(m[2]); const ap = (m[4] || '').toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; t = pad(h) + ':' + m[3]; }
    if (t === '00:00') t = '';  // all-day events
    return { date: m[1], time: t };
  }
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  function hash(o) { const s = JSON.stringify(o); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); }
  const RELAY = 'https://yellow-cloud-830a.a-ward-612.workers.dev';
  async function notify(body) {
    try { const t = await firebase.auth().currentUser.getIdToken();
      const r = await fetch(RELAY + '/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(body) });
      return r.status; } catch (e) { return 'error'; }
  }
  const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const cleanAddr = a => String(a || '').replace(/\r?\n/g, ', ').replace(/,\s*United States$/i, '').trim();

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
    const all = (await db.collection('quotes').get()).docs.filter(d => { const q = d.data(); return !q.isTemplate && !q.jobDeleted; });
    const out = { updated: [], created: [], linked: [], removed: [], unchanged: 0, events: 0, notified: [], skipped: [] };
    const toNotify = [];
    const events = [];
    for (const p of projects || []) {
      const tasks = (p.tasks || []).map(t => ({ ...t, techs: (t.assignees || []).map(n => techByName[fold(n)]).filter(Boolean), when: parse(t.start) || parse(t.due), until: parse(t.end) }))
        .filter(t => t.when);
      if (!tasks.length) continue;
      const dtoolsId = p.dtoolsId || idByName[fold(p.name)] || '';
      const finished = /installed|completed/i.test(p.stage || stageOf[dtoolsId] || '');
      const crew = tasks.filter(t => t.techs.length);
      // ---- find the job: labor quote first, then a placeholder this importer made
      const cand = all.filter(d => { const q = d.data(), pr = q.project || {};
        return (dtoolsId && pr.dtoolsOpportunityId === dtoolsId) || (p.number && pr.dtoolsOppNumber === p.number) || q.label === p.name || pr.customerName === p.name ||
          (p.client && !(pr.dtoolsOpportunityId && dtoolsId && pr.dtoolsOpportunityId !== dtoolsId) && [q.label, pr.customerName, pr.dtoolsClientName].some(v => v && fold(v) === fold(p.client))); });
      const placeholder = d => d.data().counted === 'dtools-schedule';
      const rank = q => ({ scheduled: 0, won: 1, submitted: 2, closed: 3, draft: 4 }[q.status] ?? 5);
      const real = cand.filter(d => !placeholder(d)).sort((a, b) => rank(a.data()) - rank(b.data()));
      const holders = cand.filter(placeholder);
      let doc = real[0] || holders[0] || null;
      const evBase = t => ({ id: t.id, date: t.when.date, start: t.when.time, end: t.until && t.until.time > t.when.time ? t.until.time : '', name: p.name, client: p.client || '', number: p.number || '',
        techs: t.techs, people: t.assignees || [], desc: String(t.desc || '').trim(), address: cleanAddr(t.address), status: t.status || '', stage: p.stage || '' });
      const crewNames = t => (t.assignees || []).filter(n => techByName[fold(n)]);
      const pushEv = (t, job) => events.push(Object.assign(evBase(t), { job: job || '', crew: crewNames(t) }));
      if (!crew.length) { tasks.forEach(t => pushEv(t, doc ? doc.id : '')); continue; }
      const dates = [...new Set(crew.map(t => t.when.date))].sort();
      const techs = [...new Set(crew.flatMap(t => t.techs))].sort();
      const times = {}; crew.filter(t => t.when.time).forEach(t => { const e = evBase(t); if (!times[e.date] || e.start < times[e.date].start) times[e.date] = { start: e.start, end: e.end }; });
      const firstT = Object.keys(times).sort()[0];
      const start = firstT ? times[firstT].start : '', end = firstT ? times[firstT].end : '';
      const notes = crew.filter(t => String(t.desc || '').trim()).map(t => (dates.length > 1 ? t.when.date + ': ' : '') + String(t.desc).trim());
      const address = cleanAddr((crew.find(t => t.address) || {}).address);
      const sig = hash({ v: 2, dates, techs, times, notes, address, t: crew.map(t => [t.id, t.when.date, t.when.time, t.status]).sort() });
      const now = new Date().toISOString();
      const open = !finished && crew.some(t => !/complete/i.test(t.status || ''));
      if (doc) {
        const ref = doc.ref, q = doc.data(), sc = q.schedule || {}, pr = q.project || {};
        // a labor quote now carries this job: drop the empty placeholder made before the quote was found
        if (!placeholder(doc)) for (const h of holders) { const hq = h.data(); if (!hq.job && !hq.signoff && hq.status === 'scheduled') { await h.ref.delete(); out.removed.push(p.name); } }
        const link = {};
        if (dtoolsId && !pr.dtoolsOpportunityId) link['dtoolsOpportunityId'] = dtoolsId;
        if (p.number && !pr.dtoolsOppNumber) link['dtoolsOppNumber'] = p.number;
        if (p.client && !pr.dtoolsClientName) link['dtoolsClientName'] = p.client;
        if (p.rep && !pr.salesManagerName) link['salesManagerName'] = p.rep;
        if (p.name && pr.dtoolsProjectName !== p.name) link['dtoolsProjectName'] = p.name;
        if (Object.keys(link).some(k => k !== 'dtoolsProjectName')) out.linked.push(p.name);
        if (sc.dtoolsHash === sig && !Object.keys(link).length) { out.unchanged++; }
        else {
          const prevImport = sc.dtoolsImport || { dates: [], techs: [] };
          const keepDates = (sc.dates || []).filter(d => !prevImport.dates.includes(d));   // added by hand
          const keepTechs = (sc.techs || []).filter(t => !prevImport.techs.includes(t));
          const schedule = Object.assign({}, sc, {
            dates: [...new Set(keepDates.concat(dates))].sort(), techs: [...new Set(keepTechs.concat(techs))],
            start: start || sc.start || '', end: end || (start ? '' : sc.end || ''), times, notes, address: address || sc.address || '',
            dtoolsHash: sig, dtoolsImport: { dates, techs, at: now }, dtoolsEventIds: crew.map(t => t.id), fromDtools: true, updatedAt: now, updatedBy: 'D-Tools calendar' });
          const st = open && ['draft', 'won', undefined, ''].includes(q.status) ? 'scheduled' : q.status;
          await ref.set(Object.assign({ schedule, status: st, project: Object.assign({}, pr, link) }, open ? { jobHidden: false } : {}), { merge: true });
          out.updated.push(p.name);
          // tell the techs when the install itself changed (not on a link-only or first-time refresh with the same days/times/techs)
          const was = JSON.stringify([(sc.dates || []).slice().sort(), sc.times || (sc.start ? { all: [sc.start, sc.end || ''] } : {}), (sc.techs || []).slice().sort()]);
          const now2 = JSON.stringify([schedule.dates, Object.keys(times).length ? times : (schedule.start ? { all: [schedule.start, schedule.end || ''] } : {}), schedule.techs.slice().sort()]);
          if (open && was !== now2 && schedule.dates.some(d => d >= todayPT())) toNotify.push({ quote: ref.id, change: (sc.dates || []).length ? 'updated' : 'new', name: p.name });
        }
        tasks.forEach(t => pushEv(t, doc.id));
      } else if (p.mine && open) {
        const id = 'job-dt-' + (dtoolsId || fold(p.name).replace(/[^a-z0-9]+/g, '-')).slice(0, 60);
        await db.collection('quotes').doc(id).set({
          id, label: p.name, noQuote: true, status: 'scheduled', items: [], isTemplate: false, counted: 'dtools-schedule', updatedAt: new Date(),
          project: { customerName: p.name, dtoolsProjectName: p.name, salesManagerName: p.rep || '', dtoolsOpportunityId: dtoolsId, dtoolsOppNumber: p.number || '', dtoolsClientName: p.client || '' },
          schedule: { dates, techs, start, end, times, notes, address, dtoolsHash: sig, dtoolsImport: { dates, techs, at: now }, dtoolsEventIds: crew.map(t => t.id), fromDtools: true, updatedAt: now, updatedBy: 'D-Tools calendar' }
        }, { merge: true });
        out.created.push(p.name);
        tasks.forEach(t => pushEv(t, id));
        if (dates.some(d => d >= todayPT())) toNotify.push({ quote: id, change: 'new', name: p.name });
      } else {
        tasks.forEach(t => pushEv(t, ''));   // not ours / install done: show on the Calendar only
        out.skipped.push(p.name + (finished ? ' (install done)' : ' (no quote, not your project)') + ': shown as calendar event');
      }
    }
    out.events = events.filter(e => !e.job).length;
    await db.collection('config').doc('dtoolsEvents').set({ events, at: new Date().toISOString() });
    for (const n of toNotify) out.notified.push(n.name + ': ' + await notify({ kind: 'schedule', quote: n.quote, change: n.change }));
    return out;
  }
  // Today's jobs (Pacific date) still waiting on a report: one Teams reminder to the assigned techs.
  async function recapNudge() {
    const db = firebase.firestore(), d = todayPT(), out = [];
    const docs = (await db.collection('quotes').where('status', '==', 'scheduled').get()).docs;
    for (const s of docs) { const q = s.data(), sc = q.schedule || {};
      if (q.isTemplate || q.jobDeleted || !(sc.dates || []).includes(d) || !(sc.techs || []).length || (q.job || {}).submittedAt) continue;
      if ((q.nudged || '') === d) continue;
      const st = await notify({ kind: 'nudge', quote: s.id });
      if (st === 200) await s.ref.set({ nudged: d }, { merge: true });
      out.push((((q.project || {}).dtoolsProjectName) || q.label) + ': ' + st); }
    return out;
  }
  window.asbcImportSchedule = importSchedule;
  window.asbcRecapNudge = recapNudge;
})();
