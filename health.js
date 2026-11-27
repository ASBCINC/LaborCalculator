// v8.33.0 Data health checks. Shown to admins on Home ("Needs attention") and run every Monday by the D-Tools pull,
// which posts the result to Anthony's project dashboard. Reads only; never changes anything.
//   await window.asbcHealth() -> { at, issues: [{ level: 'high'|'medium'|'low', text, href, items: [names] }] }
(function () {
  const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const hoursAgo = iso => iso ? (Date.now() - Date.parse(iso)) / 36e5 : Infinity;
  // v9.3.0 crew double-booking: a tech on two different jobs/events the same day whose times overlap (all-day counts as the whole day)
  const mins = v => { if (!v) return null; const [h, m] = String(v).split(':').map(Number); return h * 60 + (m || 0); };
  function conflicts(events, users) {
    const nameOf = e => ((users || {})[e] || {}).name || e;
    const by = {};
    (events || []).forEach(e => (e.techs || []).forEach(t => { const k = t + '|' + e.date; (by[k] = by[k] || []).push(e); }));
    const out = [];
    Object.entries(by).forEach(([k, l]) => {
      const uniq = []; l.forEach(e => { if (!uniq.some(x => x.name === e.name)) uniq.push(e); });
      if (uniq.length < 2) return;
      for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) {
        const a = uniq[i], b = uniq[j], as = mins(a.start), ae = mins(a.end) || (as != null ? as + 120 : null), bs = mins(b.start), be = mins(b.end) || (bs != null ? bs + 120 : null);
        const overlap = as == null || bs == null || (as < be && bs < ae);
        if (overlap) { const [t, d] = k.split('|'); out.push({ tech: t, techName: nameOf(t), date: d, a: a.name, b: b.name }); }
      }
    });
    return out.sort((x, y) => x.date.localeCompare(y.date));
  }
  window.asbcConflicts = conflicts;
  async function health() {
    const db = firebase.firestore(), today = todayPT();
    const users = ((await db.collection('config').doc('users').get()).data() || {}).users || {};
    const names = new Set(Object.values(users).map(u => u && u.name).filter(Boolean));
    const qs = (await db.collection('quotes').get()).docs.map(d => ({ _id: d.id, ...d.data() })).filter(q => !q.isTemplate && !q.jobDeleted);
    const title = q => (q.project && q.project.dtoolsProjectName) || q.label || (q.project && q.project.customerName) || q._id;
    const dates = q => ((q.schedule || {}).dates || []).slice().sort();
    const issues = [];
    const add = (level, text, list, href) => { if (list.length) issues.push({ level, text: text.replace('{n}', list.length), href: href || './jobs.html', items: list.slice(0, 12) }); };
    add('high', '{n} install day(s) passed with no job report', qs.filter(q => q.status === 'scheduled' && dates(q).length && dates(q).slice(-1)[0] < today && !(q.job || {}).submittedAt).map(title));
    add('medium', '{n} job(s) marked Scheduled with no install date', qs.filter(q => q.status === 'scheduled' && !dates(q).length && !q.jobHidden).map(title));
    add('medium', '{n} completed job report(s) with no client sign-off', qs.filter(q => ['closed', 'submitted'].includes(q.status) && (q.job || {}).jobStatus === 'Complete' && !((q.signoff || {}).status === 'signed') && !((q.job || {}).signoffSkip || {}).status).map(title));
    add('low', '{n} won/scheduled job(s) not linked to a D-Tools project', qs.filter(q => ['won', 'scheduled'].includes(q.status) && !(q.project || {}).dtoolsOpportunityId).map(title), './log.html');
    const badRep = [...new Set(qs.map(q => (q.project || {}).salesManagerName).filter(n => n && !names.has(n)))];
    add('medium', '{n} sales rep name(s) on quotes that match no one in User Roles', badRep, './users.html');
    add('low', '{n} sales rep(s) with no store (left off the leaderboard)', Object.values(users).filter(u => u && ['manager', 'director'].includes(u.access) && (!u.store || u.store === 'none')).map(u => u.name), './users.html');
    // v9.3.0 open punch-list items from job reports
    const punch = qs.filter(q => (q.punch || []).some(x => !x.done)).map(q => title(q) + ' (' + q.punch.filter(x => !x.done).length + ')');
    add('medium', '{n} job(s) with open punch-list items', punch);
    try {
      const evd = await db.collection('config').doc('dtoolsEvents').get();
      const c = conflicts(((evd.exists && evd.data().events) || []).filter(e => e.date >= today), users);
      add('high', '{n} crew double-booking(s)', c.map(x => x.techName.split(' ')[0] + ' ' + x.date.slice(5) + ': ' + x.a + ' + ' + x.b), './calendar.html');
    } catch (e) {}
    try {
      const ev = await db.collection('config').doc('dtoolsEvents').get();
      let PROB = ''; try { const ss = await db.collection('config').doc('syncStatus').get(); PROB = (ss.exists && ss.data().problem) || ''; } catch (e) {}  // v11.10.0
      const day = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' });
      const limit = day === 'Mon' ? 74 : day === 'Sun' || day === 'Sat' ? 999 : 26;
      if (!ev.exists || hoursAgo(ev.data().at) > limit) issues.push({ level: 'high', text: 'D-Tools calendar sync hasn\'t run since ' + (ev.exists ? new Date(ev.data().at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'ever') + (PROB ? ' (' + PROB + ')' : '') + ': open D-Tools and click the ASBC sync bookmark', href: './calendar.html', items: [] });
    } catch (e) {}
    try {
      const pd = await db.collection('pipeline').doc('data').get();
      if (pd.exists) { const d = JSON.parse(pd.data().json || '{}');
        if (hoursAgo(d.generatedAt) > 30) issues.push({ level: 'medium', text: 'Pipeline data is ' + Math.round(hoursAgo(d.generatedAt)) + ' hours old (Sync D-Tools opportunities workflow)', href: './pipeline.html', items: [] }); }
    } catch (e) {}
    const order = { high: 0, medium: 1, low: 2 };
    issues.sort((a, b) => order[a.level] - order[b.level]);
    return { at: new Date().toISOString(), issues };
  }
  window.asbcHealth = health;
})();
