// v11.0.0 Role-based dashboard data (ASBC Tools look). One place builds each person's alerts and number cards:
//   await window.asbcDashboard({ access, email, name, store, users }) ->
//     { alerts: [{ level: 'high'|'medium'|'low', text, href, items: [..] }], cards: [{ label, value, sub, href }] }
// Admin alerts reuse health.js (asbcHealth) plus the Jobs page's Needs-attention checks. Reads only.
(function () {
  const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const plus = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const pl = (n, w, ws) => n + ' ' + (n === 1 ? w : (ws || w + 's'));
  const title = q => (q.project && q.project.dtoolsProjectName) || q.label || (q.project && q.project.customerName) || q._id;
  const dates = q => ((q.schedule || {}).dates || []).slice().sort();
  const jobHref = q => './jobs.html?quote=' + encodeURIComponent(q._id);
  const hasLabor = q => (q.items || []).length > 0 || ['install', 'prog', 'flat'].some(k => Number(((q.dtoolsLabor || {})[k])) > 0);
  const isJob = q => ['won', 'scheduled', 'submitted', 'closed'].includes(q.status) && !q.mergedInto && !q.jobDeleted;
  const month = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }).slice(0, 7);
  async function load(ctx) {
    const db = firebase.firestore(), L = ASBCRoles.LEGACY[ctx.access] || {};
    let docs;
    if (L.role === 'tech' && !L.allQuotes) docs = (await db.collection('quotes').where('schedule.techs', 'array-contains', ctx.email).get()).docs;
    else if (ctx.access === 'manager') docs = (await db.collection('quotes').where('project.salesManagerName', '==', ctx.name || '').get()).docs;
    else docs = (await db.collection('quotes').get()).docs;
    return docs.map(d => ({ _id: d.id, ...d.data() })).filter(q => !q.isTemplate);
  }
  async function dashboard(ctx) {
    const db = firebase.firestore(), t = todayPT(), wk = plus(t, 6), two = plus(t, 2), mo = month();
    const qs = await load(ctx), jobs = qs.filter(isJob), alerts = [], cards = [];
    const add = (level, text, list, href, one) => { if (list.length) alerts.push({ level, text: text.replace('{n}', list.length), href: list.length === 1 && one ? one(list[0]) : href, items: list.slice(0, 10).map(x => typeof x === 'string' ? x : title(x)) }); };
    const users = ctx.users || {}, storeOfRep = n => ((Object.values(users).find(u => u && u.name === n)) || {}).store || '';
    const inStore = q => !ctx.store || ctx.store === 'none' || storeOfRep((q.project || {}).salesManagerName) === ctx.store;
    let stats = {}; try { const s = await db.collection('stats').doc(mo).get(); stats = (s.exists && s.data().reps) || {}; } catch (e) {}
    const upcoming = l => l.filter(q => q.status === 'scheduled' && dates(q).some(d => d >= t && d <= wk));

    if (ctx.access === 'installer' || ctx.access === 'lead') {
      const mine = jobs.filter(q => ((q.schedule || {}).techs || []).includes(ctx.email));
      add('high', '{n} install day(s) passed with no job report', mine.filter(q => q.status === 'scheduled' && dates(q).length && dates(q).slice(-1)[0] < t && !(q.job || {}).submittedAt), './jobs.html', jobHref);
      add('medium', '{n} of your job(s) have open punch-list items', mine.filter(q => (q.punch || []).some(x => !x.done)), './jobs.html', jobHref);
      const today = mine.filter(q => dates(q).includes(t));
      cards.push({ label: 'Today', value: today.length ? title(today[0]) : 'No job', sub: today.length > 1 ? '+' + (today.length - 1) + ' more' : '', href: today.length ? jobHref(today[0]) : './jobs.html' });
      cards.push({ label: 'This week', value: String(upcoming(mine).length), sub: pl(upcoming(mine).length, 'job'), href: './jobs.html' });
      const sent = mine.filter(q => String((q.job || {}).submittedAt || '').slice(0, 7) === mo).length;
      cards.push({ label: 'Reports this month', value: String(sent), sub: 'submitted', href: './jobs.html' });
      return { alerts, cards };
    }
    if (ctx.access === 'manager') {
      const me = jobs;  // already only this rep's quotes
      add('high', '{n} of your installs in the next 2 days have products not staged in D-Tools', me.filter(q => q.status === 'scheduled' && dates(q).some(d => d >= t && d <= two) && (q.parts || {}).total > (q.parts || {}).ready), './calendar.html', jobHref);
      add('medium', '{n} of your scheduled jobs have no labor quoted', me.filter(q => q.status === 'scheduled' && dates(q).some(d => d >= t) && !hasLabor(q)), './log.html');
      add('low', '{n} new job report(s) on your projects this week', me.filter(q => ['submitted', 'closed'].includes(q.status) && (q.job || {}).submittedAt && Date.now() - Date.parse(q.job.submittedAt) < 7 * 864e5), './jobs.html', jobHref);
      const mine = stats[ctx.name] || {}, score = r => 10 * (r.quotes || 0) + (r.accPts || 0);
      const ranked = Object.entries(stats).sort((a, b) => score(b[1]) - score(a[1])).map(x => x[0]), rank = ranked.indexOf(ctx.name) + 1;
      cards.push({ label: 'Your quotes this month', value: String(mine.quotes || 0), sub: mine.total ? '$' + Math.round(mine.total).toLocaleString('en-US') + ' quoted' : '', href: './log.html' });
      cards.push({ label: 'Bid accuracy', value: (mine.accPts > 0 ? '+' : '') + (mine.accPts || 0) + ' pts', sub: pl(mine.jobs || 0, 'finished job'), href: './leaderboard.html' });
      cards.push({ label: 'Leaderboard', value: rank ? '#' + rank : '—', sub: rank ? 'of ' + ranked.length + ' reps' : 'no quotes yet', href: './leaderboard.html' });
      cards.push({ label: 'Your upcoming installs', value: String(upcoming(me).length), sub: 'next 7 days', href: './calendar.html' });
      return { alerts, cards };
    }
    if (ctx.access === 'management' || ctx.access === 'director') {
      const sj = jobs.filter(inStore), recent = q => (q.job || {}).submittedAt && Date.now() - Date.parse(q.job.submittedAt) < 30 * 864e5;
      add('high', '{n} completed job(s) with client concerns' + (ctx.store && ctx.store !== 'none' ? ' at ' + ctx.store : ''), sj.filter(q => recent(q) && (q.signoff || {}).concerns), './jobs.html', jobHref);
      add('medium', '{n} job(s) ran more than 25% over the quoted time (last 30 days)', sj.filter(q => recent(q) && q.actuals && q.actuals.totalEstHours > 0 && q.actuals.totalActualHours > 1.25 * q.actuals.totalEstHours), './jobs.html', jobHref);
      const done = sj.filter(q => (q.job || {}).jobStatus === 'Complete' && String((q.job || {}).submittedAt || '').slice(0, 7) === mo).length;
      const reps = Object.entries(stats).filter(([n]) => !ctx.store || ctx.store === 'none' || storeOfRep(n) === ctx.store);
      cards.push({ label: 'Installs next 7 days', value: String(upcoming(sj).length), sub: ctx.store && ctx.store !== 'none' ? ctx.store : 'all stores', href: './calendar.html' });
      cards.push({ label: 'Completed this month', value: String(done), sub: 'job reports', href: './jobs.html' });
      cards.push({ label: 'Quotes this month', value: String(reps.reduce((a, [, r]) => a + (r.quotes || 0), 0)), sub: '$' + Math.round(reps.reduce((a, [, r]) => a + (r.total || 0), 0)).toLocaleString('en-US') + ' quoted', href: './leaderboard.html' });
      return { alerts, cards };
    }
    // admin
    try { (await window.asbcHealth()).issues.forEach(i => alerts.push(i)); } catch (e) {}
    add('medium', '{n} possible labor quote match(es) to confirm', jobs.filter(q => q.quoteSuggest && q.quoteSuggest.id && !(q.items || []).length), './jobs.html');
    add('medium', '{n} scheduled job(s) in the next 2 weeks with no labor quoted', jobs.filter(q => q.status === 'scheduled' && !q.noLaborAck && dates(q).some(d => d >= t && d <= plus(t, 14)) && !hasLabor(q)), './jobs.html');
    add('medium', '{n} unscheduled visit(s) to add to the D-Tools calendar', jobs.filter(q => (q.unscheduled || q.counted === 'no-quote') && !(q.schedule || {}).fromDtools && !q.unschedAck), './jobs.html');
    add('medium', '{n} install(s) removed from the D-Tools calendar', jobs.filter(q => (q.schedule || {}).dtoolsMissing && !q.missingAck), './jobs.html');
    try { const s = await db.collection('clientLogs').where('at', '>=', new Date(Date.now() - 7 * 864e5).toISOString()).get();
      const n = s.docs.filter(d => !/diag test/i.test(d.data().msg || '')).length; if (n) alerts.push({ level: 'low', text: n + ' app problem(s) logged this week', href: './users.html', items: [] }); } catch (e) {}
    const order = { high: 0, medium: 1, low: 2 }; alerts.sort((a, b) => order[a.level] - order[b.level]);
    cards.push({ label: 'Installs next 7 days', value: String(upcoming(jobs).length), sub: 'all crews', href: './calendar.html' });
    cards.push({ label: 'Reports to review', value: String(jobs.filter(q => q.status === 'submitted').length), sub: 'submitted by techs', href: './jobs.html' });
    try { const pd = await db.collection('pipeline').doc('data').get(); if (pd.exists) { const d = JSON.parse(pd.data().json || '{}'), act = Object.values(d.projects || {}).filter(x => !/completed/i.test(x.stage || ''));
      cards.push({ label: 'Active projects', value: String(act.length), sub: '$' + Math.round(act.reduce((a, x) => a + (Number(x.price) || 0), 0)).toLocaleString('en-US') + ' total', href: './pipeline.html' }); } } catch (e) {}
    cards.push({ label: 'Quotes this month', value: String(Object.values(stats).reduce((a, r) => a + (r.quotes || 0), 0)), sub: '$' + Math.round(Object.values(stats).reduce((a, r) => a + (r.total || 0), 0)).toLocaleString('en-US') + ' quoted', href: './leaderboard.html' });
    return { alerts, cards };
  }
  // Compact alert strip for the page a person lands on (techs: Jobs, reps: Calculator)
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function strip(alerts) {
    if (!alerts || !alerts.length) return '';
    const dot = { high: '#DC2626', medium: '#D97706', low: '#6B7280' };
    return `<div class="asbc-alerts" style="background:#FFF8EB;border:1px solid #E0B860;border-radius:12px;padding:10px 14px;margin:0 0 12px">${alerts.map(a => `<a href="${esc(a.href)}" style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;color:#1F2937;text-decoration:none;font-size:14px;font-weight:600"><span style="flex:0 0 8px;height:8px;border-radius:50%;margin-top:6px;background:${dot[a.level] || dot.low}"></span><span>${esc(a.text)}${a.items && a.items.length ? `<span style="display:block;font-weight:400;font-size:12px;color:#4B5563">${esc(a.items.join(' · '))}</span>` : ''}</span></a>`).join('')}</div>`;
  }
  window.asbcDashboard = dashboard;
  window.asbcAlertStrip = strip;
})();
