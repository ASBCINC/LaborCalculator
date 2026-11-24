// v9.6.0 Ramp: receipts from job reports go onto the matching Ramp card charge (photo + project title in the memo),
// and charges whose Ramp memo names a project show up as that job's expenses. Talks to Ramp only through the
// Cloudflare relay (/ramp), which holds the Ramp keys. No Claude usage: the sync runs when an admin opens the
// Calendar (the hourly D-Tools pull does that anyway), at most once an hour.
(function () {
  const RELAY = 'https://yellow-cloud-830a.a-ward-612.workers.dev/ramp';
  const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  async function call(action, body) {
    const u = firebase.auth().currentUser; if (!u) throw new Error('Sign in first');
    const r = await fetch(RELAY, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await u.getIdToken() }, body: JSON.stringify(Object.assign({ action }, body || {})) });
    const j = await r.json().catch(() => ({ error: 'relay ' + r.status }));
    if (!r.ok || j.error) throw new Error(j.error || ('relay ' + r.status));
    return j;
  }
  // Photo -> JPEG data URL (max 1600px) so it fits a Firestore doc while it waits for the charge. PDFs pass through.
  function shrink(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader(); fr.onerror = () => rej(new Error('Could not read the file'));
      fr.onload = () => {
        if (/pdf/i.test(file.type)) return res(fr.result);
        const img = new Image(); img.onerror = () => rej(new Error('Could not open the photo'));
        img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          let q = 0.72, out = c.toDataURL('image/jpeg', q); while (out.length > 850000 && q > 0.35) { q -= 0.12; out = c.toDataURL('image/jpeg', q); } res(out); };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  const near = (t, amount, date, email) => Math.abs(t.amount - amount) < 0.01 && (!email || t.email === email) && t.date >= addDays(date, -3) && t.date <= addDays(date, 5);
  const titleOf = q => ((q.project || {}).dtoolsProjectName || q.label || '').trim();
  const numOf = q => { const m = /(\d{5})\s*$/.exec(String((q.project || {}).dtoolsOppNumber || '')); return m ? m[1] : ''; };
  // Words in the D-Tools project name / client name that identify a job in a memo ("Janet Petros install", "MS-Aztech-01654").
  const GENERIC = /^(beolab|beosound|beovision|install|installation|stereo|system|speaker|speakers|court|drive|street|place|trail|kings|mission|phase|rev\d*|v\d+)$/i;
  const keysOf = q => [...new Set((((q.project || {}).dtoolsProjectName || q.label || '') + ' ' + String((q.project || {}).dtoolsClientName || '').trim().split(/\s+/).pop()).split(/[^A-Za-z0-9]+/)  // v10.5.0 client LAST name only (a first name like Janet matched another client)
    .filter(w => w.length >= 5 && !/^\d+$/.test(w) && !GENERIC.test(w)).map(w => w.toLowerCase()))];
  const exp = (t, extra) => Object.assign({ id: t.id, amount: t.amount, date: t.date, merchant: t.merchant, who: t.who || '', email: t.email || '', memo: t.memo || '', receipt: t.receipts > 0, status: 'ramp', at: new Date().toISOString() }, extra || {});

  // From a job report: send the receipt now if the charge is already in Ramp, otherwise hold it until it shows up.
  async function addReceipt({ ref, q, file, amount, date, email }) {
    amount = Math.round(Number(amount) * 100) / 100; if (!(amount > 0)) throw new Error('Enter the receipt total');
    const image = await shrink(file), title = titleOf(q);
    const used = new Set((q.expenses || []).map(e => e.id).filter(Boolean));
    const { txns } = await call('txns', { from: addDays(date, -3), to: ymd(new Date()) });
    const hits = txns.filter(t => !used.has(t.id) && near(t, amount, date, email)).sort((a, b) => Math.abs(new Date(a.date) - new Date(date)) - Math.abs(new Date(b.date) - new Date(date)));
    let entry;
    if (hits.length) {
      const r = await call('attach', { txn: hits[0].id, image, title });
      entry = exp(hits[0], { receipt: !!r.receipt || hits[0].receipts > 0, memo: r.memoText || hits[0].memo || '', by: email, note: [r.receiptErr ? 'Receipt upload failed: ' + r.receiptErr : '', r.memoErr ? 'Memo not set: ' + r.memoErr : ''].filter(Boolean).join(' · ') });
    } else {
      if (image.length > 950000) throw new Error('That file is too big to hold until the charge posts. Try a photo instead of a PDF.');
      const p = await db.collection('rampPending').add({ quote: ref.id, title, email, amount, date, image, at: new Date(), tries: 0 });
      entry = { pid: p.id, amount, date, merchant: '', by: email, status: 'pending', at: new Date().toISOString() };
    }
    await ref.update({ expenses: firebase.firestore.FieldValue.arrayUnion(entry) });
    return entry;
  }

  // Admin session, at most hourly: match waiting receipts, and pull in charges whose memo names a project.
  async function sync(force) {
    const st = await db.collection('config').doc('rampSync').get().catch(() => null);
    if (!force && st && st.exists && Date.now() - (st.data().at || 0) < 55 * 6e4) return { skipped: true };
    const today = ymd(new Date()), { txns } = await call('txns', { from: addDays(today, -45), to: today });
    const qs = (await db.collection('quotes').where('status', 'in', ['won', 'scheduled', 'submitted', 'closed']).get()).docs.map(d => ({ ref: d.ref, id: d.id, q: d.data() })).filter(x => !x.q.isTemplate && !x.q.jobDeleted);
    const claimed = new Set(); qs.forEach(x => { (x.q.expenses || []).forEach(e => e.id && claimed.add(e.id)); (x.q.expensesIgnored || []).forEach(k => claimed.add(k)); });
    // v9.7.0 D-Tools projects with no calculator job: memo-coded charges go to projectExpenses/{projectId}
    const pex = Object.fromEntries((await db.collection('projectExpenses').get()).docs.map(d => [d.id, d.data()]));
    Object.values(pex).forEach(d => { (d.expenses || []).forEach(e => e.id && claimed.add(e.id)); (d.ignored || []).forEach(k => claimed.add(k)); });
    let pp = []; try { const pd = await db.collection('pipeline').doc('data').get(); pp = Object.values((pd.exists && JSON.parse(pd.data().json || '{}').projects) || {}); } catch (e) {}
    const fold = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const linked = new Set(qs.map(x => (x.q.project || {}).dtoolsOpportunityId).filter(Boolean).concat(qs.map(x => fold(titleOf(x.q)))));
    pp.filter(p => !linked.has(p.id) && !linked.has(fold(p.name))).forEach(p => qs.push({ pid: p.id, q: { label: p.name, project: { dtoolsProjectName: p.name, dtoolsOppNumber: p.number, dtoolsClientName: p.client } } }));
    const out = { matched: 0, memo: 0, waiting: 0, at: Date.now() };
    for (const pd of (await db.collection('rampPending').get()).docs) {
      const p = pd.data(), x = qs.find(y => y.ref && y.id === p.quote);
      if (!x) { await pd.ref.delete(); continue; }
      const hits = txns.filter(t => !claimed.has(t.id) && near(t, p.amount, p.date, p.email));
      if (!hits.length) { out.waiting++; continue; }
      const t = hits[0], r = await call('attach', { txn: t.id, image: p.image, title: p.title }); claimed.add(t.id);
      const list = (x.q.expenses || []).map(e => e.pid === pd.id ? exp(t, { receipt: !!r.receipt, memo: r.memoText || t.memo, by: p.email }) : e);
      await x.ref.update({ expenses: list }); x.q.expenses = list; await pd.ref.delete(); out.matched++;
    }
    for (const t of txns) {
      if (claimed.has(t.id) || !t.memo) continue;
      const m = t.memo.toLowerCase();
      let hit = qs.filter(x => { const ti = titleOf(x.q).toLowerCase(), n = numOf(x.q); return (ti.length > 5 && m.includes(ti)) || (n && new RegExp('\\b' + n + '\\b').test(m)); });
      if (!hit.length) hit = qs.filter(x => keysOf(x.q).some(k => new RegExp('\\b' + k + '\\b').test(m)));  // client / project name word
      if (hit.length !== 1) continue;
      const x = hit[0];
      if (x.pid) await db.collection('projectExpenses').doc(x.pid).set({ name: titleOf(x.q), expenses: firebase.firestore.FieldValue.arrayUnion(exp(t, { src: 'memo' })), updatedAt: new Date() }, { merge: true });
      else { const list = (x.q.expenses || []).concat([exp(t, { src: 'memo' })]); await x.ref.update({ expenses: list }); x.q.expenses = list; }
      claimed.add(t.id); out.memo++;
    }
    await db.collection('config').doc('rampSync').set(out);
    return out;
  }
  window.asbcRamp = { call, addReceipt, sync, shrink };
})();
