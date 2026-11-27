// ---------- list ----------
async function showList() {
  document.getElementById('pageTitle').textContent = ME.role === 'tech' ? 'My Jobs' : 'Jobs';
  let docs;
  if (ME.role === 'tech') docs = await quick(() => db.collection('quotes').where('schedule.techs', 'array-contains', ME.email).get().then(x => x.docs), () => restQuery('schedule.techs', 'ARRAY_CONTAINS', ME.email), 'job list');
  else if (ME.role === 'rep' && !ME.allQuotes) docs = (await db.collection('quotes').where('project.salesManagerName', '==', ME.name).get()).docs;
  else docs = (await db.collection('quotes').where('status', 'in', ['won', 'scheduled', 'submitted', 'closed']).get()).docs;
  const dated = q => ((q.schedule || {}).dates || []).length > 0;
  const jobs = docs.map(d => ({ _id: d.id, ...d.data() })).filter(q => q.status && q.status !== 'draft' && !q.jobDeleted && !q.mergedInto && !(q.jobHidden && !dated(q)) && !(ME.role !== 'admin' && (q.schedule || {}).dtoolsMissing && !q.job));  // v10.9.0 merged quotes and installs removed from D-Tools stay out  // removed undated jobs come back once they get dates; deleted jobs come back only if re-scheduled from the Quote Log
  const first = q => ((q.schedule && q.schedule.dates) || []).slice().sort()[0] || '';
  // v8.33.0: submitted reports whose last install day (or submission) is 30+ days old move to the Archive
  const cut = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const lastDay = q => ((q.schedule || {}).dates || []).slice().sort().pop() || String((q.job || {}).submittedAt || '').slice(0, 10) || '';
  const old = q => ['submitted', 'closed'].includes(q.status) && lastDay(q) && lastDay(q) < cut;
  const ARCH = new URLSearchParams(location.search).has('archive');
  const archived = jobs.filter(old);
  if (ARCH) { jobs.length = 0; archived.forEach(q => jobs.push(q)); } else { const keep = jobs.filter(q => !old(q)); jobs.length = 0; keep.forEach(q => jobs.push(q)); }
  if (ME.role === 'tech' && !ARCH) return techList(jobs, archived);  // v10.9.0 big-card layout for installers
  const groups = ME.role === 'rep' ? [['Job reports', jobs.filter(q => ['submitted', 'closed'].includes(q.status))], ['Scheduled', jobs.filter(q => q.status === 'scheduled')]]
    : ME.role === 'tech'
    ? [['Assigned to you', jobs.filter(q => q.status === 'scheduled')], ['Submitted reports', jobs.filter(q => ['submitted', 'closed'].includes(q.status))]]
    : [['Older reports awaiting approval', jobs.filter(q => q.status === 'submitted')], ['Won: needs scheduling', jobs.filter(q => q.status === 'won')], ['Scheduled', jobs.filter(q => q.status === 'scheduled' && dated(q))], ['Not on the calendar', jobs.filter(q => q.status === 'scheduled' && !dated(q))], ['Submitted reports', jobs.filter(q => q.status === 'closed')]];
  app().innerHTML = (ARCH ? `<div class="qactions" style="margin:0 0 6px"><a class="qbtn" href="./jobs.html">‹ Back to current jobs</a></div><div class="sect">Archive: reports older than 30 days (${archived.length})</div>` : ME.role === 'rep' ? '' : `<div class="qactions" style="margin:0 0 6px"><button class="qbtn gold" onclick="showNew()">+ Unscheduled / emergency visit</button></div>` + (ME.role === 'admin' ? attentionCard(jobs) : '')) + groups.filter(g => g[1].length || !['Not on the calendar', 'Older reports awaiting approval'].includes(g[0])).map(([t, list]) => `<div class="sect">${esc(t)} (${list.length})</div>` + (t === 'Not on the calendar' ? '<div class="qmeta" style="margin:-4px 0 8px">Marked scheduled but no install date. Open one to add dates, or Delete it.</div>' : '') +
    (list.length ? list.sort((a, b) => first(a).localeCompare(first(b))).map(q => `<a href="?quote=${encodeURIComponent(q._id)}" style="text-decoration:none;color:inherit"><div class="qrow ${teamCls(q)}">
      <div class="qtop"><div><div class="qname">${esc(label(q))} ${stBadge(q.status)} ${jsBadge((q.job || {}).jobStatus)}${isSigned(q) ? ' <span class="st st-closed">' + (q.signoff.concerns ? 'SIGNED · CONCERNS' : 'SIGNED') + '</span>' : ''}</div>
      <div class="qmeta">${esc((q.project || {}).dtoolsClientName || '')}${(q.project || {}).dtoolsOppNumber ? ' · #' + esc(q.project.dtoolsOppNumber) : ''} · Rep: ${esc((q.project || {}).salesManagerName || '—')}</div>${subLabel(q) ? `<div class="qmeta">${esc(subLabel(q))}</div>` : ''}</div>
      <div class="qnums"><div class="qnum-b" style="white-space:pre-line">${esc(dayWins(q.schedule || {}, '\n') || 'Not scheduled')}</div>
      <div class="qmeta">${esc(((q.schedule || {}).techs || []).map(nameOf).join(', '))}${teamCls(q) && teamCls(q) !== 'BOTH' ? ` <span class="tm ${teamCls(q)}">${teamCls(q)} Team</span>` : ''}</div>${ME.role === 'admin' ? `<button class="qbtn qbtn-del" style="margin-top:6px" onclick="event.preventDefault();event.stopPropagation();deleteJob('${esc(q._id)}')">Delete</button>` : ''}</div></div></div></a>`).join('') : '<div class="empty" style="padding:10px 0">None</div>')).join('')
    + (!ARCH && archived.length ? `<p class="qmeta" style="margin-top:14px"><a href="./jobs.html?archive=1" style="color:#1F6FD1">Archive: ${archived.length} report${archived.length === 1 ? '' : 's'} older than 30 days ›</a></p>` : '')
    + (ME.role === 'admin' && !ARCH ? '<p class="qmeta" style="margin-top:14px">To schedule any quote (even one not yet Won), open it from the Quote Log and tap Job.</p>' : '');
}

// ---------- v10.9.0 installer view: Today / Needs your report / Coming up / Submitted ----------
const TODAY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const mapLink = a => a ? `<a href="https://maps.google.com/?q=${encodeURIComponent(a)}" target="_blank" rel="noopener">${esc(a)}</a>` : '';
const sentQ = q => ['submitted', 'closed'].includes(q.status);
function dayWin(q, d) { const sc = q.schedule || {}; const w = (sc.times || {})[d] || (!sc.times || !Object.keys(sc.times).length ? sc : null); return w && w.start ? tWin(w) : 'All day'; }
function chip(q) { if (sentQ(q)) return '<span class="tchip sent">✓ Report submitted</span>'; if ((q.job || {}).savedAt) return '<span class="tchip saved">Report started, not submitted</span>'; return '<span class="tchip new">Report not started</span>'; }
function techList(jobs, archived) {
  const t = TODAY(), first = (ME.name || '').split(' ')[0], ds = q => ((q.schedule || {}).dates || []).slice().sort();
  const todayJobs = jobs.filter(q => ds(q).includes(t));
  const late = jobs.filter(q => !todayJobs.includes(q) && q.status === 'scheduled' && ds(q).some(d => d < t) && !ds(q).some(d => d > t));
  const soon = jobs.filter(q => !todayJobs.includes(q) && !late.includes(q) && ds(q).some(d => d > t)).sort((a, b) => (ds(a).find(d => d > t) || '').localeCompare(ds(b).find(d => d > t) || ''));
  const done = jobs.filter(q => sentQ(q) && !todayJobs.includes(q) && !soon.includes(q));
  const crew = q => ((q.schedule || {}).techs || []).filter(e => e !== ME.email).map(e => nameOf(e).split(' ')[0]);
  const big = (q, kind) => { const d = kind === 'late' ? ds(q).filter(x => x < t).pop() : t, addr = (q.schedule || {}).address || '', cw = crew(q);
    const btn = sentQ(q) ? (kind === 'today' ? 'Open job · log today’s hours' : 'View report') : (q.job || {}).savedAt ? 'Continue job report' : 'Start job report';
    return `<div class="tcard ${kind === 'late' ? 'warn' : sentQ(q) ? 'done' : ''}"><div class="tname">${esc(label(q))}</div>
      <div class="tline">🕘 ${esc(kind === 'late' ? fmtDate(d) + ' · ' : '')}${esc(dayWin(q, d))}${ds(q).length > 1 ? ` · day ${ds(q).indexOf(d) + 1} of ${ds(q).length}` : ''}</div>
      ${addr ? `<div class="tline">📍 ${mapLink(addr)}</div>` : ''}${((q.project || {}).clientContact || {}).phone ? `<div class="tline">📞 ${esc(q.project.clientContact.name || 'Client')} · <a href="tel:${esc(String(q.project.clientContact.phone).replace(/[^\d+]/g, ''))}">${esc(q.project.clientContact.phone)}</a></div>` : ''}${cw.length ? `<div class="tline">👷 With ${esc(cw.join(', '))}</div>` : ''}
      ${(q.schedule || {}).notes && q.schedule.notes.length ? `<div class="tline" style="font-size:13px;color:var(--muted)">${esc(q.schedule.notes.join(' · ')).slice(0, 220)}</div>` : ''}
      ${chip(q)}<a class="tbtn" href="?quote=${encodeURIComponent(q._id)}">${btn}</a></div>`; };
  const row = (q, d) => `<a class="trow" href="?quote=${encodeURIComponent(q._id)}"><div><div class="n">${esc(label(q))}</div><div class="qmeta">${esc(dayWin(q, d))}${(q.schedule || {}).address ? ' · ' + esc(q.schedule.address) : ''}</div></div><div class="d">${esc(fmtDate(d))} ›</div></a>`;
  const nextD = q => ds(q).find(d => d > t);
  if (window.ASBC_TOOLS && window.asbcDashboard) setTimeout(() => asbcDashboard({ access: ME.access, email: ME.email, name: ME.name, users: USERS }).then(d => { const b = document.getElementById('techAlerts'); if (b) b.innerHTML = asbcAlertStrip(d.alerts); }).catch(() => {}), 0);  // v11.0.0
  app().innerHTML = `<div id="techAlerts"></div><div class="hello">Hi <b>${esc(first || 'there')}</b> · ${esc(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' }))}</div>
    <div class="tsec">Today</div>${todayJobs.length ? todayJobs.map(q => big(q, 'today')).join('') : '<div class="trow" style="color:var(--muted)">No jobs scheduled for you today.</div>'}
    ${late.length ? `<div class="tsec warn">Needs your report (${late.length})</div>${late.map(q => big(q, 'late')).join('')}` : ''}
    ${soon.length ? `<div class="tsec dim">Coming up</div>${soon.map(q => row(q, nextD(q))).join('')}` : ''}
    ${done.length ? `<details style="margin-top:16px"><summary>Submitted reports (${done.length})</summary>${done.map(q => row(q, ds(q).pop() || '')).join('')}</details>` : ''}
    ${archived.length ? `<p class="qmeta" style="margin-top:10px"><a href="./jobs.html?archive=1" style="color:#1F6FD1">Older reports (${archived.length}) ›</a></p>` : ''}
    <div class="tsec dim" style="margin-top:26px">Not on the schedule?</div>
    <button class="tbtn ghost" onclick="showNew()">🚨 Unscheduled / emergency visit</button>
    <div class="qmeta" style="margin-top:6px">Only for visits that are not on the D-Tools calendar. Scheduled jobs appear here automatically.</div>`;
}
// ---------- v10.9.0 admin: Needs attention (in the app, nothing goes to To Do) ----------
function attentionCard(jobs) {
  const t = TODAY(), soon = new Date(Date.now() + 14 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }), items = [];
  const open = q => `<a class="qbtn" style="display:inline-flex;align-items:center;text-decoration:none" href="?quote=${encodeURIComponent(q._id)}">Open</a>`;
  jobs.forEach(q => { const sc = q.schedule || {}, ds = (sc.dates || []).slice().sort(), nm = esc(label(q));
    if (q.quoteSuggest && q.quoteSuggest.id && !(q.items || []).length) items.push(`<div class="row"><div><b>${nm}</b><div class="qmeta">Possible labor quote: “${esc(q.quoteSuggest.label || q.quoteSuggest.id)}” (same client name). Is it this job?</div></div><div style="display:flex;gap:6px"><button class="qbtn gold" onclick="attachQuote('${q._id}')">Attach</button><button class="qbtn" onclick="noSuggest('${q._id}')">Not it</button></div></div>`);
    if (sc.dtoolsMissing && !q.missingAck) items.push(`<div class="row"><div><b>${nm}</b><div class="qmeta">Removed from the D-Tools calendar (${esc(ds.map(fmtDate).join(', '))}). ${q.job ? 'Hours were already logged, so the job was kept.' : 'Hidden from the techs.'}</div></div><div style="display:flex;gap:6px">${open(q)}<button class="qbtn" onclick="ackMissing('${q._id}')">OK</button></div></div>`);
    if ((q.unscheduled || q.counted === 'no-quote') && !sc.fromDtools && !q.unschedAck && ['submitted', 'closed', 'scheduled'].includes(q.status)) items.push(`<div class="row"><div><b>${nm}</b><div class="qmeta">Unscheduled visit by ${esc(nameOf((q.job || {}).submittedBy || (sc.techs || [])[0] || ''))}${ds.length ? ' on ' + esc(fmtDate(ds[0])) : ''}: add it to the D-Tools calendar so the records match.</div></div><div style="display:flex;gap:6px">${open(q)}<button class="qbtn" onclick="ackUnsched('${q._id}')">It’s on D-Tools</button></div></div>`);
    if (q.status === 'scheduled' && ds.length && ds[0] <= soon && !(q.quoteSuggest && q.quoteSuggest.id) && quotedHrs(q).est === 0 && !q.noLaborAck) items.push(`<div class="row"><div><b>${nm}</b><div class="qmeta">No labor quoted (no calculator quote, no INSTALL_SERVICE / SRV-PROG / flat-rate labor in D-Tools) · ${esc(fmtDate(ds.find(d => d >= t) || ds[ds.length - 1]))} · Rep: ${esc((q.project || {}).salesManagerName || '—')}</div></div><div style="display:flex;gap:6px">${open(q)}<button class="qbtn" onclick="ackNoLabor('${q._id}')">OK</button></div></div>`);
  });
  return items.length ? `<div class="sect" style="color:#8A5A00">Needs attention (${items.length})</div><div class="attn">${items.join('')}</div>` : '';
}
async function flagSet(id, data) { await save(db.collection('quotes').doc(id), data); showList(); }
const noSuggest = id => db.collection('quotes').doc(id).get().then(s => flagSet(id, { quoteSuggest: null, quoteSuggestNo: ((s.data() || {}).quoteSuggest || {}).id || '' }));
const ackMissing = id => flagSet(id, { missingAck: true });
const ackUnsched = id => flagSet(id, { unschedAck: true });
const ackNoLabor = id => flagSet(id, { noLaborAck: true });
async function attachQuote(jobId, pick, opts) {  // v10.9.0 confirm a client-name match: the labor quote becomes (or joins) this scheduled job
  // v11.12.0 pick = any quote chosen from "Link a quote" on the job (else the suggested one); returns the id that now carries the job
  const jref = db.collection('quotes').doc(jobId), j = (await jref.get()).data() || {}, sid = pick || (j.quoteSuggest || {}).id; if (!sid) return;
  const qref = db.collection('quotes').doc(sid), q = (await qref.get()).data(); if (!q) return alert('That quote no longer exists.');
  const old = (j.laborQuote || {}).id && j.laborQuote.id !== sid ? j.laborQuote : null;
  if (!confirm((old ? 'Replace the linked quote "' + (old.label || old.id) + '" with "' : 'Attach the labor quote "') + (q.label || sid) + '" to the job "' + label(j) + '"?')) return;
  if (old) await db.collection('quotes').doc(old.id).set({ mergedInto: null }, { merge: true });  // the old quote goes back to the Quote Log only
  const pj = j.project || {}, link = Object.fromEntries(['dtoolsOpportunityId', 'dtoolsOppNumber', 'dtoolsProjectName', 'dtoolsClientName', 'proposalPdf', 'files'].filter(k => pj[k] && (!Array.isArray(pj[k]) || pj[k].length)).map(k => [k, pj[k]]));
  if (!j.job && !j.signoff) {  // nothing reported yet: the quote carries the job from now on
    await qref.set({ status: 'scheduled', schedule: j.schedule || {}, project: Object.assign({}, q.project || {}, link), dtoolsLabor: j.dtoolsLabor || null, parts: j.parts || q.parts || null, jobHidden: false, jobDeleted: false, mergedInto: null }, { merge: true });
    await jref.delete();
  } else {
    await jref.set({ items: q.items || [], options: q.options || {}, laborQuote: { id: sid, label: q.label || '', at: new Date().toISOString() }, quoteSuggest: null }, { merge: true });
    await qref.set({ jobHidden: true, mergedInto: jobId, project: Object.assign({}, q.project || {}, link) }, { merge: true });
  }
  if (opts && opts.open) return location.replace('?quote=' + encodeURIComponent(!j.job && !j.signoff ? sid : jobId));
  showList();
}
// v11.12.0 admin "Link a quote" on a job with no calculator quote (or "Change linked quote"): pick any saved calculator quote.
// Quotes that already carry their own job report are left out, so two reported jobs are never merged.
async function linkQuotePicker() {
  const jobId = qid, j = Q || {}, pj = j.project || {};
  document.querySelectorAll('.lqbg').forEach(x => x.remove());
  const bg = document.createElement('div'); bg.className = 'lqbg no-print';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:6vh 12px;overflow:auto';
  bg.innerHTML = `<div class="card" style="width:min(640px,100%);margin:0"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>Link a calculator quote to “${esc(label(j))}”</b><button class="qbtn" data-x>✕</button></div>
    <input id="lqQ" type="search" placeholder="Search quote name, client or rep" style="margin:10px 0"><div id="lqL" class="qmeta">Loading quotes…</div></div>`;
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-x]')) bg.remove(); });
  document.body.appendChild(bg);
  const all = (await db.collection('quotes').get()).docs.map(d => ({ _id: d.id, ...d.data() }))
    .filter(q => q._id !== jobId && !q.isTemplate && !q.jobDeleted && (q.items || []).length && !q.job && !q.signoff && (!q.mergedInto || q.mergedInto === jobId));
  const f = s => String(s || '').toLowerCase(), names = [pj.dtoolsClientName, pj.customerName, pj.dtoolsProjectName, j.label].map(f).filter(Boolean);
  const client = q => (q.project || {}).dtoolsClientName || (q.project || {}).customerName || '';
  const near = q => names.some(n => [q.label, client(q), (q.project || {}).dtoolsProjectName].map(f).some(v => v && (v.includes(n) || n.includes(v))));
  const when = q => { const v = q.updatedAt || q.savedAt; return v && v.toMillis ? v.toMillis() : (Date.parse(v || '') || 0); };
  all.sort((a, b) => (near(b) - near(a)) || (((b.project || {}).salesManagerName === pj.salesManagerName) - ((a.project || {}).salesManagerName === pj.salesManagerName)) || when(b) - when(a));
  const draw = () => { const t = f(document.getElementById('lqQ').value);
    const list = all.filter(q => !t || [q.label, client(q), (q.project || {}).salesManagerName, (q.project || {}).dtoolsProjectName].map(f).some(v => v.includes(t))).slice(0, 40);
    document.getElementById('lqL').innerHTML = list.length ? list.map(q => `<div class="row" style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--line)">
      <div><b>${esc(q.label || q._id)}</b>${near(q) ? ' <span class="qmeta" style="color:#0E7A4D">same client</span>' : ''}<div class="qmeta">${esc([client(q), 'Rep: ' + ((q.project || {}).salesManagerName || '—'), hrs(quotedHrs(q).est) + ' hrs', when(q) ? new Date(when(q)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''].filter(Boolean).join(' · '))}${((q.schedule || {}).dates || []).length ? ' · has its own install dates (this job\'s dates are used)' : ''}</div></div>
      <button class="qbtn gold" data-pick="${esc(q._id)}">Link</button></div>`).join('') : '<div class="qmeta">No matching calculator quotes. Quotes that already have their own job report are not listed.</div>'; };
  document.getElementById('lqQ').addEventListener('input', draw); draw();
  document.getElementById('lqL').addEventListener('click', async e => { const b = e.target.closest('[data-pick]'); if (!b) return; b.disabled = true; await attachQuote(jobId, b.dataset.pick, { open: true }); b.disabled = false; });
}
// v8.20.2: admin Delete on every job in the lists. A job report made without a quote (or a return visit) is deleted for good;
// a job built on a labor quote is taken off the Jobs page only, so the quote, its actuals and the client sign-off are kept
// (scheduling it again from the Quote Log brings it back).
async function deleteJob(id) {
  const ref = db.collection('quotes').doc(id); const s = await ref.get(); if (!s.exists) return showList();
  const q = s.data(), name = label(q);
  if (q.noQuote) {
    if (!confirm('Delete the job "' + name + '"?\n\nThis job has no labor quote, so its report, time log and sign-off are deleted permanently.')) return;
    await ref.delete();
  } else {
    if (!confirm('Delete the job "' + name + '" from the Jobs page?\n\nThe labor quote stays in the Quote Log with any hours and sign-off already recorded. Scheduling it again from the Quote Log brings the job back.')) return;
    await save(ref, { jobDeleted: true, jobDeletedAt: new Date().toISOString(), jobDeletedBy: ME.email });
  }
  showList();
}
// v8.20.1: admin can take an undated job off the Jobs page (reversible: scheduling it again from the Quote Log brings it back)
async function hideJob(id) {
  if (!confirm('Remove this job from the Jobs page? The quote stays in the Quote Log, and scheduling it again brings it back.')) return;
  await save(db.collection('quotes').doc(id), { jobHidden: true, jobHiddenAt: new Date().toISOString(), jobHiddenBy: ME.email });
  showList();
}

