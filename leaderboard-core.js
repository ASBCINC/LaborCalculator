// ASBC leaderboard helpers (v8.13.0), shared by index.html and leaderboard.html.
// Tally docs: stats/<YYYY-MM> = { reps: { <rep name>: { quotes, total } } }  (first save of a real quote only)
//             stats/quotedOpps = { opps: { <D-Tools opp id>: { rep, at } } }  (one counted quote per opportunity)
(function () {
  const STORE_DEFAULTS = {
    'Noel Salinas': 'San Francisco', 'Jonathan Model': 'San Francisco', 'Gabriel Clark': 'San Francisco', 'Josh Silva': 'San Francisco', 'Oum Sayarad': 'San Francisco',
    'Nawel Girma': 'West Hollywood', 'Miguel Sandoval': 'West Hollywood', 'Kwamé Yeboah': 'West Hollywood', 'Stefn Sandberg': 'West Hollywood', 'Troy Ikeda': 'West Hollywood',
    'Brian Chan': 'Palo Alto', 'Timothy Parks': 'Palo Alto', 'Matthew Stachnik': 'Palo Alto',
    'Tom Virasak': 'none'   // company president: not ranked
  };
  const STORES = ['San Francisco', 'Palo Alto', 'West Hollywood'];
  function monthKey(d) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' }).formatToParts(d || new Date());
    return p.find(x => x.type === 'year').value + '-' + p.find(x => x.type === 'month').value;
  }
  function shiftMonth(key, n) { const [y, m] = key.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 15)); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
  function storeOf(name, users) {
    const u = Object.values(users || {}).find(x => x && x.name === name);
    const s = (u && u.store) || STORE_DEFAULTS[name] || '';
    return s;
  }
  function isOpenOpp(o) { return !o.isArchived && o.stage && !/lost|won|closed/i.test(o.stage); }
  // Count a quote the first time it is saved with items (call after the quote doc is written).
  async function countQuote(db, quoteId, repName, total, oppId) {
    if (!repName) return false;
    const qref = db.collection('quotes').doc(quoteId);
    const q = await qref.get();
    if (q.exists && q.data().counted) return false;
    const inc = firebase.firestore.FieldValue.increment;
    if (oppId) {
      const qo = await db.collection('stats').doc('quotedOpps').get();
      if (qo.exists && qo.data().opps && qo.data().opps[oppId]) { await qref.set({ counted: 'dup-opp' }, { merge: true }); return false; }
      await db.collection('stats').doc('quotedOpps').set({ opps: { [oppId]: { rep: repName, at: new Date() } } }, { merge: true });
    }
    const mk = monthKey();
    await db.collection('stats').doc(mk).set({ reps: { [repName]: { quotes: inc(1), total: inc(Math.round((total || 0) * 100) / 100) } }, updatedAt: new Date() }, { merge: true });
    await qref.set({ counted: mk }, { merge: true });
    return true;
  }
  async function readMonth(db, key) { const s = await db.collection('stats').doc(key).get(); return (s.exists && s.data().reps) || {}; }
  function ranked(reps, users) {
    return Object.entries(reps).map(([name, v]) => ({ name, quotes: v.quotes || 0, total: v.total || 0, store: storeOf(name, users) }))
      .filter(r => r.store !== 'none').sort((a, b) => b.quotes - a.quotes || b.total - a.total || a.name.localeCompare(b.name));
  }
  window.ASBCBoard = { STORE_DEFAULTS, STORES, monthKey, shiftMonth, storeOf, isOpenOpp, countQuote, readMonth, ranked };
})();
