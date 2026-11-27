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
// v8.34.0: second argument extra = { meetings, holidays } from the D-Tools Calendar (left menu, Event + Project Task):
//   meetings = [{ id, title, allDay, start: 'YYYY-MM-DDTHH:MM:SS', end, location, people: [names] }]  (D-Tools "Scheduled Events")
//   holidays = [{ date: 'YYYY-MM-DD', name }]  (D-Tools company holidays; the Calendar adds US holidays itself)
// Meetings are stored with the other events (kind 'event') so they show on the Install Calendar with their team color.
// v10.9.0 THE D-TOOLS CALENDAR IS THE TRUTH (Anthony, Nov 25 2026):
//   - every project scheduled with a crew becomes a job (not only Anthony's), unless the install is already done;
//   - its labor quote attaches automatically: exact D-Tools id / project number / project name only (newest or locked quote wins);
//     a quote that only matches by client name is offered as job.quoteSuggest for Anthony to confirm on the Jobs page;
//   - a quote saved after the techs already reported on the placeholder job is attached to that job (items + laborQuote)
//     and the quote itself is hidden from the Jobs list (mergedInto), so there is never a second job;
//   - quoted labor from the D-Tools project (INSTALL_SERVICE / SRV-PROG lines, QTY = hours) is copied to job.dtoolsLabor;
//   - a future install whose D-Tools events are gone gets schedule.dtoolsMissing (shown under Needs attention);
//     an empty placeholder job is hidden; it all comes back if the events return.
//   - D-Tools "Scheduled Events" (company requests, no labor or revenue) stay calendar-only.
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
  const label0 = q => (q.project || {}).dtoolsProjectName || q.label || (q.project || {}).customerName || '';
  const cleanAddr = a => String(a || '').replace(/\r?\n/g, ', ').replace(/,\s*United States$/i, '').trim();

  async function importSchedule(projects, extra) {
    const db = firebase.firestore(), u = firebase.auth().currentUser;
    if (!u) throw new Error('not signed in');
    const users = ((await db.collection('config').doc('users').get()).data() || {}).users || {};
    const me = (u.email || '').toLowerCase();
    if (!u.isService && ASBCRoles.accessOf(users[me], me) !== 'admin') throw new Error('admin only');  // v11.11.0 isService: the hourly GitHub feed import (scripts/feed_import.js)
    const techByName = {};
    Object.entries(users).forEach(([e, p]) => { const a = ASBCRoles.accessOf(p, e); if (a === 'lead' || a === 'installer') techByName[fold(p.name)] = e; });
    let pipe = {};
    try { const s = await db.collection('pipeline').doc('data').get(); if (s.exists) pipe = (JSON.parse(s.data().json || '{}').projects) || {}; } catch (e) {}
    const idByName = {}, stageOf = {}, pipeByName = {}; Object.values(pipe).forEach(p => { idByName[fold(p.name)] = p.id; stageOf[p.id] = p.stage || ''; pipeByName[fold(p.name)] = p; });
    const all = (await db.collection('quotes').get()).docs.filter(d => { const q = d.data(); return !q.isTemplate && !q.jobDeleted; });
    const phIdByName = {}; all.forEach(d => { const q = d.data(), pr = q.project || {}; if (q.counted === 'dtools-schedule' && pr.dtoolsOpportunityId && pr.dtoolsProjectName) phIdByName[fold(pr.dtoolsProjectName)] = pr.dtoolsOpportunityId; });
    const out = { updated: [], created: [], linked: [], removed: [], unchanged: 0, events: 0, notified: [], skipped: [] };
    const toNotify = [];
    const events = [];
    for (const p of projects || []) {
      const tasks = (p.tasks || []).map(t => ({ ...t, techs: (t.assignees || []).map(n => techByName[fold(n)]).filter(Boolean), when: parse(t.start) || parse(t.due), until: parse(t.end) }))
        .filter(t => t.when);
      if (!tasks.length) continue;
      const dtoolsId = p.dtoolsId || idByName[fold(p.name)] || phIdByName[fold(p.name)] || '';  // v10.9.4 other PMs' projects: the id the GitHub sync stored on the job
      const finished = /installed|completed/i.test(p.stage || stageOf[dtoolsId] || '');
      const crew = tasks.filter(t => t.techs.length);
      // ---- find the job: labor quote first, then a placeholder this importer made
      const strongM = q => { const pr = q.project || {}; return !q.mergedInto && ((dtoolsId && pr.dtoolsOpportunityId === dtoolsId) || (p.number && pr.dtoolsOppNumber === p.number) || q.label === p.name || pr.customerName === p.name || pr.dtoolsProjectName === p.name); };
      const weakM = q => { const pr = q.project || {}; return !q.mergedInto && p.client && !(pr.dtoolsOpportunityId && dtoolsId && pr.dtoolsOpportunityId !== dtoolsId) && [q.label, pr.customerName, pr.dtoolsClientName].some(v => v && fold(v) === fold(p.client)); };
      const cand = all.filter(d => strongM(d.data()));
      const placeholder = d => d.data().counted === 'dtools-schedule';
      const rank = q => ({ scheduled: 0, won: 1, submitted: 2, closed: 3, draft: 4 }[q.status] ?? 5);
      const tms = q => { const v = q.updatedAt || q.savedAt; return v && v.toMillis ? v.toMillis() : (Date.parse(v || '') || 0); };
      const real = cand.filter(d => !placeholder(d)).sort((a, b) => rank(a.data()) - rank(b.data()) || (b.data().isLocked ? 1 : 0) - (a.data().isLocked ? 1 : 0) || tms(b.data()) - tms(a.data()));
      const holders = cand.filter(placeholder);
      const reported = holders.find(h => { const hq = h.data(); return hq.job || hq.signoff; });
      let doc = (reported && real[0]) ? reported : (real[0] || holders[0] || null);
      if (reported && real[0] && (reported.data().laborQuote || {}).id !== real[0].id) {  // v10.9.0 quote arrived after the techs reported: attach it to that job
        const rq = real[0].data();
        await reported.ref.set({ items: rq.items || [], options: rq.options || {}, laborQuote: { id: real[0].id, label: rq.label || '', at: new Date().toISOString() } }, { merge: true });
        await real[0].ref.set({ jobHidden: true, mergedInto: reported.id }, { merge: true });
        out.linked.push(p.name + ' (labor quote attached to the existing job)');
      }
      const weak = !real.length ? all.filter(d => !placeholder(d) && !strongM(d.data()) && weakM(d.data())).sort((a, b) => tms(b.data()) - tms(a.data()))[0] : null;
      const ppL = (pipeByName[fold(p.name)] || {}).laborQ || null;
      const evBase = t => ({ id: t.id, date: t.when.date, start: t.when.time, end: t.until && t.until.time > t.when.time ? t.until.time : '', name: p.name, client: p.client || '', number: p.number || '',
        pid: p.pid || null, techs: t.techs, people: t.assignees || [], desc: String(t.desc || '').trim(), address: cleanAddr(t.address), status: t.status || '', stage: p.stage || '' });
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
        if (p.pid && pr.dtoolsNum !== p.pid) link['dtoolsNum'] = p.pid;
        const ppc = (pipeByName[fold(p.name)] || {}).clientContact;  // v10.9.8 client name + phone for the techs
        if (ppc && JSON.stringify(ppc) !== JSON.stringify(pr.clientContact || null)) link['clientContact'] = ppc;  // v10.9.4 numeric D-Tools project id -> Open in D-Tools link
        const pp = pipeByName[fold(p.name)] || {};  // v9.3.0 proposal PDF + parts readiness from the pipeline sync
        if (pp.proposalPdf && pr.proposalPdf !== pp.proposalPdf) link['proposalPdf'] = pp.proposalPdf;
        if ((pp.files || []).length && JSON.stringify(pp.files) !== JSON.stringify(pr.files || [])) link['files'] = pp.files;  // v9.4.0 all project files
        const partsNow = pp.parts && pp.parts.known ? { total: pp.parts.total, ready: pp.parts.ready, notReady: (pp.parts.notReady || []).map(x => x.name + (x.qty > 1 ? ' ×' + x.qty : '')), items: (pp.parts.items || []).map(x => ({ name: x.name, qty: x.qty || 1, install: x.install || '' })) } : null;  // v10.0.0 items = tech checklist
        const partsChanged = partsNow && JSON.stringify(partsNow) !== JSON.stringify(q.parts || null);
        const extraSet = {};  // v10.9.0
        if (ppL && JSON.stringify(ppL) !== JSON.stringify(q.dtoolsLabor || null)) extraSet.dtoolsLabor = ppL;
        if (placeholder(doc) && !(q.items || []).length) { const sug = weak ? { id: weak.id, label: weak.data().label || (weak.data().project || {}).customerName || '', client: p.client || '' } : null;
          if (JSON.stringify(sug) !== JSON.stringify(q.quoteSuggest || null) && !(sug && q.quoteSuggestNo === sug.id)) extraSet.quoteSuggest = sug; }
        if (sc.dtoolsMissing) { extraSet.schedule = { dtoolsMissing: null }; extraSet.jobHidden = false; }
        if (Object.keys(extraSet).length) await ref.set(extraSet, { merge: true });
        if (Object.keys(link).some(k => !['dtoolsProjectName', 'dtoolsNum', 'clientContact'].includes(k))) out.linked.push(p.name);
        if (sc.dtoolsHash === sig && !Object.keys(link).length && !partsChanged) { out.unchanged++; }
        else if (sc.dtoolsHash === sig) { await ref.set(Object.assign({ project: Object.assign({}, pr, link) }, partsChanged ? { parts: partsNow } : {}), { merge: true }); out.unchanged++; }
        else {
          const prevImport = sc.dtoolsImport || { dates: [], techs: [] };
          const keepDates = (sc.dates || []).filter(d => !prevImport.dates.includes(d));   // added by hand
          const keepTechs = (sc.techs || []).filter(t => !prevImport.techs.includes(t));
          const schedule = Object.assign({}, sc, {
            dates: [...new Set(keepDates.concat(dates))].sort(), techs: [...new Set(keepTechs.concat(techs))],
            start: start || sc.start || '', end: end || (start ? '' : sc.end || ''), times, notes, address: address || sc.address || '',
            dtoolsHash: sig, dtoolsImport: { dates, techs, at: now }, dtoolsEventIds: crew.map(t => t.id), fromDtools: true, dtoolsMissing: null, updatedAt: now, updatedBy: 'D-Tools calendar' });
          const st = open && ['draft', 'won', undefined, ''].includes(q.status) ? 'scheduled' : q.status;
          await ref.set(Object.assign({ schedule, status: st, project: Object.assign({}, pr, link) }, open ? { jobHidden: false } : {}, partsChanged ? { parts: partsNow } : {}), { merge: true });
          out.updated.push(p.name);
          // tell the techs when the install itself changed (not on a link-only or first-time refresh with the same days/times/techs)
          // compare as plain text (Firestore returns map keys in a different order, so never compare objects as JSON)
          const sig2 = (ds, tm, s0, e0, ts) => (ds || []).slice().sort().map(d => d + '@' + ((tm && tm[d]) ? tm[d].start + '-' + (tm[d].end || '') : (tm && Object.keys(tm).length ? '' : (s0 || '') + '-' + (e0 || '')))).join('|') + '#' + (ts || []).slice().sort().join(',');
          const was = sig2(sc.dates, sc.times, sc.start, sc.end, sc.techs);
          const now2 = sig2(schedule.dates, times, schedule.start, schedule.end, schedule.techs);
          if (open && was !== now2 && schedule.dates.some(d => d >= todayPT())) toNotify.push({ quote: ref.id, change: (sc.dates || []).length ? 'updated' : 'new', name: p.name });
        }
        tasks.forEach(t => pushEv(t, doc.id));
      } else if (open && p.name && (p.pid || p.number || p.dtoolsId)) {  // v10.9.0 any D-Tools PROJECT on the calendar with a crew (was: only Anthony's); tasks with no project stay calendar-only
        const id = 'job-dt-' + (dtoolsId || fold(p.name).replace(/[^a-z0-9]+/g, '-')).slice(0, 60);
        await db.collection('quotes').doc(id).set({
          id, label: p.name, noQuote: true, status: 'scheduled', items: [], isTemplate: false, counted: 'dtools-schedule', updatedAt: new Date(),
          dtoolsLabor: ppL, quoteSuggest: weak ? { id: weak.id, label: weak.data().label || (weak.data().project || {}).customerName || '', client: p.client || '' } : null,
          project: { customerName: p.name, dtoolsProjectName: p.name, dtoolsNum: p.pid || null, clientContact: (pipeByName[fold(p.name)] || {}).clientContact || null, salesManagerName: p.rep || '', dtoolsOpportunityId: dtoolsId, dtoolsOppNumber: p.number || '', dtoolsClientName: p.client || '', proposalPdf: (pipeByName[fold(p.name)] || {}).proposalPdf || '', files: (pipeByName[fold(p.name)] || {}).files || [] },
          schedule: { dates, techs, start, end, times, notes, address, dtoolsHash: sig, dtoolsImport: { dates, techs, at: now }, dtoolsEventIds: crew.map(t => t.id), fromDtools: true, updatedAt: now, updatedBy: 'D-Tools calendar' }
        }, { merge: true });
        out.created.push(p.name);
        tasks.forEach(t => pushEv(t, id));
        if (dates.some(d => d >= todayPT())) toNotify.push({ quote: id, change: 'new', name: p.name });
      } else {
        tasks.forEach(t => pushEv(t, ''));   // not ours / install done: show on the Calendar only
        out.skipped.push(p.name + ' (install done): shown as calendar event');
      }
    }
    // v10.9.0 installs removed from the D-Tools calendar: future-only, inside the dates this import covered, never once a report exists
    const seen = new Set(), seenDates = [];
    (projects || []).forEach(p => (p.tasks || []).forEach(t => { seen.add(t.id); const w = parse(t.start) || parse(t.due); if (w) seenDates.push(w.date); }));
    seenDates.sort(); const d0w = seenDates[0], d1w = seenDates[seenDates.length - 1], today = todayPT();
    out.missing = [];
    if (d0w) for (const d of all) {
      const q = d.data(), sc = q.schedule || {}, ids = sc.dtoolsEventIds || [], ds = (sc.dtoolsImport || {}).dates || [];
      if (!sc.fromDtools || q.status !== 'scheduled' || (q.job || {}).submittedAt || !ids.length || !ds.length || sc.dtoolsMissing) continue;
      if (ids.some(i => seen.has(i))) continue;
      if (!ds.every(x => x >= today && x >= d0w && x <= d1w)) continue;
      const hide = q.counted === 'dtools-schedule' && !q.job && !q.signoff;
      await d.ref.set(Object.assign({ schedule: { dtoolsMissing: new Date().toISOString() } }, hide ? { jobHidden: true } : {}), { merge: true });
      out.missing.push(label0(q));
    }
    // D-Tools scheduled events (store work, warehouse pickups, holds…): one entry per day they cover
    for (const m of ((extra || {}).meetings || [])) {
      const d0 = String(m.start || '').slice(0, 10), d1 = String(m.end || m.start || '').slice(0, 10) || d0;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d0)) continue;
      const people = m.people || [], crew = people.filter(n => techByName[fold(n)]);
      for (let d = d0, i = 0; d <= (d1 < d0 ? d0 : d1) && i < 31; i++) {
        events.push({ id: 'mt' + m.id + '-' + d, kind: 'event', date: d, start: m.allDay ? '' : String(m.start).slice(11, 16), end: m.allDay ? '' : String(m.end || '').slice(11, 16),
          name: String(m.title || 'Event').trim(), client: '', number: '', techs: crew.map(n => techByName[fold(n)]), people, crew, desc: '', address: String(m.location || '').trim(), status: '', stage: '', job: '' });
        const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); d = x.toISOString().slice(0, 10);
      }
    }
    const holidays = ((extra || {}).holidays || []).filter(h => h && /^\d{4}-\d{2}-\d{2}/.test(h.date)).map(h => ({ date: String(h.date).slice(0, 10), name: String(h.name || 'Holiday') }));
    out.events = events.filter(e => !e.job).length;
    await db.collection('config').doc('dtoolsEvents').set({ events, holidays, at: new Date().toISOString() });
    for (const n of toNotify) out.notified.push(n.name + ': ' + await notify({ kind: 'schedule', quote: n.quote, change: n.change }));
    try { out.tasksSeen = await taskCheck(projects); } catch (e) { console.warn('task check', e); }  // v11.10.0
    try { await db.collection('config').doc('syncStatus').set({ okAt: new Date().toISOString(), problem: '', problemAt: '', via: (extra || {}).via || 'pull' }, { merge: true }); } catch (e) {}
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
  // v9.1.0: project messages (email, Teams, texts, calls) for the Pipeline tiles. items = [{ id, project (D-Tools project name), date, source, kind, title, detail, url }]
  async function importFeed(items) {
    const u = firebase.auth().currentUser; if (!u) throw new Error('not signed in');
    const clean = (items || []).filter(m => m && m.title && m.date).slice(0, 300).map(m => ({ id: String(m.id || ''), project: m.project ? String(m.project) : '', date: String(m.date), source: String(m.source || ''),
      kind: String(m.kind || 'update'), title: String(m.title).slice(0, 160), detail: String(m.detail || '').slice(0, 200), url: m.url ? String(m.url) : '' }));
    await firebase.firestore().collection('pipeline').doc('feed').set({ items: clean, at: new Date().toISOString() });
    return { saved: clean.length, withProject: clean.filter(m => m.project).length };
  }
  window.asbcImportFeed = importFeed;
  // v9.3.0 Pre-install heads-up to the sales rep (Teams), 2 days before the first install day (Friday also covers Monday).
  // The checklist comes from what is being installed (D-Tools items) plus the standard site-readiness items.
  function checklistFor(names) {
    const t = (names || []).join(' ').toLowerCase(), out = [];
    if (/oled|beovision|tv|contour|harmony|theatre|lg /.test(t)) out.push('TV location confirmed: wall blocking or stand, power and network at the TV');
    if (/beolab|speaker|shape|celestial|in-wall|in-ceiling/.test(t)) out.push('Speaker locations clear; power at each active speaker');
    if (/shape/.test(t)) out.push('Shape wall ready (paint dry, layout agreed), outlet near the amplifier tile');
    if (/eero|unifi|ubiquiti|switch|router|network|access point|poe/.test(t)) out.push('Internet live; access to modem/router and Wi-Fi name and password');
    if (/rack|core|amp|encore|wattbox|strong/.test(t)) out.push('Equipment location with power and ventilation');
    if (/motoriz|lift|mount/.test(t)) out.push('Mounting surface approved by the client (no surprises behind the wall)');
    out.push('Client (or someone with authority) home for the full window; gate/parking/access details');
    out.push('Clear path for delivery and removal of packaging');
    out.push('Any payment due before install has been collected');
    return out;
  }
  async function prepReminders() {
    const db = firebase.firestore(), t = todayPT();
    const add = n => { const x = new Date(t + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    const wd = new Date(t + 'T12:00:00Z').getUTCDay(), targets = [add(2)].concat(wd === 5 ? [add(3)] : []).concat(wd === 4 ? [add(4)] : []);
    let pipe = {}; try { const s = await db.collection('pipeline').doc('data').get(); if (s.exists) pipe = JSON.parse(s.data().json || '{}').projects || {}; } catch (e) {}
    const byName = {}; Object.values(pipe).forEach(p => byName[fold(p.name)] = p);
    const out = [];
    for (const s of (await db.collection('quotes').where('status', '==', 'scheduled').get()).docs) {
      const q = s.data(), sc = q.schedule || {}, pr = q.project || {};
      const first = (sc.dates || []).filter(d => d >= t).sort()[0];
      if (q.isTemplate || q.jobDeleted || !first || !targets.includes(first) || q.prepSent === first || !pr.salesManagerName) continue;
      const pp = byName[fold(pr.dtoolsProjectName || q.label)] || {};
      const unstaged = ((pp.parts || {}).notStaged || []).map(x => x.name + (x.qty > 1 ? ' ×' + x.qty : ''));  // v9.9.0 products not Staged in D-Tools
      const st = await notify({ kind: 'prep', quote: s.id, checklist: checklistFor((pp.parts || {}).names || []), unstaged });
      if (st === 200) await s.ref.set({ prepSent: first }, { merge: true });
      out.push((pr.dtoolsProjectName || q.label) + ': ' + st);
    }
    return out;
  }
  // v9.3.0 Opportunities that reach Proposal / Customer Review with no labor quote in the calculator: one Teams message to the rep.
  // Ones already in those stages on the first run are recorded without a message (config/oppLabor.seen).
  async function oppLaborCheck() {
    const db = firebase.firestore(), ref = db.collection('config').doc('oppLabor');
    const doc = await ref.get(), seen = (doc.exists && doc.data().seen) || {}, first = !doc.exists;
    const ops = (await db.collection('opportunities').get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(o => /proposal|customer review/i.test(o.stage || ''));
    const qs = (await db.collection('quotes').get()).docs.map(d => d.data()).filter(q => !q.isTemplate);
    const has = o => qs.some(q => (q.project || {}).dtoolsOpportunityId === o.id || fold(q.label) === fold(o.name));
    const out = { checked: ops.length, missing: 0, sent: [], baseline: first };
    const upd = {};
    for (const o of ops) { if (has(o)) continue; out.missing++; if (seen[o.id]) continue;
      if (!first && out.sent.length < 10) { const st = await notify({ kind: 'opp', opp: o.id }); out.sent.push(o.name + ': ' + st); if (st !== 200) continue; }
      upd[o.id] = new Date().toISOString(); }
    if (Object.keys(upd).length || first) await ref.set({ seen: upd, at: new Date().toISOString() }, { merge: true });
    return out;
  }
  // v9.11.0 D-Tools project stage from the latest job report's status (jobs.html queues quote.dtoolsStage).
  // Step 1 (calculator tab): asbcPendingStages() -> [{quote, project, name, want, from}]
  // Step 2 (d-tools.cloud tab, signed in): change each project's stage; Step 3 (calculator tab): asbcStagesDone(results)
  async function pendingStages() {
    const db = firebase.firestore(); let pipe = {};
    try { const s = await db.collection('pipeline').doc('data').get(); if (s.exists) pipe = JSON.parse(s.data().json || '{}').projects || {}; } catch (e) {}
    const P = Object.values(pipe), out = [];
    for (const s of (await db.collection('quotes').where('dtoolsStage.done', '==', false).get()).docs) {
      const q = s.data(), w = q.dtoolsStage || {}, pr = q.project || {};
      const p = P.find(x => x.id === pr.dtoolsOpportunityId) || P.find(x => fold(x.name) === fold(pr.dtoolsProjectName || q.label));
      const close = result => s.ref.set({ dtoolsStage: { done: true, result, appliedAt: new Date().toISOString() } }, { merge: true });
      if (!p) { await close('no open D-Tools project found'); continue; }
      if (String(p.stage || '').toLowerCase() === String(w.want).toLowerCase()) { await close('already ' + w.want); continue; }
      if (/completed/i.test(p.stage || '')) { await close('project already Completed; not reopened'); continue; }
      out.push({ quote: s.id, project: p.num || p.id, name: p.name, want: w.want, from: p.stage || '' });  // v10.4.1 D-Tools' own stage calls take the numeric project id (the GUID gave 400)
    }
    return out;
  }
  async function stagesDone(results) {
    const db = firebase.firestore();
    for (const r of (results || []).filter(r => r && r.quote)) { const ref = db.collection('quotes').doc(r.quote), t = (((await ref.get()).data() || {}).dtoolsStage || {}).tries || 0;
      await ref.set({ dtoolsStage: r.ok ? { done: true, result: r.from + ' → ' + r.want, appliedAt: new Date().toISOString() } : { done: t + 1 >= 3, tries: t + 1, result: 'failed: ' + (r.err || '') } }, { merge: true }); }
    return (results || []).map(r => r.name + ': ' + (r.ok ? r.from + ' → ' + r.want : 'FAILED ' + r.err));
  }
  // v10.3.0 the "ASBC sync" bookmark's compact rows -> the same {projects, extra} the scheduled pull builds
  function rawToProjects(raw, MINE) {
    const by = {};
    for (const r of raw.E || []) { const [pid, name, number, client, stage, id, taskId, tname, d, st, et, status, res, desc, address] = r;
      const k = pid || ('x' + id), p = by[k] || (by[k] = { pid, name, number, client, stage, rep: MINE[pid] || '', mine: pid in MINE, tasks: [] }), all = st === '00:00:00' && et === '00:00:00';
      p.tasks.push({ id: 'ev' + id, taskId, name: tname, start: all ? d : d + ' ' + String(st).slice(0, 5), end: all ? '' : d + ' ' + String(et).slice(0, 5), status, assignees: res || [], desc, address }); }
    return { projects: Object.values(by), extra: { meetings: (raw.M || []).map(([id, title, allDay, start, end, location, people]) => ({ id, title, allDay, start, end, location, people })), holidays: (raw.HO || []).map(([date, name]) => ({ date, name })).filter(x => x.date) } };
  }
  window.asbcRawToProjects = rawToProjects;
  // v10.4.0 installer task status from job reports (replaces the encrypted jobs.enc list the D-Tools pull used to decrypt).
  // Each report submitted in the last 14 days and not yet applied: target task status Completed (job Complete) or In Progress.
  async function pendingTasks(days, limit) {
    const db = firebase.firestore(); let pipe = {};
    try { const s = await db.collection('pipeline').doc('data').get(); if (s.exists) pipe = JSON.parse(s.data().json || '{}').projects || {}; } catch (e) {}
    const P = Object.values(pipe), users = ((await db.collection('config').doc('users').get()).data() || {}).users || {}, since = new Date(Date.now() - (days || 14) * 864e5).toISOString(), out = [];
    for (const d of (await db.collection('quotes').where('status', '==', 'closed').get()).docs) {
      const q = d.data(), j = q.job || {}, pr = q.project || {}; if (!j.submittedAt || j.submittedAt < since) continue;
      if (q.dtoolsTasks && q.dtoolsTasks.for === j.submittedAt) continue;
      const p = P.find(x => x.id === pr.dtoolsOpportunityId) || P.find(x => fold(x.name) === fold(pr.dtoolsProjectName || q.label));
      const techs = [...new Set((j.log || []).flatMap(r => Array.isArray(r.techs) ? r.techs : (r.who ? [r.who] : [])))].map(e => (users[e] || {}).name || e);
      out.push({ quote: d.id, for: j.submittedAt, project: p ? p.id : '', url: p ? p.url : '', name: p ? p.name : (pr.dtoolsProjectName || q.label), techs, dates: [...new Set((j.log || []).map(r => r.date))].sort(), target: j.jobStatus === 'Complete' ? 'Completed' : 'In Progress' });
    }
    return out.slice(0, limit || 5);
  }
  // v11.10.0 installer task statuses are now set by hand in D-Tools: every calendar import (bookmark or evening pull) marks a
  // job report's task update done once D-Tools shows that status on the techs' task for the project.
  async function taskCheck(projects) {
    const pend = await pendingTasks(60, 100); if (!pend.length) return 0;
    let pipe = {}; try { const s = await firebase.firestore().collection('pipeline').doc('data').get(); if (s.exists) pipe = JSON.parse(s.data().json || '{}').projects || {}; } catch (e) {}
    const P = Object.values(pipe), done = [];
    for (const t of pend) {
      const p = P.find(x => x.id === t.project) || {};
      const ids = [t.project, p.id, p.num].filter(Boolean).map(String);
      const pr = (projects || []).find(x => ids.includes(String(x.pid || '')) || (t.name && fold(x.name) === fold(t.name)));
      if (!pr) continue;
      const mine = (pr.tasks || []).filter(k => !t.techs.length || (k.assignees || []).some(a => t.techs.some(n => fold(n) === fold(a))));
      const ok = mine.some(k => k.status === 'Completed' || (t.target === 'In Progress' && k.status === 'In Progress'));
      if (ok) done.push(Object.assign({}, t, { ok: true, result: 'seen in D-Tools: ' + t.target }));
    }
    if (done.length) await tasksDone(done);
    return done.length;
  }
  // v11.10.0 weekly list of D-Tools updates Anthony makes by hand, grouped by project:
  // stage changes still waiting for the bookmark, installer task statuses to set, and Complete job recaps to upload.
  async function dtoolsTodo() {
    const db = firebase.firestore(); let pipe = {};
    try { const s = await db.collection('pipeline').doc('data').get(); if (s.exists) pipe = JSON.parse(s.data().json || '{}').projects || {}; } catch (e) {}
    const P = Object.values(pipe), by = {};
    const proj = (name, oppId) => P.find(x => oppId && x.id === oppId) || P.find(x => fold(x.name) === fold(name)) || {};
    const row = (name, oppId) => { const p = proj(name, oppId), k = p.id || fold(name); return by[k] || (by[k] = { project: p.name || name, url: p.url || '', jobs: [], need: [] }); };
    for (const s of await pendingStages()) row(s.name).need.push('stage → ' + s.want);
    for (const t of await pendingTasks(60, 100)) { const r = row(t.name); r.need.push('installer task → ' + t.target + (t.dates.length ? ' (' + t.dates.slice(-1)[0] + ')' : '')); r.jobs.push(t.quote); }
    const since = new Date(Date.now() - 60 * 864e5).toISOString();
    for (const d of (await db.collection('quotes').where('status', '==', 'closed').get()).docs) {
      const q = d.data(), j = q.job || {}, pr = q.project || {};
      if (q.isTemplate || q.jobDeleted || j.jobStatus !== 'Complete' || !j.submittedAt || j.submittedAt < since) continue;
      if ((j.dtoolsUploaded || {}).for === j.submittedAt) continue;
      const r = row(pr.dtoolsProjectName || q.label, pr.dtoolsOpportunityId); r.need.push('upload job recap'); r.jobs.push(d.id);
    }
    return Object.values(by).map(r => Object.assign(r, { jobs: [...new Set(r.jobs)], recap: r.jobs.length ? 'https://asbcinc.github.io/LaborCalculator/jobs.html?quote=' + encodeURIComponent(r.jobs[0]) : '' }));
  }
  window.asbcDtoolsTodo = dtoolsTodo;
  window.asbcTaskCheck = taskCheck;
  // v11.10.0 a scheduled run that can't reach D-Tools records why, so the stale-sync alert can say what to fix
  window.asbcSyncProblem = async reason => { await firebase.firestore().collection('config').doc('syncStatus').set({ problem: String(reason || '').slice(0, 120), problemAt: new Date().toISOString() }, { merge: true }); return true; };
  async function tasksDone(results) {
    const db = firebase.firestore();
    for (const r of results || []) await db.collection('quotes').doc(r.quote).set({ dtoolsTasks: { for: r.for, at: new Date().toISOString(), result: r.result || (r.ok ? 'set to ' + r.target : 'skipped') } }, { merge: true });
    return (results || []).length;
  }
  window.asbcPendingTasks = pendingTasks;
  window.asbcTasksDone = tasksDone;
  window.asbcPendingStages = pendingStages;
  window.asbcStagesDone = stagesDone;
  window.asbcPrepReminders = prepReminders;
  window.asbcOppLaborCheck = oppLaborCheck;
  window.asbcImportSchedule = importSchedule;
  window.asbcRecapNudge = recapNudge;
})();
