
// v8.14.0 Jobs: Won -> Scheduled (admin assigns dates + techs) -> techs log actual hours per item,
// a daily time log and a recap -> Submitted -> admin approves (Closed; feeds Labor Calibration) or sends back.
firebase.initializeApp({ apiKey: "AIzaSyCSf560VkBf2esIH5rC-_Vcx349o7iIC-0", authDomain: "asbc-calculator.firebaseapp.com", projectId: "asbc-calculator" });
const db = firebase.firestore();
// v8.18.0: works offline on site. Data the tech has opened is kept on the device; saves made with no signal
// are queued and sync automatically when the connection returns.
try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}
async function save(ref, data) {
  const p = ref.set(data, { merge: true });
  if (!navigator.onLine) { flash('No signal: saved on this device. It will sync automatically when you are back online.'); p.catch(() => {}); return; }
  await p;
}
function flash(t) { let b = document.getElementById('flash'); if (!b) { b = document.createElement('div'); b.id = 'flash'; b.className = 'no-print'; b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;background:#FFFFFF;border:1px solid #1F6FD1;color:#1F2937;padding:10px 12px;border-radius:10px;font-size:13px;z-index:99'; document.body.appendChild(b); } b.textContent = t; b.style.display = ''; clearTimeout(b._t); b._t = setTimeout(() => b.style.display = 'none', 5000); }
window.addEventListener('offline', () => flash('You are offline. Keep working; your entries will sync later.'));
window.addEventListener('online', () => flash('Back online: syncing your saved entries.'));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hrs = v => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
// v8.19.0: the installer's job status, picked on the recap
const JOB_STATUSES = ['In Progress', 'Complete', 'Sales Follow up', 'PM Follow up', 'Cancelled'];
const jsColor = s => ({ 'Complete': 'st-closed', 'In Progress': 'st-scheduled', 'Sales Follow up': 'st-submitted', 'PM Follow up': 'st-submitted', 'Cancelled': '' })[s] || '';
const jsBadge = s => s ? `<span class="st ${jsColor(s)}">${esc(String(s).toUpperCase())}</span>` : '';
const jsSelect = cur => `<div class="qmeta" style="margin-top:4px">Job status (required)</div><select id="jobStatus"><option value="">Select status…</option>${JOB_STATUSES.map(x => `<option ${x === cur ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
// v8.20.0: customer sign-off (signoff.html). Required to submit a job as Complete, unless the tech records
// that the client was not present / declined, with a reason.
const SO_Q = [['look', 'Satisfied with the look and feel of the install'], ['av', 'Satisfied with sound and video quality'], ['confident', 'Confident operating the system'], ['issues', 'Any issues with the install']];
const SKIP = { 'not-present': 'Client not present', 'declined': 'Client declined to sign' };
const isSigned = q => !!(q && q.signoff && q.signoff.status === 'signed');
function signoffBox(q) {
  const so = q && q.signoff, sk = ((q && q.job) || {}).signoffSkip || {}, signed = isSigned(q);
  return `<div id="soCard" class="no-print" style="border-top:1px solid var(--line);margin-top:12px;padding-top:10px"><div class="sect" style="margin-top:0">Customer sign-off ${signed ? '<span class="st st-closed">SIGNED</span>' : '<span style="text-transform:none;letter-spacing:0;font-weight:400">(required to mark Complete)</span>'}</div>
    ${signed ? `<div class="qmeta">Signed by <b>${esc(so.name)}</b> · ${esc(new Date(so.signedAt).toLocaleString('en-US'))}${so.concerns ? ' · <span style="color:#B42318">client noted concerns</span>' : ''}</div>` : '<div class="qmeta">Fill in the recap first, then tap below and hand the device to the client.</div>'}
    <div class="qactions"><button type="button" class="qbtn ${signed ? '' : 'gold'}" id="soOpen">${signed ? 'Redo customer sign-off' : 'Open customer sign-off'}</button></div>
    ${signed ? '' : `<div class="qmeta" style="margin-top:8px">Can't get a signature?</div><div class="row2"><select id="soSkip"><option value="">—</option>${Object.entries(SKIP).map(([k, v]) => `<option value="${k}" ${sk.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select><input id="soReason" placeholder="Reason" value="${esc(sk.reason || '')}"></div>`}</div>`;
}
function signoffSkip() { const s = document.getElementById('soSkip'); if (!s || !s.value) return null; return { status: s.value, reason: (document.getElementById('soReason').value || '').trim(), at: new Date().toISOString(), by: ME.email }; }
function signoffProblem(q, jobStatus, skip) {
  if (jobStatus !== 'Complete' || isSigned(q)) return '';
  if (skip && skip.reason) return '';
  return skip ? 'Add a reason why the client could not sign.' : 'Complete jobs need the customer sign-off. Tap "Open customer sign-off", or pick "Client not present / declined" and give a reason.';
}
function signoffReport(q) {
  const so = q.signoff, sk = (q.job || {}).signoffSkip;
  if (isSigned(q)) {
    const a = so.answers || {}, good = (k, v) => k === 'issues' ? v === 'no' : v === 'yes';
    const sig = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(so.signature || '') ? `<img src="${so.signature}" alt="Client signature" style="display:block;max-width:320px;width:100%;background:#fff;border:1px solid #ccc;border-radius:8px;margin-top:8px">` : '';
    return `<div class="card" style="${so.concerns ? 'border-color:#F1A9A0' : ''}"><div class="sect" style="margin-top:0">Customer sign-off ${so.concerns ? '<span class="st" style="color:#B42318;border-color:#F1A9A0">CLIENT CONCERNS</span>' : '<span class="st st-closed">SIGNED</span>'}</div>
      <table>${SO_Q.map(([k, t]) => `<tr><td>${t}</td><td class="right ${a[k] ? (good(k, a[k]) ? 'pos' : 'neg') : ''}"><b>${a[k] === 'yes' ? 'Yes' : a[k] === 'no' ? 'No' : '—'}</b></td></tr>`).join('')}</table>
      ${so.issuesText ? `<div class="qmeta" style="margin-top:8px">Issue described by the client</div><div style="white-space:pre-wrap">${esc(so.issuesText)}</div>` : ''}
      ${so.comments ? `<div class="qmeta" style="margin-top:8px">Client comments</div><div style="white-space:pre-wrap">${esc(so.comments)}</div>` : ''}
      <div style="margin-top:10px">✓ The client acknowledged that the installation meets their expectations.</div>${sig}
      <div class="qmeta" style="margin-top:4px">Signed by <b>${esc(so.name)}</b> · ${esc(new Date(so.signedAt).toLocaleString('en-US'))} · collected by ${esc(nameOf(so.collectedBy))}</div></div>`;
  }
  if (sk && sk.status) return `<div class="card"><div class="sect" style="margin-top:0">Customer sign-off</div><div style="color:#A1440B">${esc(SKIP[sk.status] || sk.status)}</div>${sk.reason ? `<div class="qmeta">${esc(sk.reason)}</div>` : ''}</div>`;
  if ((q.job || {}).jobStatus === 'Complete') return '<div class="card"><div class="sect" style="margin-top:0">Customer sign-off</div><div class="qmeta">Not collected.</div></div>';
  return '';
}
