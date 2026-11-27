        let versionClickCount = 0;
        let versionClickTimer = null;
        const versionNumberEl = document.getElementById('versionNumber');

        versionNumberEl.addEventListener('click', () => {
            versionClickCount++;
            clearTimeout(versionClickTimer);
            versionClickTimer = setTimeout(() => {
                versionClickCount = 0;
            }, 800);

            if (versionClickCount >= 3) {
                versionClickCount = 0;
                promptAdminAccess();
            }
        });

        // v8.11.0: everyone signs in (work email + PIN, Firebase Auth). Only people on the approved
        // list (config/users, editable in Admin > Approved users) get past the sign-in screen.
        const ADMIN_EMAILS = ['a.ward@asbc.us'];
        const fbAuth = (window.firebase && firebase.auth) ? firebase.auth() : null;
        let currentUserProfile = null; // { email, name, role }
        let approvedUsers = {};        // email -> { name, role }
        let authMode = 'signin';
        function repEmailFromName(name) {
            const clean = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().split(/\s+/);
            return clean[0][0] + '.' + clean[clean.length - 1] + '@asbc.us';
        }
        function defaultApprovedUsers() {
            const out = {};
            ADMIN_EMAILS.forEach(e => out[e] = { name: 'Anthony Ward', role: 'admin' });
            Array.from(salesManagerName.options).filter(o => o.value).forEach(o => { out[repEmailFromName(o.value)] = { name: o.value, role: 'rep' }; });
            return out;
        }
        function isAdminUser() { return !!(currentUserProfile && currentUserProfile.role === 'admin'); }
        function canSeeAllQuotes() { return isAdminUser() || !!(currentUserProfile && currentUserProfile.allQuotes); }
        function authMsg(t) { document.getElementById('authStatus').textContent = t || ''; }
        function setAuthMode(m) {
            authMode = m;
            document.getElementById('authPin2').classList.toggle('hidden', m !== 'create');
            document.getElementById('authTitle').textContent = m === 'create' ? 'Create your PIN (first time)' : 'Sign in';
            document.getElementById('authSubmit').textContent = m === 'create' ? 'Create PIN & sign in' : 'Sign in';
            document.getElementById('authModeToggle').textContent = m === 'create' ? 'Already have a PIN? Sign in' : 'First time? Create your PIN';
            document.getElementById('authPin').autocomplete = m === 'create' ? 'new-password' : 'current-password';
            authMsg('');
        }
        document.getElementById('authModeToggle').addEventListener('click', () => setAuthMode(authMode === 'create' ? 'signin' : 'create'));
        function showAuthGate(show, msg) {
            if (show && window.ASBCDiag) ASBCDiag.ready('sign-in screen');  // v10.8.0
            const g = document.getElementById('authGate');
            g.classList.toggle('hidden', !show); g.classList.toggle('flex', show);
            if (show) g.classList.add('ready');  // v8.33.0: the sign-in form only appears once we know nobody is signed in (no flash)
            document.getElementById('authSignOutBtn').classList.toggle('hidden', !(fbAuth && fbAuth.currentUser));
            if (msg !== undefined) authMsg(msg);
        }
        document.getElementById('authForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const email = document.getElementById('authEmail').value.trim().toLowerCase();
            const pin = document.getElementById('authPin').value.trim();
            if (!/@(asbc\.us|asbis\.com)$/i.test(email)) return authMsg('Use your @asbc.us or @asbis.com work email.');
            if (!/^\d{6,}$/.test(pin)) return authMsg('PIN must be at least 6 digits (numbers only).');
            if (!fbAuth) return authMsg('Sign-in unavailable. Check the connection and reload.');
            try {
                if (authMode === 'create') {
                    if (pin !== document.getElementById('authPin2').value.trim()) return authMsg('The two PINs do not match.');
                    authMsg('Creating your PIN…');
                    await fbAuth.createUserWithEmailAndPassword(email, pin);
                } else {
                    authMsg('Signing in…');
                    await fbAuth.signInWithEmailAndPassword(email, pin);
                }
                localStorage.setItem('asbcLastEmail', email);
            } catch (e) {
                const c = e.code || '';
                if (c.includes('email-already-in-use')) { setAuthMode('signin'); authMsg('You already have a PIN. Sign in with it (or tap Forgot PIN).'); }
                else if (/wrong-password|invalid-credential|invalid-login|user-not-found/.test(c)) authMsg(authMode === 'signin' ? 'Wrong email or PIN. First time here? Tap "Create your PIN".' : 'Could not create the PIN.');
                else if (c.includes('too-many-requests')) authMsg('Too many tries. Wait a few minutes or tap Forgot PIN.');
                else if (c.includes('network')) authMsg('No connection. Check Wi-Fi and try again.');
                else authMsg('Sign-in failed: ' + (c || e.message));
            }
        });
        async function sendPinReset() {
            const email = document.getElementById('authEmail').value.trim();
            if (!email) return authMsg('Type your email first.');
            try { await fbAuth.sendPasswordResetEmail(email); authMsg('Reset email sent. It can take a few minutes (check Junk). Choose a new 6+ digit PIN there.'); }
            catch (e) { authMsg('Could not send reset: ' + (e.code || e.message)); }
        }
        // v8.27.0: email confirmation. The database only answers accounts whose email is confirmed, so nobody can
        // claim an approved person's address before they do. One-time step per person.
        async function sendVerify(u, force) {
            const last = Number(localStorage.getItem('asbcVerifySent') || 0);
            if (!force && Date.now() - last < 10 * 60 * 1000) return false;
            await u.sendEmailVerification({ url: 'https://asbcinc.github.io/LaborCalculator/' });
            localStorage.setItem('asbcVerifySent', String(Date.now())); return true;
        }
        function showVerifyGate(u) {
            let g = document.getElementById('verifyGate');
            if (!g) {
                g = document.createElement('div'); g.id = 'verifyGate';
                g.className = 'fixed inset-0 bg-page z-[61] flex items-center justify-center p-4';
                g.innerHTML = `<div class="bg-card border border-accent p-6 rounded-2xl shadow-2xl w-full max-w-sm space-y-3 text-center">
                    <h2 class="text-xl font-bold text-accent">Confirm your email</h2>
                    <p class="text-sm text-ink2">We sent a link to <b id="vgEmail" class="text-ink"></b>. Open it (check Junk), tap the link, then come back and tap <b>I confirmed it</b>.</p>
                    <p class="text-xs text-mute">One-time step. It keeps job and pricing data limited to ASBC staff.</p>
                    <button id="vgDone" type="button" class="w-full bg-go text-on font-bold py-3 rounded-xl">I confirmed it</button>
                    <button id="vgResend" type="button" class="w-full border border-line text-ink py-3 rounded-xl text-sm">Send the email again</button>
                    <button id="vgOut" type="button" class="w-full text-mute py-2 text-xs underline">Sign out</button>
                    <div id="vgMsg" class="text-xs text-mute min-h-[1rem]"></div></div>`;
                document.body.appendChild(g);
                const msg = t => document.getElementById('vgMsg').textContent = t;
                document.getElementById('vgDone').onclick = async () => {
                    msg('Checking…');
                    try { await fbAuth.currentUser.reload(); if (fbAuth.currentUser.emailVerified) { await fbAuth.currentUser.getIdToken(true); location.reload(); } else msg('Not confirmed yet. Tap the link in the email first (check Junk).'); }
                    catch (e) { msg('Could not check: ' + (e.code || e.message)); }
                };
                document.getElementById('vgResend').onclick = async () => { try { await sendVerify(fbAuth.currentUser, true); msg('Sent. It can take a few minutes.'); } catch (e) { msg(String(e.code || e.message).includes('too-many') ? 'Too many emails. Wait a few minutes.' : 'Could not send: ' + (e.code || e.message)); } };
                document.getElementById('vgOut').onclick = () => fbAuth.signOut().then(() => location.reload());
            }
            document.getElementById('vgEmail').textContent = u.email || '';
            sendVerify(u).catch(() => {});
        }
        async function signOutUser(ask) {
            if (ask && !window.confirm('Sign out ' + (currentUserProfile ? currentUserProfile.name : '') + ' on this device?')) return;
            if (fbAuth) await fbAuth.signOut();
        }
        // v8.33.0: the sales rep list follows User Roles (Admin, Sales Director, Sales Manager), so new reps appear without a code change
        function syncRepOptions(users) {
            try { const sel = document.getElementById('salesManagerName'); const have = new Set(Array.from(sel.options).map(o => o.value));
                Object.entries(users || {}).filter(([e, u]) => u && u.name && ['admin', 'director', 'manager'].includes(ASBCRoles.accessOf(u, e)) && !have.has(u.name)).map(([, u]) => u.name).sort()
                    .forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); }); } catch (e) {}
        }
        async function loadApprovedUsers() {
            try {
                const snap = await db.collection('config').doc('users').get();
                approvedUsers = (snap.exists && snap.data().users) || {};
            } catch (e) { approvedUsers = approvedUsers || {}; }
            ADMIN_EMAILS.forEach(e => { if (!approvedUsers[e]) approvedUsers[e] = { name: 'Anthony Ward', role: 'admin' }; });
            return approvedUsers;
        }
        function applySignedInUser() {
            const badge = document.getElementById('userBadge');
            badge.textContent = currentUserProfile.name + ' · Sign out';
            badge.classList.remove('hidden');
            const opt = Array.from(salesManagerName.options).some(o => o.value === currentUserProfile.name);
            if (!isAdminUser() && opt) {
                salesManagerName.value = currentUserProfile.name;
                salesManagerName.dispatchEvent(new Event('change')); // v8.13.1: always load the rep's D-Tools opportunities, even when the name was already filled in
                salesManagerName.disabled = true;
            } else {
                salesManagerName.disabled = false;
            }
        }
        if (fbAuth) {
            document.getElementById('authEmail').value = localStorage.getItem('asbcLastEmail') || '';
            setTimeout(() => document.getElementById('authGate').classList.add('ready'), 8000);
            fbAuth.onAuthStateChanged(async (u) => {
                if (!u) {
                    currentUserProfile = null; salesManagerName.disabled = false;
                    if (savedEstimates) savedEstimates.innerHTML = '<option value="">Sign in to see saved quotes</option>';
                    document.getElementById('userBadge').classList.add('hidden');
                    setAuthMode('signin'); showAuthGate(true, ''); return;
                }
                if (!u.emailVerified) { showAuthGate(false); showVerifyGate(u); return; }  // v8.27.0: confirm the email before any data loads
                { const vg = document.getElementById('verifyGate'); if (vg) vg.remove(); }
                try { if (!(await u.getIdTokenResult()).claims.email_verified) { await u.reload(); await u.getIdToken(true); } } catch (e) {}  // v8.28.1: refresh a sign-in token issued before the email was confirmed
                const email = (u.email || '').toLowerCase();
                const users = await loadApprovedUsers();
                syncRepOptions(users);  // v8.33.0
                loadItemStats();  // v9.3.0
                const p = users[email];
                if (!p) { showAuthGate(true, email + ' is not on the approved list yet. Ask Anthony to add you, then reload.'); return; }
                currentUserProfile = { email, name: p.name, role: p.role || 'rep', allQuotes: !!p.allQuotes, access: ASBCRoles.accessOf(p, email) };
                // v8.29.0: sign-in lands on the Home page; the calculator opens from there (?calc=1) or with a saved quote (?quote=)
                { const qs = new URLSearchParams(location.search);
                  const acc0 = currentUserProfile.access, land = !window.ASBC_TOOLS ? './home.html' : ['installer', 'lead'].includes(acc0) ? './jobs.html' : acc0 === 'manager' ? '' : './home.html';  // v11.0.0 reps land here, techs on My Jobs
                  if (!ASBCRoles.can(acc0, 'calculator') || (!qs.has('quote') && !qs.has('calc') && land)) { location.replace(land || './home.html'); return; } }
                // v8.16.0: techs use the calculator too (no admin); Jobs link in the header
                showAuthGate(false);
                { const cl = document.getElementById('calLink'); if (cl) { cl.classList.remove('hidden'); cl.classList.add('block'); } }  // v8.26.0
                { const A = currentUserProfile.access, show = (id, ok) => { const el = document.getElementById(id); if (el) { el.classList.toggle('hidden', !ok); el.classList.toggle('block', !!ok); } };  // v8.29.0 links by role
                  show('homeLink', true); show('lbLink', ASBCRoles.can(A, 'leaderboard')); show('pipeLink', ASBCRoles.can(A, 'pipeline')); }
                if (currentUserProfile.role === 'tech') { const jl = document.getElementById('jobsLink'); jl.classList.remove('hidden'); jl.classList.add('block'); jl.textContent = 'My Jobs'; }
                if (isAdminUser()) {
                    const jl = document.getElementById('jobsLink'); jl.classList.remove('hidden'); jl.classList.add('block');
                    db.collection('quotes').where('status', '==', 'submitted').get().then(sn => { if (sn.size) jl.textContent = 'Jobs (' + sn.size + ' to review)'; }).catch(() => {});
                }
                applySignedInUser();
                window.ASBCDiag && ASBCDiag.ready('calculator');  // v10.8.0 error log
                if (window.ASBC_TOOLS && window.asbcDashboard && currentUserProfile.access === 'manager') asbcDashboard({ access: 'manager', email, name: currentUserProfile.name, users }).then(d => { const h = asbcAlertStrip(d.alerts); const pt = document.getElementById('projectTools'); if (h && pt) pt.insertAdjacentHTML('afterend', '<div style="padding:10px 12px 0">' + h + '</div>'); }).catch(() => {});  // v11.0.0 rep alerts
                refreshSavedEstimateList();
                loadRepLeaderboard();
                if (typeof _bootQuoteId !== 'undefined' && _bootQuoteId) { const q = _bootQuoteId; _bootQuoteId = null; loadQuoteById(q); }
                if (isAdminUser()) {
                    try { const snap = await db.collection('config').doc('users').get(); if (!snap.exists) await db.collection('config').doc('users').set({ users: defaultApprovedUsers(), updatedAt: new Date(), updatedBy: email }); approvedUsers = (await loadApprovedUsers()); } catch (e) { console.warn('approved users seed', e); }
                }
            });
        } else {
            showAuthGate(true, 'Sign-in could not load. Check the connection and reload.');
        }
        function fillApprovedUsersEditor() {
            const ta = document.getElementById('approvedUsersText'); if (!ta) return;
            ta.value = Object.entries(approvedUsers).sort((a, b) => (a[1].role === 'admin' ? -1 : 0) - (b[1].role === 'admin' ? -1 : 0) || a[1].name.localeCompare(b[1].name)).map(([e, p]) => e + ', ' + p.name + ', ' + (p.role || 'rep') + ', ' + (p.store || (window.ASBCBoard && ASBCBoard.STORE_DEFAULTS[p.name]) || '') + (p.allQuotes ? ', all' : '')).join('\n');
        }
        async function saveApprovedUsers() {
            if (!isAdminUser()) return;
            const users = {}; const bad = [];
            document.getElementById('approvedUsersText').value.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
                const [e, n, r, st, all] = l.split(',').map(x => (x || '').trim());
                if (!/@/.test(e || '') || !n) bad.push(l); else users[e.toLowerCase()] = { name: n, role: ['admin', 'tech'].includes(r) ? r : 'rep', store: st || '', allQuotes: /^(all|yes|all quotes)$/i.test(all || '') };
            });
            if (bad.length) { adminStatus.innerHTML = '<span class="text-bad">Fix these lines: ' + escapeHtml(bad.join(' | ')) + '</span>'; return; }
            ADMIN_EMAILS.forEach(e => users[e] = users[e] || { name: 'Anthony Ward', role: 'admin' });
            try {
                await db.collection('config').doc('users').set({ users, updatedAt: new Date(), updatedBy: currentUserProfile.email });
                approvedUsers = users;
                adminStatus.innerHTML = '<span class="text-good">Approved users saved (' + Object.keys(users).length + ').</span>';
            } catch (e) { adminStatus.innerHTML = '<span class="text-bad">Save failed: ' + escapeHtml(e.message) + '</span>'; }
        }
        function promptAdminAccess() {
            if (isAdminUser()) { toggleAdminModal(true); return; }
            alert('Admin tools are only available to admins.');
        }

