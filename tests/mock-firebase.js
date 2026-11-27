// Smoke-test stand-in for the Firebase compat SDK (served instead of www.gstatic.com/firebasejs/*).
// Signs in a fixed test user and answers Firestore reads from window.__FIXTURE (set by tests/smoke.js).
// Unknown methods are tolerated (they return chainable no-ops), so pages load without a real backend.
(function () {
  if (window.firebase && window.firebase.__mock) return;
  const F = window.__FIXTURE || { user: { email: 'admin@asbc.us' }, docs: {}, collections: {} };
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const ts = d => ({ toDate: () => new Date(d), toMillis: () => +new Date(d), seconds: Math.floor(+new Date(d) / 1000) });
  const snapDoc = (path, data) => ({ id: path.split('/').pop(), exists: data != null, ref: docRef(path), data: () => clone(data), get: k => (data || {})[k] });
  const qSnap = list => ({ docs: list, size: list.length, empty: !list.length, forEach: f => list.forEach(f), docChanges: () => [] });
  const collList = name => Object.entries(F.collections[name] || {}).map(([id, d]) => snapDoc(name + '/' + id, d));
  function docRef(path) {
    const id = path.split('/').pop();
    return {
      id, path,
      get: async () => snapDoc(path, F.docs[path] !== undefined ? F.docs[path] : (F.collections[path.split('/')[0]] || {})[id]),
      set: async (d, o) => { F.docs[path] = o && o.merge ? Object.assign({}, F.docs[path] || {}, d) : d; },
      update: async d => { F.docs[path] = Object.assign({}, F.docs[path] || {}, d); },
      delete: async () => { delete F.docs[path]; },
      onSnapshot: (cb) => { setTimeout(() => cb(snapDoc(path, F.docs[path])), 0); return () => {}; },
      collection: n => collRef(path + '/' + n)
    };
  }
  function query(name, list) {
    const q = {
      where: () => q, orderBy: () => q, limit: () => q, startAfter: () => q, select: () => q,
      get: async () => qSnap(list()),
      onSnapshot: cb => { setTimeout(() => cb(qSnap(list())), 0); return () => {}; }
    };
    return q;
  }
  function collRef(name) {
    const q = query(name, () => collList(name));
    return Object.assign(q, { doc: id => docRef(name + '/' + (id || 'auto' + Math.random().toString(36).slice(2, 8))), add: async d => { const id = 'auto' + Date.now(); (F.collections[name] = F.collections[name] || {})[id] = d; return docRef(name + '/' + id); } });
  }
  const user = Object.assign({ uid: 'test-uid', emailVerified: true, displayName: 'Test Admin',
    getIdTokenResult: async () => ({ claims: { email_verified: true } }), getIdToken: async () => 'test-token', reload: async () => {} }, F.user);
  const listeners = [];
  const auth = {
    currentUser: user,
    onAuthStateChanged: cb => { listeners.push(cb); setTimeout(() => cb(user), 5); return () => {}; },
    signInWithEmailAndPassword: async () => ({ user }), createUserWithEmailAndPassword: async () => ({ user }),
    sendPasswordResetEmail: async () => {}, signOut: async () => {}, setPersistence: async () => {}, useDeviceLanguage: () => {}
  };
  const fs = {
    collection: collRef, doc: docRef,
    enablePersistence: () => Promise.resolve(), settings: () => {},
    batch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
    runTransaction: async fn => fn({ get: r => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d), delete: r => r.delete() })
  };
  const FieldValue = { increment: n => n, arrayUnion: (...a) => a, arrayRemove: () => [], serverTimestamp: () => new Date().toISOString(), delete: () => null };
  const firestore = () => fs; firestore.FieldValue = FieldValue; firestore.Timestamp = { now: () => ts(Date.now()), fromDate: d => ts(d) };
  const authFn = () => auth; authFn.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session' } }; authFn.EmailAuthProvider = { credential: () => ({}) };
  window.firebase = { __mock: true, apps: [], initializeApp: function (c) { this.apps.push({ options: c }); return this; }, app: () => ({}), auth: authFn, firestore };
})();
