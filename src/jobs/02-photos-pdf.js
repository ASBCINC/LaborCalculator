// v10.6.0: install photos are taken IN the app (phone camera), shrunk to ~1600px JPEG and kept in Cloudflare Workers KV
// through the relay (/photo). The job keeps the list in job.photos.list [{k, at, by}]; each photo saves the moment it is taken.
// Older jobs that used the Microsoft Forms link keep {uploaded: true} with no list (their photos are in Anthony's OneDrive).
const PHOTO_URL = 'https://yellow-cloud-830a.a-ward-612.workers.dev/photo';
let PHOTOS = [], PHOTO_JOB = '';
const PHOTO_LOCAL = {};  // v10.7.0 photos taken this visit show from the phone's own copy (a just-saved photo can take a moment to be readable)
const photoSrc = k => PHOTO_LOCAL[k] || (PHOTO_URL + '/' + k);
const photoLive = p => !p.at || Date.now() - Date.parse(p.at) < 548 * 864e5;  // photos expire after 18 months in Cloudflare
const photoThumbs = (list, del) => list.filter(photoLive).map(p => `<a href="${PHOTO_URL + '/' + p.k}" target="_blank" rel="noopener" style="position:relative;display:inline-block"><img src="${photoSrc(p.k)}" loading="lazy" alt="Install photo" style="width:96px;height:96px;object-fit:cover;border-radius:6px;border:1px solid var(--line)">${del ? `<button type="button" class="qbtn" data-delph="${esc(p.k)}" title="Remove photo" style="position:absolute;top:3px;right:3px;height:22px;padding:0 7px">✕</button>` : ''}</a>`).join('');
function photoBox(q) {
  const ph = ((q && q.job) || {}).photos || {};
  PHOTOS = (ph.list || []).slice();
  PHOTO_JOB = (typeof Q !== 'undefined' && q && q === Q && REF) ? REF.id : ((q && q.id) || '');
  return `<div class="no-print" style="border-top:1px solid var(--line);margin-top:12px;padding-top:10px"><div class="sect" style="margin-top:0">Install photos <span id="phCount" class="qmeta">${PHOTOS.length ? '(' + PHOTOS.length + ')' : ''}</span></div>
    <div class="qmeta">Tap Take photo to open the camera, or Upload photos to pick several from the phone. Each photo saves right away; tap ✕ to remove one. Photos are kept for 18 months.</div>
    ${ph.uploaded && !ph.list ? '<div class="qmeta">Earlier photos for this job were sent with the Microsoft Forms link (saved in Anthony\'s OneDrive).</div>' : ''}
    <div id="phGrid" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${photoThumbs(PHOTOS, true)}</div>
    <div class="qactions"><label class="qbtn gold" style="display:inline-flex;align-items:center;cursor:pointer">Take photo<input type="file" class="phIn" id="phCam" accept="image/*" capture="environment" hidden></label><label class="qbtn" style="display:inline-flex;align-items:center;cursor:pointer">Upload photos<input type="file" class="phIn" id="phLib" accept="image/*" multiple hidden></label></div>
    <div id="phMsg" class="qmeta"></div></div>`;
}
function photosObj() {
  const was = ((typeof Q !== 'undefined' && Q && Q.job) || {}).photos || {};
  if (!PHOTOS.length) return was.uploaded && !was.list ? was : { uploaded: false, list: [] };
  const last = PHOTOS[PHOTOS.length - 1]; return { uploaded: true, list: PHOTOS.slice(), at: last.at, by: last.by };
}
function photosVal() { return document.getElementById('phGrid') ? photosObj() : undefined; }
function drawPhotos() { const g = document.getElementById('phGrid'); if (g) g.innerHTML = photoThumbs(PHOTOS, true); const c = document.getElementById('phCount'); if (c) c.textContent = PHOTOS.length ? '(' + PHOTOS.length + ')' : ''; }
async function photoCall(body) {
  const token = await firebase.auth().currentUser.getIdToken();
  const r = await fetch(PHOTO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
  let o = {}; try { o = await r.json(); } catch (e) {} if (!r.ok || !o.ok) throw new Error(o.error || ('error ' + r.status)); return o;
}
async function savePhotos() {  // an existing job saves its photo list right away, so nothing is lost if the tech leaves the page
  if (typeof Q === 'undefined' || !Q || !REF || REF.id !== PHOTO_JOB) return;
  const photos = photosObj(); await REF.set({ job: { photos } }, { merge: true }); Q.job = Object.assign({}, Q.job || {}, { photos });
}
document.addEventListener('change', async e => {
  if (!e.target || !e.target.classList || !e.target.classList.contains('phIn')) return;
  const files = [...(e.target.files || [])].filter(f => /^image\//.test(f.type) || !f.type).slice(0, 30); e.target.value = ''; if (!files.length) return;
  const msg = t => { const m = document.getElementById('phMsg'); if (m) m.textContent = t; };
  if (!PHOTO_JOB) return msg('Open the job first.');
  let ok = 0, bad = 0;
  for (const [i, f] of files.entries()) {  // v10.6.0 one at a time so a phone on a weak signal isn't flooded
    try { msg('Saving photo ' + (i + 1) + ' of ' + files.length + '…'); const image = await asbcRamp.shrink(f);
      const o = await photoCall({ action: 'put', quote: PHOTO_JOB, image });
      PHOTO_LOCAL[o.k] = image; PHOTOS.push({ k: o.k, at: new Date().toISOString(), by: ME.email }); drawPhotos(); ok++;
    } catch (err) { bad++; console.warn('photo', err); }
  }
  try { if (ok) await savePhotos(); } catch (err) { console.warn('photo list', err); }
  msg((ok ? ok + ' photo' + (ok > 1 ? 's' : '') + ' saved.' : '') + (bad ? ' ' + bad + ' not saved; try those again.' : ''));
});
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('[data-delph]'); if (!b) return; e.preventDefault(); e.stopPropagation();
  if (!confirm('Remove this photo?')) return; const k = b.dataset.delph, msg = t => { const m = document.getElementById('phMsg'); if (m) m.textContent = t; };
  try { await photoCall({ action: 'del', k }); PHOTOS = PHOTOS.filter(p => p.k !== k); drawPhotos(); await savePhotos(); msg('Photo removed.'); }
  catch (err) { msg('Could not remove: ' + err.message); }
}, true);
const photoReport = q => { const ph = (q.job || {}).photos; if (!ph || !ph.uploaded) return '';
  if ((ph.list || []).length) { const live = ph.list.filter(photoLive).length; return `<div class="card"><div class="sect" style="margin-top:0">Install photos (${live})</div>${live < ph.list.length ? `<div class="qmeta">${ph.list.length - live} photo(s) older than 18 months have expired.</div>` : ''}<div style="display:flex;flex-wrap:wrap;gap:6px">${photoThumbs(ph.list, false)}</div><div class="qmeta" style="margin-top:6px">Tap a photo to open it full size. Photos are kept for 18 months after they're taken; save any you need longer.</div></div>`; }
  return `<div class="card"><div class="sect" style="margin-top:0">Install photos</div><div>Uploaded by ${esc(nameOf(ph.by))} · ${esc(new Date(ph.at).toLocaleString('en-US'))}</div><div class="qmeta">Saved in Anthony's OneDrive (ASBC Job Photos form), under job: ${esc(label(q))}</div></div>`; };
// v11.4.0 IP / VLAN plan saved on the job by tool-ip.html (quote.ipPlan); shown on the recap and in the PDF.
const ipDevs = q => (((q && q.ipPlan) || {}).devices || []).filter(d => d && (d.name || d.ip));
const ipHref = id => './tool-ip.html?quote=' + encodeURIComponent(id || '');
const ipPlanCard = q => { const d = ipDevs(q), p = q.ipPlan || {}, id = (typeof REF !== 'undefined' && REF) ? REF.id : ''; if (!d.length) return '';
  const vn = v => { const x = (p.vlans || []).find(y => y.vid === v); return x ? v + (x.name ? ' ' + x.name : '') : v; };
  return `<div class="card"><div class="sect" style="margin-top:0">Network / IP plan (${d.length} device${d.length > 1 ? 's' : ''})</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><tr>${['Device', 'Room', 'IP', 'VLAN', 'MAC'].map(h => `<th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--line)">${h}</th>`).join('')}</tr>
    ${d.map(x => `<tr>${[x.name, x.room, x.ip, vn(x.vlan), x.mac].map(c => `<td style="padding:4px 6px;border-bottom:1px solid var(--line)">${esc(c || '')}</td>`).join('')}</tr>`).join('')}</table></div>
    <div class="qmeta" style="margin-top:6px">VLANs: ${(p.vlans || []).map(v => esc(v.vid + (v.name ? ' ' + v.name : '') + (v.subnet ? ' (' + v.subnet + ')' : ''))).join(' · ') || '—'}${p.by ? ' · saved by ' + esc(nameOf(p.by)) : ''}</div>
    <div class="qactions no-print"><a class="qbtn" style="display:inline-flex;align-items:center;text-decoration:none" href="${ipHref(id)}">Open IP plan</a></div></div>`; };
// v10.6.0 Export PDF: the job report and its photos as one PDF to attach to the D-Tools project for records.
// Built in the browser with jsPDF (loaded only when the button is tapped); photos come from the relay.
function loadJsPdf() { return window.jspdf ? Promise.resolve() : new Promise((res, rej) => { const t = document.createElement('script'); t.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; t.onload = res; t.onerror = () => rej(new Error('could not load the PDF tool')); document.head.appendChild(t); }); }
async function imgData(url) { const r = await fetch(url); if (!r.ok) throw new Error('photo ' + r.status); const b = await r.blob(); return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); }
async function jobPdf(btn) {
  if (!Q) return; const j = Q.job || {}, p = Q.project || {}, was = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Building PDF…'; }
  try {
    await loadJsPdf();
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' }), W = 612, H = 792, M = 40; let y = M;
    const need = h => { if (y + h > H - M) { doc.addPage(); y = M; } };
    const text = (t, o = {}) => { const sz = o.size || 10; doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(sz); doc.setTextColor(o.color || '#111111');
      doc.splitTextToSize(String(t == null ? '' : t), W - 2 * M - (o.indent || 0)).forEach(l => { need(sz * 1.4); doc.text(l, M + (o.indent || 0), y + sz); y += sz * 1.4; }); };
    const head = t => { y += 10; need(30); doc.setDrawColor('#C7A66A'); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 6; text(t, { bold: true, size: 12 }); y += 2; };
    const when = v => { try { return v ? new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; } catch (e) { return ''; } };
    text('ASBC Job Report', { bold: true, size: 18 }); text(label(Q), { bold: true, size: 13 }); y += 4;
    [['Client', p.dtoolsClientName || p.customerName], ['D-Tools #', p.dtoolsOppNumber], ['Sales rep', p.salesManagerName], ['Job status', j.jobStatus],
     ['Techs', ((Q.schedule || {}).techs || []).map(nameOf).join(', ')], ['Submitted', j.submittedBy ? nameOf(j.submittedBy) + ' · ' + when(j.submittedAt) : ''],
     ['Exported', when(new Date().toISOString()) + ' by ' + ((ME && ME.name) || '')]].filter(([, v]) => v).forEach(([k, v]) => text(k + ': ' + v));
    const rows = crewRows(j.log || []);
    if (rows.length) { head('Time on site');
      rows.forEach(r => { const t = rowTechs(r); text(fmtDate(r.date) + ': ' + hrs(r.hours) + ' hrs on site × ' + Math.max(1, t.length) + ' tech' + (t.length > 1 ? 's' : '') + ' = ' + hrs(rowLabor(r)) + ' labor hrs' + (t.length ? ' (' + t.map(nameOf).join(', ') + ')' : '')); });
      text('Total labor: ' + hrs(rows.reduce((a, r) => a + rowLabor(r), 0)) + ' hrs', { bold: true }); }
    const rc = j.recap || {};
    if (Object.values(rc).some(v => String(v || '').trim())) { head('Recap');
      [['work', 'Work completed'], ['issues', 'Problems / what took longer'], ['followups', 'Open items / return visit'], ['client', 'Client feedback']].forEach(([k, t]) => { if (String(rc[k] || '').trim()) { text(t, { bold: true }); text(rc[k], { indent: 10 }); y += 3; } }); }
    const P = prodList(Q), inst = j.installedItems || [];
    if (P.length) { head('Products'); const done = P.filter(x => inst.includes(x.name)), left = P.filter(x => !inst.includes(x.name));
      if (done.length) { text('Installed (' + done.length + ')', { bold: true }); done.forEach(x => text('- ' + x.name + (Number(x.qty) > 1 ? ' x' + x.qty : ''), { indent: 10 })); }
      if (left.length) { text('Not marked installed (' + left.length + ')', { bold: true, color: '#9a4b00' }); left.forEach(x => text('- ' + x.name + (Number(x.qty) > 1 ? ' x' + x.qty : ''), { indent: 10 })); } }
    const ex = (j.extras || []).filter(x => x && (x.desc || x.hours));
    if (ex.length) { head('Unplanned / extra work (possible change order)'); ex.forEach(x => text('- ' + (x.desc || '') + (x.hours ? ' (' + hrs(x.hours) + ' hrs)' : '') + (x.by ? ', ' + nameOf(x.by) : ''), { indent: 10 })); }
    const so = Q.signoff || {}, sk = j.signoffSkip || {};
    if (isSigned(Q)) { head('Customer sign-off'); const a = so.answers || {};
      SO_Q.forEach(([k, t]) => text(t + ': ' + (a[k] === 'yes' ? 'Yes' : a[k] === 'no' ? 'No' : '-')));
      if (so.issuesText) text('Issue described by the client: ' + so.issuesText); if (so.comments) text('Client comments: ' + so.comments);
      text('Signed by ' + (so.name || '') + ' · ' + when(so.signedAt) + (so.collectedBy ? ' · collected by ' + nameOf(so.collectedBy) : ''));
      if (/^data:image\/png;base64,/.test(so.signature || '')) { try { need(90); doc.addImage(so.signature, 'PNG', M, y + 4, 220, 80); y += 90; } catch (e) {} } }
    else if (sk.status) { head('Customer sign-off'); text((SKIP[sk.status] || sk.status) + (sk.reason ? ': ' + sk.reason : '')); }
    const ipd = ipDevs(Q);
    if (ipd.length) { head('Network / IP plan (' + ipd.length + ' devices)'); ((Q.ipPlan || {}).vlans || []).forEach(v => text('VLAN ' + v.vid + (v.name ? ' ' + v.name : '') + (v.subnet ? ': ' + v.subnet : '') + (v.gw ? ', gateway ' + v.gw : '') + (v.dhcp ? ', DHCP ' + v.dhcp : ''), { size: 9 }));
      y += 3; ipd.forEach(d => text([d.name, d.room, d.ip, d.vlan ? 'VLAN ' + d.vlan : '', d.mac, d.model].filter(Boolean).join(' · '), { size: 9, indent: 10 })); }
    const pics = (((j.photos || {}).list) || []).filter(photoLive);
    if (pics.length) { need(290); head('Install photos (' + pics.length + ')'); const cw = (W - 2 * M - 12) / 2, maxH = 230; let col = 0, rowH = 0, bad = 0;
      for (const [i, ph] of pics.entries()) {
        if (btn) btn.textContent = 'Adding photo ' + (i + 1) + ' of ' + pics.length + '…';
        let d; try { d = await imgData(photoSrc(ph.k)); } catch (e) { bad++; continue; }
        const pr = doc.getImageProperties(d), k = Math.min(cw / pr.width, maxH / pr.height), w = pr.width * k, h = pr.height * k;
        if (col === 0) { need(maxH + 8); rowH = 0; }
        doc.addImage(d, 'JPEG', M + col * (cw + 12) + (cw - w) / 2, y, w, h); rowH = Math.max(rowH, h);
        if (col === 1) { y += rowH + 8; col = 0; } else col = 1;
      }
      if (col === 1) y += rowH + 8; if (bad) text(bad + ' photo(s) could not be added.', { color: '#9a4b00' }); }
    const pages = doc.getNumberOfPages(); for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor('#777777'); doc.text(label(Q) + ' · page ' + i + ' of ' + pages, M, H - 20); }
    doc.save(String(label(Q)).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) + ' - Job Report.pdf');
  } catch (e) { alert('Could not build the PDF: ' + e.message); }
  if (btn) { btn.disabled = false; btn.textContent = was || 'Export PDF'; }
}
