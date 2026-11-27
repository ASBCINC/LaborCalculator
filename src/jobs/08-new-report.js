// ---------- job report without a quote (v8.15.0) ----------
let NEW = { opps: [] };
function showNew() {
  NEW.id = 'job-' + Date.now();  // v8.24.1: id picked up front so the photo upload and the report share it
  document.getElementById('pageTitle').textContent = 'Unscheduled visit';
  const reps = Object.values(USERS).filter(u => (u.role || 'rep') === 'rep').map(u => u.name).sort();
  const cat = [...CATALOG.values()].filter(i => i.category !== 'Project Management').sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name));
  const today = new Date().toISOString().slice(0, 10);
  app().innerHTML = `<div class="card"><div style="font-weight:800;font-size:16px">🚨 Unscheduled / emergency visit</div><div class="qmeta" style="font-size:13px;margin-top:4px">Only for a visit that is <b>not on the D-Tools calendar</b> (scheduled jobs are already in your list). Pick the sales rep and the D-Tools project, then enter your time and what you did. Anthony will add it to the calendar.</div>
    <div class="row2" style="margin-top:8px"><select id="nRep"><option value="">Sales rep…</option>${reps.map(r => `<option>${esc(r)}</option>`).join('')}</select>
    <select id="nOpp" disabled><option value="">Opportunity…</option></select></div><div id="nOppMsg" class="qmeta"></div></div>
    <div class="card"><div class="sect" style="margin-top:0">Time on site</div><div class="qmeta">One row per day: total hours on site, and check every tech who was there.</div>
    ${logTable([{ date: today, hours: '', techs: ME.role === 'tech' ? [ME.email] : [] }])}
    <button type="button" class="qbtn" id="addLog" style="margin-top:6px">+ Add day</button></div>
    <div class="card"><div class="sect" style="margin-top:0">Job recap</div>${jsSelect(((typeof Q !== 'undefined' && Q && Q.job) || {}).jobStatus || '')}
    ${[['work', 'Work completed'], ['issues', 'Problems / what took longer'], ['followups', 'Open items / return visit needed'], ['client', 'Client feedback']].map(([k, t]) => `<div class="qmeta" style="margin-top:8px;display:flex;justify-content:space-between;align-items:center">${t}<button type="button" class="qbtn bl" data-k="${k}" style="height:24px;padding:0 8px">• Bullet</button></div><textarea class="rc" data-k="${k}" rows="3"></textarea>`).join('')}
    ${photoBox({ id: NEW.id })}
    ${signoffBox(null)}
    <div class="qactions"><button class="qbtn gold" id="nSubmit">Submit to PM</button></div><div id="nMsg" class="qmeta"></div></div>`;
  document.getElementById('addLog').onclick = () => { const tr = document.querySelector('#logT tr:last-child').cloneNode(true); tr.querySelector('.lh').value = ''; document.getElementById('logT').appendChild(tr); };
  document.getElementById('nRep').onchange = async (e) => {
    const sel = document.getElementById('nOpp'); sel.disabled = true; sel.innerHTML = '<option value="">Loading…</option>';
    const snap = await db.collection('opportunities').where('owner', '==', e.target.value).get();
    NEW.opps = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => !o.isArchived && !/lost/i.test(o.stage || '')).sort((a, b) => String(b.modifiedDate || '').localeCompare(String(a.modifiedDate || '')));
    sel.innerHTML = '<option value="">' + (NEW.opps.length ? 'Pick the opportunity…' : 'No opportunities for this rep') + '</option>' + NEW.opps.map(o => `<option value="${esc(o.id)}">${esc(o.name)}${o.clientName ? ' - ' + esc(o.clientName) : ''} (${esc(o.stage || '')})</option>`).join('');
    sel.disabled = false;
  };
  document.getElementById('nOpp').onchange = async (e) => {
    const box = document.getElementById('nOppMsg'); box.innerHTML = ''; NEW.open = null;
    if (!e.target.value) return;
    let ex = []; try { ex = (await db.collection('quotes').where('project.dtoolsOpportunityId', '==', e.target.value).get()).docs.map(d => ({ _id: d.id, ...d.data() })).filter(q => !q.isTemplate); } catch (err) { ex = []; }  // v8.29.0: installers only read their own jobs
    NEW.closed = ex.length && !ex.some(q => ['draft', 'won', 'scheduled', undefined].includes(q.status));
    NEW.open = ex.find(q => ['draft', 'won', 'scheduled', undefined].includes(q.status)) || null;
    if (NEW.open) box.innerHTML = `<span style="color:#8A5A00">This opportunity already has a labor quote (${esc(label(NEW.open))}).</span> <button class="qbtn gold" onclick="attachToQuote()">Log hours on that quote instead</button>`;
    if (NEW.open) box.innerHTML += '<div class="qmeta" style="margin-top:4px">Or keep going to submit a separate report.</div>';
    else if (NEW.closed) box.innerHTML = '<span class="qmeta">This project already has a job report. You can submit another one (e.g. another day or visit).</span>';
  };
  document.getElementById('nSubmit').onclick = () => submitNew(false); steppers();
  const pre = new URLSearchParams(location.search);
  if (pre.get('new') && pre.get('rep')) (async () => { const r = document.getElementById('nRep'); r.value = pre.get('rep'); if (r.value) { await r.onchange({ target: r }); const o = document.getElementById('nOpp'); o.value = pre.get('opp') || ''; if (o.value) o.onchange({ target: o }); } })();
  document.getElementById('soOpen').onclick = () => submitNew(true);
}
async function attachToQuote() {
  const q = NEW.open; if (!q) return;
  const sc = q.schedule || {};
  const techList = ME.role === 'tech' ? [ME.email] : [];
  await db.collection('quotes').doc(q._id).set({ status: 'scheduled', schedule: { dates: sc.dates || [], techs: [...new Set((sc.techs || []).concat(techList))] } }, { merge: true });
  location.href = '?quote=' + encodeURIComponent(q._id);
}
// v8.22.0: instant Teams message to Anthony and the sales rep when a job report is submitted (relay Worker; never blocks the submit).
const RECAP_URL = 'https://yellow-cloud-830a.a-ward-612.workers.dev/recap';
// v9.11.0 job status -> D-Tools project stage, applied by the D-Tools pull (7:37 / 12:37 / 5:37) in Anthony's D-Tools session
const STAGE_FOR = { 'Complete': 'Completed', 'In Progress': 'In Progress', 'Sales Follow up': 'Delayed', 'PM Follow up': 'Delayed', 'Cancelled': 'Delayed' };
async function queueStage(id) { try { const ref = db.collection('quotes').doc(id), s = await ref.get(), js = ((s.data() || {}).job || {}).jobStatus, want = STAGE_FOR[js];
  if (want) await ref.set({ dtoolsStage: { want, from: js, at: new Date().toISOString(), by: ME.email, done: false, tries: 0, result: '' } }, { merge: true }); } catch (e) { console.warn('stage queue', e); } }
async function notifyRecap(id, test) { if (!test) await queueStage(id); try { const token = await firebase.auth().currentUser.getIdToken(); const r = await fetch(RECAP_URL, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ quote: id, test: !!test }) }); return r.ok ? r.json() : { error: r.status }; } catch (e) { console.warn('recap notify', e); return { error: String(e) }; } }
async function submitNew(toSign) {  // toSign: save as an open job and go to the customer sign-off page
  const msg = t => document.getElementById('nMsg').textContent = t;
  const rep = document.getElementById('nRep').value, oppId = document.getElementById('nOpp').value;
  const opp = NEW.opps.find(o => o.id === oppId);
  const log = collectLog();
  const recap = {}; document.querySelectorAll('.rc').forEach(t => recap[t.dataset.k] = t.value.trim());
  const jobStatus = (document.getElementById('jobStatus') || {}).value || '';
  const skip = signoffSkip();
  const must = [];  // v8.24.0: one slide-up list of everything missing
  if (!rep) must.push(['Pick the sales rep', '#nRep']); else if (!oppId) must.push(['Pick the D-Tools opportunity', '#nOpp']);
  if (!log.length) must.push(['Enter time on site (date and hours)', '#logT']);
  if (!recap.work) must.push(['Fill in "Work completed"', '.rc[data-k="work"]']);
  if (!jobStatus && !toSign) must.push(['Pick a job status', '#jobStatus']);
  if (!toSign) { const soP = signoffProblem(null, jobStatus, skip); if (soP) must.push([soP.replace(/\.$/, ''), '#soCard']); }
  if (must.length) { markMissing(must); return sheet({ title: 'A few things are missing', sub: 'Tap an item to jump to it.', must }); }
  const items = [], lines = [];
  const job = { jobStatus, lines, log, siteHours: siteHours(log), laborHours: laborHours(log), totalHours: laborHours(log), recap, signoffSkip: skip, savedAt: new Date().toISOString(), savedBy: ME.email, submittedAt: new Date().toISOString(), submittedBy: ME.email, reviewNote: '', revision: 1, photos: photosVal() || null };
  if (toSign) { delete job.submittedAt; delete job.submittedBy; }
  const dates = [...new Set(log.map(r => r.date))].sort();
  const techList = [...new Set(log.flatMap(rowTechs).filter(Boolean).concat(ME.role === 'tech' ? [ME.email] : []))];
  const id = NEW.id || ('job-' + Date.now());
  await db.collection('quotes').doc(id).set({
    id, label: opp.name, noQuote: true, unscheduled: true, status: toSign ? 'scheduled' : 'closed', items,
    project: { customerName: opp.name, salesManagerName: rep, dtoolsOpportunityId: oppId, dtoolsOppNumber: opp.number || '', dtoolsClientName: opp.clientName || '' },
    schedule: { dates, techs: techList, updatedAt: new Date().toISOString(), updatedBy: ME.email },
    job, updatedAt: new Date(), isTemplate: false, counted: 'no-quote'
  });
  if (!toSign) await notifyRecap(id);
  location.href = (toSign ? './signoff.html' : '') + '?quote=' + encodeURIComponent(id);
}

