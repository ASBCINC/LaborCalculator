// BUILT FILE: do not edit. Edit src/calculator/*.js, then run: python3 scripts/release.py build

        const firebaseConfig = {
            apiKey: "AIzaSyCSf560VkBf2esIH5rC-_Vcx349o7iIC-0",
            authDomain: "asbc-calculator.firebaseapp.com",
            projectId: "asbc-calculator",
            storageBucket: "asbc-calculator.firebasestorage.app",
            messagingSenderId: "1060301879727",
            appId: "1:1060301879727:web:3eb390503974dc60ea175a"
        };

        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();

        db.enablePersistence()
          .catch(function(err) {
              if (err.code == 'failed-precondition') {
                  console.warn('Multiple tabs open, offline persistence can only be enabled in one tab at a time.');
              } else if (err.code == 'unimplemented') {
                  console.warn('Current browser does not support full offline persistence.');
              }
          });

        const APP_VERSION = '11.10.0';
        const BUILD_DATE = '2026-11-27';
        let HOURLY_RATE = 200;

        // Add-on labor options for the dropdown on every product tile.
        // Picking one stacks its hours on top of that product's own hours, per unit of quantity.

        // Add-on dropdowns are opt-in per product. Key by stable catalog id
        // (category--name slug) or exact product name. Value 'all' for every
        // add-on, or an array of add-on names. Empty map = no tile shows a
        // dropdown.
        // Add-ons live on each catalog item (item.addons, loaded from the sheet's "Add-ons" column).
        // SEED_ADDONS is the offline fallback; live add-ons come from the Firestore catalog.
        // an item's own Add-ons cell always wins over the seed.
        const SEED_ADDONS = {
            'Beolab 18 (Pair)': [
                { name: 'Floor stand', installHours: 0.00, programmingHours: 0.00 },
                { name: 'Wall mount', installHours: 1.00, programmingHours: 0.00 }
            ],
            'Beosound Level': [
                { name: 'Wall mount', installHours: 0.50, programmingHours: 0.00 }
            ],
            'Beolab 28 (Pair)': [
                { name: 'Wall mounted', installHours: 1.00, programmingHours: 0.00 }
            ],
            'Beolab 8 (Pair)': [
                { name: 'Bookshelf', installHours: 0.00, programmingHours: 0.00 },
                { name: 'Floor stand', installHours: 0.25, programmingHours: 0.00 },
                { name: 'Wall mount', installHours: 0.50, programmingHours: 0.00 }
            ],
            'Beosound Premiere': [
                { name: 'Wall mounted / SMI', installHours: 0.50, programmingHours: 0.00 }
            ],
            'Beosound Stage': [
                { name: 'Wall mounted / SMI', installHours: 0.50, programmingHours: 0.00 }
            ],
            'Beosound Theatre': [
                { name: 'Wall mounted / SMI', installHours: 0.50, programmingHours: 0.00 },
                { name: 'Motorized Mount w/ TV', installHours: 5.00, programmingHours: 0.00 }
            ],
            'Beovision Harmony 65/77/83': [
                { name: 'Wall mounted', installHours: 2.00, programmingHours: 0.00 }
            ],
            'Beovision Harmony 97': [
                { name: 'Wall mounted', installHours: 2.00, programmingHours: 0.00 }
            ]
        };

        function parseAddonsCell(value) {
            const raw = String(value ?? '').trim();
            if (!raw) return null;
            const out = raw.split(';').map(part => {
                const segs = part.split('|').map(seg => seg.trim());
                if (!segs[0]) return null;
                return { name: segs[0], installHours: Number(segs[1]) || 0, programmingHours: Number(segs[2]) || 0 };
            }).filter(Boolean);
            return out.length ? out : null;
        }
        function addonsToCell(addons) {
            return (addons || []).map(addon => `${addon.name}|${(Number(addon.installHours) || 0).toFixed(2)}|${(Number(addon.programmingHours) || 0).toFixed(2)}`).join(';');
        }
        function applySeedAddons(list) {
            (list || []).forEach(item => {
                if (Array.isArray(item.addons) && item.addons.length) { item.addons = item.addons.map(normalizeAddon).filter(Boolean); return; }
                const seed = SEED_ADDONS[item.id] || SEED_ADDONS[item.name];
                if (seed) { item.addons = seed.map(addon => ({ ...addon })); }
            });
        }

        function getProductAddonOptions(item) {
            return (item && Array.isArray(item.addons) && item.addons.length) ? item.addons : null;
        }

        let RECYCLING_FEE = 75;

        const MATERIALS_MARKUP_PCT = 5; // Materials fee locked at 5% on every quote (v8.9.15: dropdown removed again at Anthony's request; the row stays visible in the summary with the dollar value)
        let appSettings = { hourlyRate: 200, recyclingFee: 75, defaultRecyclingToggle: 'no', defaultMarkup: 5, zonePresets: ['General', 'MEC (Equip. Closet)', 'Entry / Foyer', 'Living Room', 'Family Room', 'Great Room', 'Formal Living Room', 'Den', 'Sitting Room', 'Lounge', 'Library', 'Media Room', 'Home Theater', 'Game Room', 'Primary Bedroom', 'Patio / Outdoor'] };
        try { const _savedSettings = JSON.parse(localStorage.getItem('asbcAppSettings') || 'null'); if (_savedSettings) appSettings = Object.assign(appSettings, _savedSettings); } catch (_e) {}
        function applyAppSettings() {
            HOURLY_RATE = Number(appSettings.hourlyRate) || 200;
            RECYCLING_FEE = Number(appSettings.recyclingFee) || 75;
            const zoneSelect = document.getElementById('activeZone');
            if (zoneSelect && Array.isArray(appSettings.zonePresets) && appSettings.zonePresets.length) {
                const prevZone = zoneSelect.value;
                zoneSelect.innerHTML = '<option value="">Select room for items</option>' + appSettings.zonePresets.map(z => `<option value="${escapeHtml(z)}">${escapeHtml(z)}</option>`).join('');
                if (prevZone && appSettings.zonePresets.includes(prevZone)) zoneSelect.value = prevZone;
            }
            document.querySelectorAll('[data-rate-display]').forEach(el => { el.textContent = `$${HOURLY_RATE}/hr`; });
            const printRate = document.getElementById('printLaborRate'); if (printRate) printRate.textContent = `$${HOURLY_RATE.toFixed(2)} / hr`;
            const disc = document.getElementById('disclaimerRate'); if (disc) disc.textContent = `$${HOURLY_RATE.toFixed(2)}/hr`;
        }
        async function loadAppSettings() {
            try {
                const snap = await db.collection('config').doc('settings').get();
                if (snap.exists) { appSettings = Object.assign(appSettings, snap.data() || {}); localStorage.setItem('asbcAppSettings', JSON.stringify(appSettings)); }
            } catch (_err) { /* offline: cached settings stand in */ }
            applyAppSettings();
        }


        let catalog = [];
        const collapsedZones = new Set(); // v8.21.0: estimate rooms folded by the user
        let catalogLoadError = null;
        let isListView = localStorage.getItem('asbcListView') !== null ? localStorage.getItem('asbcListView') === 'true' : window.innerWidth < 640; // v8.21.0: phones start in List view
        let isHoursShown = localStorage.getItem('asbcShowHours') === 'true';
        let currentLoadedIsTemplate = false;
        let currentLoadedOwner = ''; // sales rep on the loaded quote (non-admins saving someone else's quote get a copy)
        let currentLoadedEstimateId = '';
        let pricingV2 = true; // v8.12 pricing (site, PM, commissioning, trip, minimum); false for quotes saved earlier
        let currentOppMeta = { id: '', number: '', clientName: '' }; // D-Tools opportunity kept with the quote (survives load/re-save)

        function slugify(value) {
            return String(value).trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        }

        function getStableCatalogId(item, category, name) {
            const suppliedId = String(item.id || item.sku || '').trim();
            return suppliedId || `${slugify(category)}--${slugify(name)}`;
        }

        function migrateLegacyFavoriteIds() {
            const migrated = new Set();
            favoriteIds.forEach(savedId => {
                if (typeof savedId === 'number' && catalog[savedId]) {
                    migrated.add(catalog[savedId].id);
                } else if (typeof savedId === 'string') {
                    migrated.add(savedId);
                }
            });
            favoriteIds = migrated;
            localStorage.setItem('asbcFavoriteIds', JSON.stringify([...favoriteIds]));
        }

        function finalizeCatalogRender(statusHtml) {
            const searchInput = document.getElementById('searchInput');
            const resultCount = document.getElementById('resultCount');
            migrateLegacyFavoriteIds();
            searchInput.placeholder = `Search ${catalog.length} products...`;
            buildCategoryButtons();
            updateViewToggleButton();
            renderCatalog();
            renderQuote();
            populateAdminItemList();
            if (statusHtml) resultCount.innerHTML = statusHtml;
        }

        function itemsFromRows(rows) {
            const list = (rows || []).map((item, index) => {
                const category = String(item.category || '').trim();
                const name = String(item.name || '').trim();
                const installHours = Number(item.installHours ?? 0);
                const programmingHours = Number(item.programmingHours ?? 0);
                const id = getStableCatalogId(item, category, name);
                if (!category || !name) throw new Error(`Catalog row ${index + 1} is missing a category or name.`);
                if (!Number.isFinite(installHours) || !Number.isFinite(programmingHours)) throw new Error(`Catalog row ${index + 1} contains invalid labor hours.`);
                let addons = null;
                if (typeof item.addons === 'string') addons = parseAddonsCell(item.addons);
                else if (Array.isArray(item.addons)) addons = item.addons.map(normalizeAddon).filter(Boolean);
                return { id, category, name, installHours, programmingHours, totalHours: installHours + programmingHours, addons };
            });
            if (!list.length) throw new Error('Catalog source returned zero items.');
            return list;
        }

        async function loadCatalog() {
            const productGrid = document.getElementById('productGrid');
            const resultCount = document.getElementById('resultCount');
            const searchInput = document.getElementById('searchInput');

            // Stale-while-revalidate: paint the cached catalog instantly, refresh in the background.
            if (!catalog.length) {
                productGrid.innerHTML = '<div class="col-span-full text-center text-mute py-12">Loading catalog...</div>';
                resultCount.textContent = 'Syncing...';
                const cachedRaw = localStorage.getItem('asbcCachedCatalog');
                if (cachedRaw) {
                    try {
                        catalog = JSON.parse(cachedRaw);
                        applySeedAddons(catalog);
                        finalizeCatalogRender('<span class="text-accent">Cached catalog active...</span>');
                    } catch (_e) { catalog = []; }
                }
            }

            const applyLive = (items, status) => {
                catalog = items;
                applySeedAddons(catalog);
                localStorage.setItem('asbcCachedCatalog', JSON.stringify(catalog));
                catalogLoadError = null;
                finalizeCatalogRender(status);
            };

            // Primary source: Firestore (instant, no publish cache lag).
            try {
                const snap = await db.collection('config').doc('catalog').get();
                if (!snap.exists) throw new Error('Catalog document not found.');
                const items = itemsFromRows(snap.data().items || []);
                applyLive(items, `<span class="text-good">${items.length} products · Live</span>`);
                return;
            } catch (firestoreError) { catalogLoadError = firestoreError; }

            // Bundled offline fallback.
            try {
                const res = await fetch('./labor-catalog.json', { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const items = itemsFromRows(await res.json());
                applyLive(items, '<span class="text-accent">Bundled Offline Catalog Active</span>');
                return;
            } catch (bundledError) { /* fall through */ }

            // Frozen Google Sheet archive (last resort).
            try {
                const sheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRsbZr5FARHKDrv0f9oFQ2Pp7kwIHu4xBkHaPUXZ1c2PzAmYlQy-Z__WfpOdB1g2_WUtoTgiXHL1cwu/pub?gid=0&single=true&output=csv';
                const response = await fetch(sheetUrl, { cache: 'no-store' });
                if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
                const csvText = await response.text();
                const parsedData = Papa.parse(csvText, {
                    header: true, skipEmptyLines: 'greedy', dynamicTyping: true,
                    transformHeader: function(header) {
                        const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (h.includes('category')) return 'category';
                        if (h.includes('name') || h.includes('item') || h.includes('product')) return 'name';
                        if (h.includes('install')) return 'installHours';
                        if (h.includes('program')) return 'programmingHours';
                        if (h === 'id' || h === 'sku') return 'id';
                        if (h.includes('addon')) return 'addons';
                        return h;
                    }
                });
                const items = itemsFromRows(parsedData.data);
                applyLive(items, '<span class="text-accent">Sheet Archive Active</span>');
                return;
            } catch (sheetError) { /* fall through */ }

            if (!catalog.length) {
                const error = catalogLoadError || new Error('No catalog source available.');
                catalog = [];
                catalogLoadError = error;
                document.getElementById('categoryButtons').innerHTML = '';
                resultCount.textContent = 'Catalog unavailable';
                productGrid.innerHTML = `
                    <div class="col-span-full mx-auto max-w-lg text-center py-12 px-5">
                        <div class="text-bad font-semibold mb-2">Unable to load catalog</div>
                        <div class="text-sm text-mute mb-4">No internet connection and no offline cache found.</div>
                        <button type="button" onclick="loadCatalog()" class="bg-go text-on font-bold px-4 py-2.5 rounded-xl">Try Again</button>
                    </div>
                `;
            }
        }

        let quoteCart = [];
        let selectedCategory = 'All';
        let favoritesOnly = false;
        let favoriteIds = new Set(JSON.parse(localStorage.getItem('asbcFavoriteIds') || '[]'));

        let tileAddons = {};
        try { tileAddons = JSON.parse(localStorage.getItem('asbcTileAddons') || '{}') || {}; } catch (error) { tileAddons = {}; }

        function tileAddonKey(productId, zone) { return `${String(productId)}||${zone || 'General'}`; }
        function currentZoneName() { return activeZone.value.trim() || 'General'; }
        function requireRoomSelected() {
            if (activeZone.value.trim()) return true;
            alert('Select a room before adding or removing items.');
            activeZone.focus();
            return false;
        }
        function getTileAddon(productId) { return tileAddons[tileAddonKey(productId, currentZoneName())] || null; }
        function normalizeAddon(addon) {
            if (!addon || !addon.name) return null;
            return { name: String(addon.name), installHours: Number(addon.installHours) || 0, programmingHours: Number(addon.programmingHours) || 0 };
        }
        function setTileAddon(productId, addon) {
            const zone = currentZoneName();
            const key = tileAddonKey(productId, zone);
            const clean = normalizeAddon(addon);
            if (clean) { tileAddons[key] = clean; } else { delete tileAddons[key]; }
            localStorage.setItem('asbcTileAddons', JSON.stringify(tileAddons));
            renderCatalog();
            renderQuote();
        }
        function addonOptionsHtml(selectedName, options = []) {
            return `<option value="">Add-on: none</option>` + options.map((addon, index) =>
                `<option value="${index}" ${selectedName === addon.name ? 'selected' : ''}>${escapeHtml(addon.name)}</option>`
            ).join('');
        }

        const currencyFormatter = new Intl.NumberFormat('en-US', {
            style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2
        });

        const activeZone = document.getElementById('activeZone');
        const searchInput = document.getElementById('searchInput');
        const productGrid = document.getElementById('productGrid');
        const quoteList = document.getElementById('quoteList');
        const categoryButtons = document.getElementById('categoryButtons');
        const favoritesFilterButton = document.getElementById('favoritesFilterButton');
        const viewToggleButton = document.getElementById('viewToggleButton');
        const recyclingToggle = document.getElementById('recyclingToggle');
        const customRecyclingInput = document.getElementById('customRecyclingInput');
        const crewSize = document.getElementById('crewSize');
        function getMarkupPercent() {
            return MATERIALS_MARKUP_PCT; // locked at 5% (v8.9.15)
        }
        const isTemplateCheckbox = document.getElementById('isTemplateCheckbox');
        const isLockedCheckbox = document.getElementById('isLockedCheckbox');
        const showHoursCheckbox = document.getElementById('showHoursCheckbox');
        
        const customerName = document.getElementById('customerName');
        function showOppNameField(show) { customerName.classList.toggle('hidden', !show); }
        const salesManagerName = document.getElementById('salesManagerName');
        const savedEstimates = document.getElementById('savedEstimates');

        function applyShowHoursState() {
            document.body.classList.toggle('show-item-hours', isHoursShown);
            if (showHoursCheckbox) showHoursCheckbox.checked = isHoursShown;
            renderQuote();
        }

        showHoursCheckbox.addEventListener('change', (e) => {
            isHoursShown = e.target.checked;
            localStorage.setItem('asbcShowHours', isHoursShown);
            applyShowHoursState();
        });

        async function loadRepLeaderboard() {
            // v8.13.0: reads one small tally doc (stats/<month>) instead of every quote.
            const el = document.getElementById('repTickerText');
            const dup = document.getElementById('repTickerTextDup');
            if (!el || !dup || typeof db === 'undefined' || !db || !window.ASBCBoard) return;
            try {
                const B = ASBCBoard, mk = B.monthKey();
                const top = B.ranked(await B.readMonth(db, mk), approvedUsers).slice(0, 3);
                let line = top.length
                    ? 'Monthly Leaderboard: ' + top.map((r, i) => (i + 1) + '. ' + r.name + ' (' + r.score + ' pts)').join('  \u00b7  ')
                    : 'Monthly Leaderboard: no quotes counted yet this month';
                const day = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', day: 'numeric' }).format(new Date()));
                if (day <= 7) {
                    const last = B.ranked(await B.readMonth(db, B.shiftMonth(mk, -1)), approvedUsers)[0];
                    if (last) line = 'Last month\'s winner: ' + last.name + ' (' + last.quotes + ' quotes)   \u00b7   ' + line;
                }
                line += '   \u00b7   Tap for full leaderboard';
                el.textContent = line;
                dup.textContent = '   \u00b7   ' + line;
            } catch (e) {
                el.textContent = 'Leaderboard unavailable';
                dup.textContent = '';
            }
        }
        async function refreshSavedEstimateList(selectedId = '') {
            if (!currentUserProfile) { if (savedEstimates) savedEstimates.innerHTML = '<option value="">Sign in to see saved quotes</option>'; return; }
            if (savedEstimates) savedEstimates.innerHTML = '<option value="">Syncing with cloud...</option>';
            try {
                const cutoff = Date.now() - (60 * 24 * 60 * 60 * 1000); 
                // v8.11.1: admins see every quote; reps see only their own quotes plus shared templates.
                let querySnapshot;
                if (canSeeAllQuotes()) {
                    querySnapshot = await db.collection("quotes").get();
                } else {
                    const [mine, tmpl] = await Promise.all([
                        db.collection("quotes").where('project.salesManagerName', '==', currentUserProfile.name).get(),
                        db.collection("quotes").where('isTemplate', '==', true).get()
                    ]);
                    const seen = new Set(); const docs = [];
                    [...mine.docs, ...tmpl.docs].forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); docs.push(d); } });
                    querySnapshot = { forEach: fn => docs.forEach(fn) };
                }
                if (savedEstimates) savedEstimates.innerHTML = '<option value="">Saved quotes...</option>';
                
                const templates = [];
                const recents = [];

                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    const quoteDate = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : (data.updatedAt || 0);

                    if (data.isTemplate || data.isLocked) {
                        templates.push(data);
                    } else if (quoteDate > 0 && quoteDate < cutoff) {
                        // v8.9.16: quotes older than 60 days are hidden from this list but no longer deleted
                        // (deleting erased Labor Calibration history; they stay in the Quote Log).
                    } else {
                        recents.push(data);
                    }
                });

                if (templates.length > 0) {
                    const optGroup = document.createElement('optgroup');
                    optGroup.label = "── TEMPLATES ──";
                    templates.sort((a, b) => a.label.localeCompare(b.label)).forEach(record => {
                        const option = document.createElement('option');
                        option.value = record.id;
                        option.textContent = `★ ${record.label}`;
                        optGroup.appendChild(option);
                    });
                    if (savedEstimates) savedEstimates.appendChild(optGroup);
                }

                if (recents.length > 0) {
                    const optGroup = document.createElement('optgroup');
                    optGroup.label = "── RECENT QUOTES ──";
                    recents.sort((a, b) => a.label.localeCompare(b.label)).forEach(record => {
                        const option = document.createElement('option');
                        option.value = record.id;
                        option.textContent = record.label;
                        optGroup.appendChild(option);
                    });
                    if (savedEstimates) savedEstimates.appendChild(optGroup);
                }

                if (savedEstimates) savedEstimates.value = selectedId;
            } catch (error) {
                console.error("Failed to fetch estimates from cloud:", error);
                if (savedEstimates) savedEstimates.innerHTML = '<option value="">Error loading quotes</option>';
            }
        }

        function currentProjectData() {
            return { 
                customerName: customerName.value.trim(),
                salesManagerName: salesManagerName.value.trim(),
                dtoolsOpportunityId: (dtoolsOpportunity && dtoolsOpportunity.value && dtoolsOpportunity.value !== 'manual') ? dtoolsOpportunity.value : (currentOppMeta.id || ''),
                dtoolsOppNumber: currentOppMeta.number || '',
                dtoolsClientName: currentOppMeta.clientName || ''
            };
        }

        function applyProjectData(data = {}) {
            customerName.value = data.customerName || '';
            if (dtoolsOpportunity) dtoolsOpportunity.value = '';
            currentOppMeta = { id: data.dtoolsOpportunityId || '', number: data.dtoolsOppNumber || '', clientName: data.dtoolsClientName || '' };
            if (data.salesManagerName && Array.from(salesManagerName.options).some(o => o.value === data.salesManagerName)) salesManagerName.value = data.salesManagerName;
            else salesManagerName.value = '';
        }

        function serializeQuoteCart() {
            return quoteCart.map(item => item.isCustom ? {
                id: item.id, category: 'Custom', name: item.name, installHours: item.installHours, programmingHours: item.programmingHours, qty: item.qty, isCustom: true, zone: item.zone || 'General'
            } : {
                id: item.id, qty: item.qty, isCustom: false, zone: item.zone || 'General', addon: normalizeAddon(item.addon)
            });
        }

        function rebuildQuoteCart(savedItems = []) {
            const rebuilt = [];
            const missing = [];

            savedItems.forEach(savedItem => {
                const qty = Math.max(1, Number(savedItem.qty) || 1);
                const zone = savedItem.zone || 'General';

                if (savedItem.isCustom) {
                    const installHours = Number(savedItem.installHours) || 0;
                    const programmingHours = Number(savedItem.programmingHours) || 0;
                    rebuilt.push({
                        id: savedItem.id || `custom-${Date.now()}-${rebuilt.length}`,
                        category: 'Custom', name: savedItem.name || 'Custom Labor', installHours, programmingHours, totalHours: installHours + programmingHours, qty, isCustom: true, zone
                    });
                    return;
                }

                let catalogItem = catalog.find(item => item.id === savedItem.id);
                if (!catalogItem && typeof savedItem.id === 'number') { catalogItem = catalog[savedItem.id]; }
                if (!catalogItem && savedItem.name) {
                    catalogItem = catalog.find(item => item.name === savedItem.name && (!savedItem.category || item.category === savedItem.category));
                }

                if (catalogItem) { rebuilt.push({ ...catalogItem, qty, isCustom: false, zone, addon: normalizeAddon(savedItem.addon) }); } 
                else { missing.push(savedItem.name || savedItem.id || 'Unknown item'); }
            });

            return { rebuilt, missing };
        }

        async function saveEstimate(quiet = false) {
            const data = currentProjectData();
            if (!data.customerName) {
                alert('Enter an opportunity name before saving.');
                return false;
            }
            if (!salesManagerName.value) {
                alert('Select a sales rep before saving.');
                salesManagerName.focus();
                return false;
            }
            
            const wantsToSaveAsTemplate = isTemplateCheckbox.checked;
            let id = currentLoadedEstimateId;
            const label = data.customerName;

            if (id && !isAdminUser() && !currentLoadedIsTemplate && currentLoadedOwner && currentUserProfile && currentLoadedOwner !== currentUserProfile.name) {
                alert('This quote belongs to ' + currentLoadedOwner + '. Your changes will be saved as a new copy.');
                id = '';
                currentLoadedEstimateId = '';
            }
            if (id) {
                if (currentLoadedIsTemplate && !wantsToSaveAsTemplate) {
                    id = `estimate-${Date.now()}`;
                    currentLoadedEstimateId = '';
                } else {
                    const overwrite = window.confirm(`Overwrite the existing ${currentLoadedIsTemplate ? 'TEMPLATE' : 'quote'} for ${label}?\n\n• Click OK to UPDATE the original.\n• Click Cancel to SAVE AS A NEW COPY.`);
                    if (!overwrite) {
                        id = `estimate-${Date.now()}`;
                        currentLoadedEstimateId = '';
                    }
                }
            } else {
                id = `estimate-${Date.now()}`;
            }

            const quoteDocument = {
                id,
                label,
                project: data,
                items: serializeQuoteCart(),
                options: {
                    recycling: recyclingToggle.value,
                    customRecycling: customRecyclingInput.value,
                    markup: getMarkupPercent(),
                    crewSize: crewSize.value,
                    pricingV: pricingV2 ? 2 : 1,
                    site: document.getElementById('siteConditions').value,
                    trip: document.getElementById('tripToggle').value,
                    pm: document.getElementById('pmToggle').value
                },
                updatedAt: new Date(),
                isTemplate: wantsToSaveAsTemplate,
                isLocked: isLockedCheckbox.checked
            };

            try {
                await db.collection("quotes").doc(id).set(quoteDocument, { merge: true }); // merge keeps logged actuals on re-save
                hasUnsavedCloudChanges = false; updateSaveIndicator(); localStorage.removeItem('asbcActiveDraft');
                if (!quiet) alert(`Saved ${label} to the cloud! (Will sync when online if currently offline)`);
                currentLoadedIsTemplate = wantsToSaveAsTemplate;
                currentLoadedEstimateId = id;
                await refreshSavedEstimateList(id);
                if (!wantsToSaveAsTemplate && (window.lastUnits || 0) > 0 && window.ASBCBoard) {
                    ASBCBoard.countQuote(db, id, data.salesManagerName, (window.lastPriced || {}).total || 0, data.dtoolsOpportunityId)
                        .catch(e => console.warn('leaderboard tally', e)).finally(loadRepLeaderboard);
                } else { loadRepLeaderboard(); }
            } catch (error) {
                console.error("Cloud save failed: ", error);
                alert("Failed to save to cloud. Check your connection.");
                return false;
            }
            return true;
        }

        async function loadQuoteById(id) {
            if (!id) return;
            for (let i = 0; i < 50 && !catalog.length; i++) { await new Promise(r => setTimeout(r, 200)); }
            if (!catalog.length) return alert('The labor catalog is still loading. Please try again.');

            try {
                const docSnap = await db.collection("quotes").doc(id).get();
                if (docSnap.exists && !canSeeAllQuotes() && !docSnap.data().isTemplate && ((docSnap.data().project || {}).salesManagerName !== (currentUserProfile && currentUserProfile.name))) {
                    return alert('That quote belongs to another sales rep.');
                }
                if (docSnap.exists) {
                    const record = docSnap.data();
                    const savedItems = Array.isArray(record.items) ? record.items : (Array.isArray(record.quoteCart) ? record.quoteCart : []);
                    const { rebuilt, missing } = rebuildQuoteCart(savedItems);

                    quoteCart = rebuilt;
                    rebuilt.forEach(item => {
                        if (!item.isCustom && item.addon) { tileAddons[tileAddonKey(item.id, item.zone || 'General')] = { ...item.addon }; }
                    });
                    localStorage.setItem('asbcTileAddons', JSON.stringify(tileAddons));
                    applyProjectData(record.project);
                    
                    recyclingToggle.value = record.options?.recycling || 'no';
                    customRecyclingInput.value = record.options?.customRecycling || '';
                    
                    crewSize.value = record.options?.crewSize || '1';
                    pricingV2 = record.options?.pricingV === 2;
                    document.getElementById('siteConditions').value = record.options?.site || 'standard';
                    document.getElementById('tripToggle').value = record.options?.trip || 'yes';
                    document.getElementById('pmToggle').value = record.options?.pm || (record.options?.pricingV === 2 ? 'yes' : 'no'); // quotes saved before v8.21.3 were priced with PM
                    
                    currentLoadedIsTemplate = !!record.isTemplate;
                    currentLoadedOwner = (record.project && record.project.salesManagerName) || '';
                    isTemplateCheckbox.checked = currentLoadedIsTemplate;
                    isLockedCheckbox.checked = !!record.isLocked;
                    currentActuals = record.actuals || null;
                    currentLoadedEstimateId = id;
                    hasUnsavedCloudChanges = false; updateSaveIndicator();
                    
                    renderCatalog();
                    renderQuote();

                    if (missing.length) {
                        alert(`Loaded with ${missing.length} missing catalog item(s): ${missing.join(', ')}`);
                    }
                } else {
                    alert("Quote not found in the cloud database.");
                }
            } catch (error) {
                console.error("Cloud load failed: ", error);
                alert("Failed to load estimate from cloud.");
            }
        }


        function escapeHtml(value) {
            return String(value).replace(/[&<>'"]/g, character => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
            }[character]));
        }

        // v8.21.2: category buttons grouped by trade, short labels, counts, one scrolling row
        const CATEGORY_GROUPS = [
            ['Audio & Video', ['Bang & Olufsen Audio', 'Audio (Other Brands)', 'TV & Home Theater', 'Kaleidescape']],
            ['Control', ['Control', 'Basalte', 'Lighting & Shading']],
            ['Network & Security', ['Networking', 'Security Cameras', 'Access Control']],
            ['Infrastructure', ['Wire Runs', 'Rack / Backbox / Structured Media', 'Service']],
        ];
        const CATEGORY_SHORT = { 'Bang & Olufsen Audio': 'B&O', 'Audio (Other Brands)': 'Other Audio', 'TV & Home Theater': 'TV & Theater', 'Control': 'Control4 / Josh', 'Lighting & Shading': 'Lighting & Shades', 'Security Cameras': 'Cameras', 'Rack / Backbox / Structured Media': 'Racks & SME' };
        const catShort = c => CATEGORY_SHORT[c] || c;
        function buildCategoryButtons() {
            const counts = {};
            catalog.forEach(i => { if (i.category !== 'Project Management') counts[i.category] = (counts[i.category] || 0) + 1; }); // PM is automatic since v8.12
            const present = new Set(Object.keys(counts));
            const groups = CATEGORY_GROUPS.map(([g, cats]) => [g, cats.filter(c => present.has(c))]).filter(g => g[1].length);
            const placed = new Set(groups.flatMap(g => g[1]));
            const extra = [...present].filter(c => !placed.has(c)).sort();
            if (extra.length) groups.push(['Other', extra]);
            if (selectedCategory !== 'All' && !present.has(selectedCategory)) selectedCategory = 'All';
            categoryButtons.innerHTML = '';
            const chip = (category, label, n) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.innerHTML = `${escapeHtml(label)}<span class="cat-count">${n}</span>`;
                button.title = category;
                button.className = 'category-button shrink-0 whitespace-nowrap h-8 px-2.5 sm:px-3 rounded-full border border-line bg-card text-ink text-xs sm:text-[13px] transition-colors duration-200 hv-border-accent';
                button.dataset.category = category;
                button.addEventListener('click', () => {
                    selectedCategory = category;
                    updateCategoryButtonStyles();
                    renderCatalog();
                });
                categoryButtons.appendChild(button);
            };
            chip('All', 'All', Object.values(counts).reduce((a, b) => a + b, 0));
            groups.forEach(([g, cats]) => {
                const lab = document.createElement('span');
                lab.className = 'cat-group-label shrink-0 hidden sm:inline';
                lab.textContent = g;
                categoryButtons.appendChild(lab);
                cats.forEach(c => chip(c, catShort(c), counts[c]));
            });
            updateCategoryButtonStyles();
            updateCategoryFades();
        }
        function updateCategoryFades() {
            const el = categoryButtons, wrap = el.parentElement;
            const atStart = el.scrollLeft <= 2, atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
            wrap.classList.toggle('fade-l', !atStart); wrap.classList.toggle('fade-r', !atEnd);
        }
        function scrollCategories(dir) { categoryButtons.scrollBy({ left: dir * Math.max(200, categoryButtons.clientWidth * 0.7), behavior: 'smooth' }); }
        categoryButtons.addEventListener('scroll', updateCategoryFades, { passive: true });
        window.addEventListener('resize', updateCategoryFades);

        function updateCategoryButtonStyles() {
            document.querySelectorAll('.category-button').forEach(button => {
                const on = button.dataset.category === selectedCategory;
                button.classList.toggle('category-active', on);
            });
        }

        function getVisibleCatalogItems() {
            const searchText = searchInput.value.trim().toLowerCase();
            return catalog.filter(item => {
                if (item.category === 'Project Management') return false; // automatic since v8.12
                const matchesCategory = selectedCategory === 'All' || !!searchText || item.category === selectedCategory; // v8.21.2: search looks in every category
                const matchesSearch = !searchText || `${item.name} ${item.category}`.toLowerCase().includes(searchText);
                const matchesFavorite = !favoritesOnly || favoriteIds.has(item.id);
                return matchesCategory && matchesSearch && matchesFavorite;
            }).sort((a, b) => searchText && selectedCategory !== 'All' ? (b.category === selectedCategory) - (a.category === selectedCategory) : 0);
        }

        function updateViewToggleButton() {
            if (isListView) {
                viewToggleButton.innerHTML = `<svg class="w-3.5 h-3.5 fill-current mr-1.5" viewBox="0 0 16 16"><path d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 0h5v5H9V9z"/></svg> Grid`;
            } else {
                viewToggleButton.innerHTML = `<svg class="w-3.5 h-3.5 fill-current mr-1.5" viewBox="0 0 16 16"><path d="M2 4h12v2H2V4zm0 6h12v2H2v-2z"/></svg> List`;
            }
        }

        viewToggleButton.addEventListener('click', () => {
            isListView = !isListView;
            localStorage.setItem('asbcListView', isListView);
            updateViewToggleButton();
            renderCatalog();
        });

        // v9.3.0 hours that learn from real jobs: stats/items holds, per catalog item, quantity + quoted + actual hours from submitted job reports.
        // When 3+ jobs disagree with the catalog by 20%+, the product shows the real average; admins can apply it to the catalog in one tap.
        let ITEM_STATS = {};
        async function loadItemStats() { try { const s = await db.collection('stats').doc('items').get(); ITEM_STATS = (s.exists && s.data().items) || {}; if (typeof renderCatalog === 'function') renderCatalog(); } catch (e) {} }
        function learnedFor(item) { const st = ITEM_STATS[item.id]; if (!st || (st.n || 0) < 3 || !(st.qty > 0) || !(st.est > 0)) return null;
            const est = (Number(item.installHours) || 0) + (Number(item.programmingHours) || 0), act = st.act / st.qty; if (!(est > 0) || Math.abs(act - est) / est < 0.2) return null; return { est, act, n: st.n }; }
        function learnedHtml(item) { const l = learnedFor(item); if (!l) return '';
            return `<div class="text-[11px] mt-1" style="color:${l.act > l.est ? '#A1440B' : '#0E7A4D'}">Real jobs: ${l.act.toFixed(2)} hrs/unit vs ${l.est.toFixed(2)} in the catalog (${l.n} jobs)${isAdminUser() ? ` <button type="button" data-learn="${item.id}" class="underline text-accent ml-1">Apply</button>` : ''}</div>`; }
        document.addEventListener('click', async e => { const b = e.target.closest('[data-learn]'); if (!b || !isAdminUser()) return; e.preventDefault(); e.stopPropagation();
            const item = catalog.find(i => i.id === b.dataset.learn), l = item && learnedFor(item); if (!l) return;
            const f = l.act / l.est;
            if (!confirm(`Update ${item.name}?\n\nInstall ${item.installHours.toFixed(2)} → ${(item.installHours * f).toFixed(2)} hrs, programming ${item.programmingHours.toFixed(2)} → ${(item.programmingHours * f).toFixed(2)} hrs (based on ${l.n} real jobs).`)) return;
            item.installHours = Math.round(item.installHours * f * 4) / 4; item.programmingHours = Math.round(item.programmingHours * f * 4) / 4;
            await persistCatalog(); renderCatalog(); });
        function renderCatalog() {
            const visibleItems = getVisibleCatalogItems();
            const currentZone = activeZone.value.trim() || 'General';
            productGrid.innerHTML = '';
            const _search = searchInput.value.trim();
            const _inCat = selectedCategory === 'All' ? 0 : visibleItems.filter(i => i.category === selectedCategory).length;
            document.getElementById('resultCount').textContent = `${visibleItems.length} product${visibleItems.length === 1 ? '' : 's'}` +
                (_search && selectedCategory !== 'All' ? ` · ${_inCat} in ${catShort(selectedCategory)} first, ${visibleItems.length - _inCat} in other categories` : '');

            if (visibleItems.length === 0) {
                productGrid.className = 'flex-1 overflow-y-auto p-2.5 sm:p-3 flex flex-col gap-2 content-start';
                productGrid.innerHTML = '<div class="col-span-full text-center text-mute py-12">No matching products.</div>';
                return;
            }

            if (isListView) {
                productGrid.className = 'flex-1 overflow-y-auto p-2.5 sm:p-3 flex flex-col gap-2 content-start';
            } else {
                productGrid.className = 'flex-1 overflow-y-auto p-2.5 sm:p-3 grid grid-cols-1 lg:grid-cols-2 gap-2.5 sm:gap-3 content-start';
            }

            visibleItems.forEach(item => {
                const quantity = findCartEntries(item.id, currentZone).reduce((sum, cartItem) => sum + (Number(cartItem.qty) || 0), 0);
                const tileAddon = getTileAddon(item.id);
                const itemAddonOptions = getProductAddonOptions(item);
                const card = document.createElement('article');

                if (isListView) {
                    card.className = 'bg-card border border-line rounded-xl p-2.5 flex items-center justify-between hv-border-accent transition-colors';
                    card.innerHTML = `
                        <div class="flex-1 min-w-0 pr-3">
                            <div class="flex items-center gap-2 mb-0.5">
                                <button type="button" data-favorite-id="${item.id}" class="favorite-button text-lg leading-none mt-[-2px] ${favoriteIds.has(item.id) ? 'text-accent' : 'text-mute'}">${favoriteIds.has(item.id) ? '★' : '☆'}</button>
                                <div class="text-[10px] text-accent uppercase tracking-wider truncate">${escapeHtml(item.category)}</div>
                            </div>
                            <h3 class="font-medium text-sm leading-snug truncate whitespace-nowrap">${escapeHtml(item.name)}</h3>
                            ${adminEditMode ? `<button type="button" data-admin-edit="${item.id}" class="admin-edit-btn mt-1">Edit</button>` : ''}
                            <div class="item-hours-display text-[10px] text-mute font-mono mt-0.5">${item.installHours.toFixed(2)} inst + ${item.programmingHours.toFixed(2)} prog${tileAddon ? ` + ${(tileAddon.installHours + tileAddon.programmingHours).toFixed(2)} add-on` : ''}</div>
                            ${itemAddonOptions ? `<select data-addon-product-id="${item.id}" class="addon-select mt-1">${addonOptionsHtml(tileAddon ? tileAddon.name : '', itemAddonOptions)}</select>` : ''}
                        </div>
                        <div class="flex items-center bg-soft rounded-xl overflow-hidden shrink-0">
                            <button type="button" data-product-id="${item.id}" data-change="-1" class="quantity-button w-9 h-9 text-lg">−</button>
                            <input type="number" inputmode="numeric" pattern="[0-9]*" min="0" step="1" value="${quantity}" data-qty-product-id="${item.id}" aria-label="Quantity" class="qty-input w-11 h-9 text-center text-sm font-mono font-bold">
                            <button type="button" data-product-id="${item.id}" data-change="1" class="quantity-button w-9 h-9 text-lg hv-go hv-text-on">+</button>
                        </div>
                    `;
                } else {
                    card.className = 'bg-card border border-line rounded-xl p-3 flex flex-col justify-between hv-border-accent transition-colors';
                    card.innerHTML = `
                        <div>
                            <div class="flex justify-between gap-3">
                                <div class="text-xs text-accent mb-1 uppercase tracking-wider">${escapeHtml(item.category)}</div>
                                <button type="button" data-favorite-id="${item.id}" class="favorite-button -mt-1.5 -mr-1.5 w-9 h-9 text-lg ${favoriteIds.has(item.id) ? 'text-accent' : 'text-mute'}">${favoriteIds.has(item.id) ? '★' : '☆'}</button>
                            </div>
                            <h3 class="font-medium text-sm leading-snug">${escapeHtml(item.name)}</h3>
                            ${adminEditMode ? `<button type="button" data-admin-edit="${item.id}" class="admin-edit-btn self-start mt-1">Edit</button>` : ''}
                        </div>
                        <div class="flex justify-between items-center gap-2 border-t border-line pt-2.5">
                            <div class="item-hours-display text-xs text-mute font-mono">${item.installHours.toFixed(2)} install + ${item.programmingHours.toFixed(2)} prog${tileAddon ? ` + ${(tileAddon.installHours + tileAddon.programmingHours).toFixed(2)} add-on` : ''}</div>
                            ${itemAddonOptions ? `<select data-addon-product-id="${item.id}" class="addon-select addon-select-row">${addonOptionsHtml(tileAddon ? tileAddon.name : '', itemAddonOptions)}</select>` : ''}
                            <div class="flex items-center bg-soft rounded-xl overflow-hidden shrink-0 ml-auto">
                                <button type="button" data-product-id="${item.id}" data-change="-1" class="quantity-button w-9 h-9 text-lg">−</button>
                                <input type="number" inputmode="numeric" pattern="[0-9]*" min="0" step="1" value="${quantity}" data-qty-product-id="${item.id}" aria-label="Quantity" class="qty-input w-11 h-9 text-center font-mono text-sm font-bold">
                                <button type="button" data-product-id="${item.id}" data-change="1" class="quantity-button w-9 h-9 text-lg hv-go hv-text-on">+</button>
                            </div>
                        </div>
                    `;
                }
                { const lb = learnedHtml(item); if (lb) { const t = card.querySelector('h3'); if (t) t.insertAdjacentHTML('afterend', lb); } }  // v9.3.0 learned hours
                productGrid.appendChild(card);
            });
        }

        function findCartEntries(productId, zone) {
            const z = zone || 'General';
            return quoteCart.filter(cartItem => cartItem.id === productId && (cartItem.zone || 'General') === z && !cartItem.isCustom);
        }
        function cartAddonKey(addon) { return addon ? addon.name : ''; }
        function findCartEntry(productId, zone, addon) {
            const wanted = cartAddonKey(addon);
            return findCartEntries(productId, zone).find(cartItem => cartAddonKey(cartItem.addon) === wanted) || null;
        }

        function addToQuote(productId) {
            if (!requireRoomSelected()) return;
            const item = catalog.find(catalogItem => catalogItem.id === productId);
            if (!item) return;

            const currentZone = activeZone.value.trim() || 'General';
            const addon = normalizeAddon(getTileAddon(productId));
            const existingItem = findCartEntry(productId, currentZone, addon);

            if (existingItem) { existingItem.qty = (Number(existingItem.qty) || 0) + 1; }
            else { quoteCart.push({ ...item, qty: 1, isCustom: false, zone: currentZone, addon }); }

            renderCatalog();
            renderQuote();
        }

        function updateProductQuantity(productId, change) {
            if (!requireRoomSelected()) return;
            const currentZone = activeZone.value.trim() || 'General';
            if (change > 0) return addToQuote(productId);

            const addon = normalizeAddon(getTileAddon(productId));
            const existingIndex = quoteCart.findIndex(cartItem => cartItem.id === productId && (cartItem.zone || 'General') === currentZone && !cartItem.isCustom && cartAddonKey(cartItem.addon) === cartAddonKey(addon));
            if (existingIndex === -1) return;

            quoteCart[existingIndex].qty = (Number(quoteCart[existingIndex].qty) || 0) - 1;
            if (quoteCart[existingIndex].qty <= 0) { quoteCart.splice(existingIndex, 1); }

            renderCatalog();
            renderQuote();
        }

        function parseTypedQty(value) {
            const n = Math.floor(Number(String(value).trim()));
            if (!Number.isFinite(n) || n < 0) return null;
            return Math.min(n, 9999);
        }

        function setProductQuantity(productId, value) {
            if (!requireRoomSelected()) { renderCatalog(); return; }
            const qty = parseTypedQty(value);
            if (qty === null) { renderCatalog(); return; }
            const item = catalog.find(catalogItem => catalogItem.id === productId);
            if (!item) return;
            const currentZone = activeZone.value.trim() || 'General';
            const addon = normalizeAddon(getTileAddon(productId));
            const wanted = cartAddonKey(addon);
            const entries = findCartEntries(productId, currentZone);
            const otherQty = entries.reduce((sum, cartItem) => sum + (cartAddonKey(cartItem.addon) === wanted ? 0 : (Number(cartItem.qty) || 0)), 0);

            if (qty === 0) {
                for (let i = quoteCart.length - 1; i >= 0; i--) {
                    const cartItem = quoteCart[i];
                    if (cartItem.id === productId && (cartItem.zone || 'General') === currentZone && !cartItem.isCustom) quoteCart.splice(i, 1);
                }
            } else {
                const target = qty - otherQty;
                const existingIndex = quoteCart.findIndex(cartItem => cartItem.id === productId && (cartItem.zone || 'General') === currentZone && !cartItem.isCustom && cartAddonKey(cartItem.addon) === wanted);
                if (target > 0) {
                    if (existingIndex !== -1) { quoteCart[existingIndex].qty = target; }
                    else { quoteCart.push({ ...item, qty: target, isCustom: false, zone: currentZone, addon }); }
                } else if (target === 0) {
                    if (existingIndex !== -1) { quoteCart.splice(existingIndex, 1); }
                } else {
                    for (let i = quoteCart.length - 1; i >= 0; i--) {
                        const cartItem = quoteCart[i];
                        if (cartItem.id === productId && (cartItem.zone || 'General') === currentZone && !cartItem.isCustom) quoteCart.splice(i, 1);
                    }
                    quoteCart.push({ ...item, qty, isCustom: false, zone: currentZone, addon });
                }
            }
            renderCatalog();
            renderQuote();
        }

        function setQuoteQuantity(quoteIndex, value) {
            if (!quoteCart[quoteIndex]) return;
            const qty = parseTypedQty(value);
            if (qty === null) { renderQuote(); return; }
            if (qty === 0) { quoteCart.splice(quoteIndex, 1); }
            else { quoteCart[quoteIndex].qty = qty; }
            renderCatalog();
            renderQuote();
        }

        function updateQuoteQuantity(quoteIndex, change) {
            if (!quoteCart[quoteIndex]) return;
            quoteCart[quoteIndex].qty = (Number(quoteCart[quoteIndex].qty) || 0) + change;
            if (quoteCart[quoteIndex].qty <= 0) { quoteCart.splice(quoteIndex, 1); }
            renderCatalog();
            renderQuote();
        }

        function renderQuote() {
            let totalInstall = 0, totalProgramming = 0, totalQuantity = 0;
            quoteList.innerHTML = '';

            const zonesObj = {};
            const zoneTotals = {};

            if (quoteCart.length === 0) {
                quoteList.innerHTML = '<div class="text-mute text-center mt-10 italic">No items added yet.</div>';
                document.getElementById('zoneBreakdownSection').classList.add('hidden');
            } else {
                document.getElementById('zoneBreakdownSection').classList.remove('hidden');

                quoteCart.forEach((item, originalIndex) => {
                    const z = item.zone || 'General';
                    if (!zonesObj[z]) zonesObj[z] = [];
                    zonesObj[z].push({ ...item, originalIndex });

                    const inst = Number(item.installHours) || 0;
                    const prog = Number(item.programmingHours) || 0;
                    const qty = Math.max(1, Number(item.qty) || 1);
                    const addonZoneHours = (Number(item.addon && item.addon.installHours) || 0) + (Number(item.addon && item.addon.programmingHours) || 0);
                    zoneTotals[z] = (zoneTotals[z] || 0) + ((inst + prog + addonZoneHours) * qty);
                });

                Object.keys(zonesObj).sort().forEach(zoneName => {
                    const zoneCard = document.createElement('div');
                    zoneCard.className = 'print-zone-card bg-card rounded-xl border border-line overflow-hidden';

                    const zoneHeader = document.createElement('div');
                    zoneHeader.className = 'print-zone-header bg-soft px-3 py-2 border-b border-line flex justify-between items-center cursor-pointer select-none';
                    zoneHeader.dataset.zoneToggle = zoneName;
                    
                    const zoneTotalHours = zoneTotals[zoneName] || 0;
                    const zoneCost = zoneTotalHours * HOURLY_RATE;

                    zoneHeader.innerHTML = `
                        <div class="text-[11px] text-accent uppercase tracking-wider font-bold"><span class="print-hide inline-block w-3 text-mute">${collapsedZones.has(zoneName) ? '▸' : '▾'}</span>${escapeHtml(zoneName)} <span class="print-hide normal-case tracking-normal font-normal text-mute">(${zonesObj[zoneName].length})</span><button type="button" data-rename-zone="${escapeHtml(zoneName)}" class="zone-rename-btn ml-2 print-hide" title="Rename this space">Rename</button></div>
                        <div class="text-[10px] text-mute font-mono">
                            ${isHoursShown ? `${zoneTotalHours.toFixed(2)} hrs · ` : ''}${currencyFormatter.format(zoneCost)}
                        </div>
                    `;
                    zoneCard.appendChild(zoneHeader);

                    const itemsContainer = document.createElement('div');
                    itemsContainer.className = 'divide-y divide-line' + (collapsedZones.has(zoneName) ? ' zone-collapsed' : '');

                    zonesObj[zoneName].forEach(item => {
                        const installHours = Number(item.installHours) || 0;
                        const programmingHours = Number(item.programmingHours) || 0;
                        const addonInst = Number(item.addon && item.addon.installHours) || 0;
                        const addonProg = Number(item.addon && item.addon.programmingHours) || 0;
                        const addonHoursPerItem = addonInst + addonProg;
                        const quantity = Math.max(1, Number(item.qty) || 1);
                        const totalHoursPerItem = installHours + programmingHours + addonHoursPerItem;

                        item.installHours = installHours;
                        item.programmingHours = programmingHours;
                        item.totalHours = totalHoursPerItem;
                        item.qty = quantity;

                        totalInstall += (installHours + addonInst) * quantity;
                        totalProgramming += (programmingHours + addonProg) * quantity;
                        totalQuantity += quantity;

                        const cartCatalogItem = (!item.isCustom && catalog.find(ci => ci.id === item.id)) || item;
                        const lineAddonOptions = (!item.isCustom && cartCatalogItem.addons && cartCatalogItem.addons.length) ? cartCatalogItem.addons : null;
                        const addonCell = lineAddonOptions
                            ? `<select data-quote-addon-index="${item.originalIndex}" class="addon-select mt-1 print-hide">${addonOptionsHtml(item.addon ? item.addon.name : '', lineAddonOptions)}</select>${item.addon ? `<div class="text-[11px] text-accent font-mono mt-0.5">+ ${(addonHoursPerItem * quantity).toFixed(2)} hrs add-on</div>` : ''}`
                            : (item.addon ? `<div class="text-[11px] text-accent font-mono mt-0.5">+ ${escapeHtml(item.addon.name)} · ${(addonHoursPerItem * quantity).toFixed(2)} hrs add-on</div>` : '');
                        const row = document.createElement('div');
                        row.className = 'print-item-row px-2.5 py-1.5 flex justify-between items-center hv-tint transition-colors';
                        row.innerHTML = `
                            <div class="flex-1 pr-3">
                                <div class="text-sm font-medium leading-tight mb-0.5 text-ink flex items-center gap-2">
                                    <span class="hidden print:inline-block w-3 h-3 border border-gray-400 rounded-sm"></span>
                                    <span>${escapeHtml(item.name)}${item.addon ? `<span class="hidden print:inline text-xs text-mute"> - ${escapeHtml(item.addon.name)}</span>` : ''}</span>
                                </div>
                                <div class="item-hours-display text-xs text-mute font-mono">${(totalHoursPerItem * quantity).toFixed(2)} hrs (${installHours.toFixed(2)} inst + ${programmingHours.toFixed(2)} prog)</div>
                                ${addonCell}
                            </div>
                            <div class="flex items-center bg-soft rounded-lg print-hide shrink-0">
                                <button type="button" data-quote-index="${item.originalIndex}" data-change="-1" class="quote-quantity-button w-8 h-8 text-lg">−</button>
                                <input type="number" inputmode="numeric" pattern="[0-9]*" min="0" step="1" value="${quantity}" data-qty-quote-index="${item.originalIndex}" aria-label="Quantity" class="qty-input w-10 h-8 text-center font-mono text-sm">
                                <button type="button" data-quote-index="${item.originalIndex}" data-change="1" class="quote-quantity-button w-8 h-8 text-lg">+</button>
                            </div>
                            <div class="hidden print:block text-xs font-mono font-bold text-ink">
                                Qty: ${quantity}
                            </div>
                        `;
                        itemsContainer.appendChild(row);
                    });

                    zoneCard.appendChild(itemsContainer);
                    quoteList.appendChild(zoneCard);
                });
            }

            // Render Zone Breakdown List
            const zoneBreakdownList = document.getElementById('zoneBreakdownList');
            zoneBreakdownList.innerHTML = Object.entries(zoneTotals).sort((a,b) => b[1] - a[1]).map(([zName, hrs]) => {
                const cost = hrs * HOURLY_RATE;
                return `
                    <div class="flex justify-between items-center text-mute">
                        <span class="truncate pr-2">${escapeHtml(zName)}</span>
                        <span class="font-mono text-ink shrink-0">
                            ${isHoursShown ? `<span class="text-mute mr-2">${hrs.toFixed(2)} hrs</span>` : ''}
                            <span class="text-accent font-medium">${currencyFormatter.format(cost)}</span>
                        </span>
                    </div>
                `;
            }).join('');

            // v8.12.0: all pricing comes from pricing.js (shared with the Quote Log).
            const siteConditions = document.getElementById('siteConditions');
            const tripToggle = document.getElementById('tripToggle');
            customRecyclingInput.classList.toggle('hidden', recyclingToggle.value !== 'custom');
            const priced = ASBCPricing.price(totalInstall, totalProgramming, totalQuantity, {
                pricingV: pricingV2 ? 2 : 1, site: siteConditions.value, trip: tripToggle.value, pm: document.getElementById('pmToggle').value,
                recycling: recyclingToggle.value, customRecycling: customRecyclingInput.value, crew: crewSize.value
            }, Object.assign({}, appSettings, { hourlyRate: HOURLY_RATE, recyclingFee: RECYCLING_FEE, materialsPct: getMarkupPercent() }));
            const totalHours = priced.billedHours;
            const recyclingFee = priced.recycling;
            const recyclingLabelText = recyclingToggle.value === 'custom' ? 'Recycling (Custom)' : 'Recycling fee';
            const markupPercent = getMarkupPercent(); // locked at 5% (v8.9.15)
            const materialsFee = priced.materials;
            const finalPrice = priced.total;
            const selectedCrewSize = Number(crewSize.value) || 1;
            const daysOnSite = priced.days;
            window.lastPriced = priced; window.lastUnits = totalQuantity; // used by the leaderboard tally on save
            const setRow = (row, valEl, val, show) => { document.getElementById(row).classList.toggle('hidden', !show); if (valEl) document.getElementById(valEl).textContent = val; };
            setRow('siteRow', 'siteHours', '+' + priced.siteHours.toFixed(2), priced.siteHours > 0);
            document.getElementById('siteLabel').textContent = `Site conditions (+${priced.sitePct}% install)`;
            setRow('pmRow', 'pmHours', priced.pmHours.toFixed(2), priced.pmHours > 0);
            document.getElementById('pmLabel').textContent = `Project management (${priced.settings.pmPct}%)`;
            setRow('commRow', 'commHours', priced.commHours.toFixed(2), false); // v8.21.3: testing & commissioning is shown inside install hours
            const minNote = document.getElementById('minNote');
            minNote.textContent = priced.minApplied ? `(${priced.settings.minHours}-hr minimum)` : '';
            minNote.classList.toggle('hidden', !priced.minApplied);
            setRow('tripRow', 'tripAmount', currencyFormatter.format(priced.trip), priced.trip > 0);
            document.getElementById('legacyPricingRow').classList.toggle('hidden', pricingV2);
            siteConditions.disabled = !pricingV2; tripToggle.disabled = !pricingV2;

            document.getElementById('installTotal').textContent = (totalInstall + priced.commHours).toFixed(2);
            document.getElementById('programmingTotal').textContent = totalProgramming.toFixed(2);
            document.getElementById('hoursTotal').textContent = totalHours.toFixed(2);
            
            document.getElementById('daysTotal').textContent = daysOnSite.toFixed(1) + ' days';
            updatePricingToggleSummary();
            document.getElementById('crewSizeDisplay').textContent = selectedCrewSize;

            document.getElementById('priceTotal').textContent = currencyFormatter.format(finalPrice);
            document.getElementById('quoteItemCount').textContent = `${totalQuantity} item${totalQuantity === 1 ? '' : 's'}`;
            document.getElementById('mobileItemCount').textContent = totalQuantity;
            document.getElementById('mobileHours').textContent = totalHours.toFixed(2);
            document.getElementById('mobilePrice').textContent = currencyFormatter.format(finalPrice);

            document.getElementById('recyclingRow').classList.toggle('hidden', recyclingFee === 0);
            document.getElementById('materialsRow').classList.toggle('hidden', materialsFee === 0);
            
            document.getElementById('recyclingLabel').textContent = recyclingLabelText;
            document.getElementById('recyclingAmount').textContent = currencyFormatter.format(recyclingFee);
            document.getElementById('materialsLabel').textContent = `Materials fee (${markupPercent}%)`;
            document.getElementById('materialsAmount').textContent = currencyFormatter.format(materialsFee);

            const categoryTotals = {};
            quoteCart.forEach(item => { categoryTotals[item.category] = (categoryTotals[item.category] || 0) + (item.totalHours * item.qty); });
            const breakdown = document.getElementById('categoryBreakdown');
            breakdown.innerHTML = quoteCart.length ? '<div class="text-xs uppercase tracking-wider text-mute mb-2 font-medium">Labor by category</div>' + Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([category, hours]) => `<div class="flex justify-between text-xs sm:text-sm text-mute"><span>${escapeHtml(category)}</span><span class="font-mono text-ink">${isHoursShown ? `${hours.toFixed(2)} hrs · ` : ''}${currencyFormatter.format(hours * HOURLY_RATE)}</span></div>`).join('') : '';

            // Update Print Header Details
            const data = currentProjectData();
            document.getElementById('printCustomerName').textContent = data.customerName || 'Standard Estimate';
            const printOppLine = document.getElementById('printOppLine');
            if (printOppLine) {
                const bits = [];
                if (data.dtoolsClientName) bits.push('Client: ' + data.dtoolsClientName);
                if (data.dtoolsOppNumber) bits.push('D-Tools #' + data.dtoolsOppNumber);
                printOppLine.textContent = bits.join(' · ');
                printOppLine.classList.toggle('hidden', !bits.length);
            }
            document.getElementById('printSalesManager').textContent = data.salesManagerName || 'ASBC Operations';
            document.getElementById('printDate').textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        }

        function prepareAndPrint() {
            if (quoteCart.length === 0) {
                alert('Add some items before generating a PDF.');
                return;
            }
            const missingFields = [];
            if (!customerName.value.trim()) missingFields.push('Opportunity Name');
            if (!salesManagerName.value.trim()) missingFields.push('Sales Manager');
            if (missingFields.length) {
                alert(`Please fill in the ${missingFields.join(' and the ')} field${missingFields.length > 1 ? 's' : ''} before generating a PDF.`);
                if (missingFields.length === 1) {
                    (missingFields[0] === 'Opportunity Name' ? customerName : salesManagerName).focus();
                } else {
                    customerName.focus();
                }
                return;
            }
            setPrintTitle(); window.print();
        }

        async function saveAndPrint() {
            if (quoteCart.length === 0) { alert('Add some items before generating a PDF.'); return; }
            const missingFields = [];
            if (!customerName.value.trim()) missingFields.push('Opportunity Name');
            if (!salesManagerName.value.trim()) missingFields.push('Sales Manager');
            if (missingFields.length) {
                alert(`Please fill in the ${missingFields.join(' and the ')} field${missingFields.length > 1 ? 's' : ''} before saving and printing.`);
                if (missingFields.length === 1) {
                    (missingFields[0] === 'Opportunity Name' ? customerName : salesManagerName).focus();
                } else {
                    customerName.focus();
                }
                return;
            }
            const ok = await saveEstimate(true);
            if (ok) { setPrintTitle(); window.print(); }
        }

        function toggleFavorite(itemId) {
            if (favoriteIds.has(itemId)) { favoriteIds.delete(itemId); } 
            else { favoriteIds.add(itemId); }
            localStorage.setItem('asbcFavoriteIds', JSON.stringify([...favoriteIds]));
            renderCatalog();
        }

        // v8.21.0: layout helpers
        function toggleWideEstimate(force) {
            const on = typeof force === 'boolean' ? force : !document.body.classList.contains('estimate-wide');
            document.body.classList.toggle('estimate-wide', on);
            localStorage.setItem('asbcWideEstimate', on ? '1' : '0');
            const b = document.getElementById('expandEstimateButton'); if (b) b.textContent = on ? 'Shrink' : 'Expand';
        }
        function togglePricingDetails(force) {
            const box = document.getElementById('pricingDetails');
            const open = typeof force === 'boolean' ? force : box.classList.contains('pricing-collapsed');
            box.classList.toggle('pricing-collapsed', !open);
            document.getElementById('pricingToggleIcon').textContent = open ? '▾' : '▸';
            localStorage.setItem('asbcPricingOpen', open ? '1' : '0');
        }
        function updatePricingToggleSummary() {
            const el = document.getElementById('pricingToggleSummary'); if (!el) return;
            const h = (document.getElementById('hoursTotal') || {}).textContent || '0.00';
            const d = (document.getElementById('daysTotal') || {}).textContent || '';
            el.textContent = h + ' hrs · ' + d;
        }
        // PDF file name = opportunity name (browsers use the page title as the default PDF name)
        const _appTitle = () => `Calculator | ASBC Tools v${APP_VERSION}`;
        function setPrintTitle() {
            const n = (customerName.value || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 120);
            if (n) document.title = n;
        }
        window.addEventListener('beforeprint', setPrintTitle);
        window.addEventListener('afterprint', () => { document.title = _appTitle(); });

        function toggleEstimate(show) {
            document.getElementById('estimatePanel').classList.toggle('estimate-open', show);
            document.getElementById('estimateBackdrop').classList.toggle('hidden', !show);
        }

        function toggleCustomModal(show) {
            const modal = document.getElementById('customItemModal');
            modal.classList.toggle('hidden', !show);
            modal.classList.toggle('flex', show);
            if (show) {
                document.getElementById('customName').value = '';
                document.getElementById('customInstall').value = '';
                document.getElementById('customProgramming').value = '';
                setTimeout(() => document.getElementById('customName').focus(), 50);
            }
        }

        function addCustomItem() {
            const name = document.getElementById('customName').value.trim() || 'Custom Labor';
            const installHours = Number(document.getElementById('customInstall').value) || 0;
            const programmingHours = Number(document.getElementById('customProgramming').value) || 0;

            if (installHours === 0 && programmingHours === 0) return alert('Please enter at least some labor hours.');

            const currentZone = activeZone.value.trim() || 'General';

            quoteCart.push({
                id: `custom-${Date.now()}`, category: 'Custom', name, installHours, programmingHours, totalHours: installHours + programmingHours, qty: 1, isCustom: true, zone: currentZone
            });

            toggleCustomModal(false);
            renderQuote();
            toggleEstimate(true);
        }

        /* ── Hidden Admin Modal & Sheet Logic ── */
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

        function populateAdminItemList() {
            const select = document.getElementById('adminItemSelect');
            const catList = document.getElementById('adminCategoryOptions');
            if (!select) return;

            select.innerHTML = '<option value="">-- Add Brand New Item --</option>';
            const sortedCatalog = [...catalog].sort((a, b) => a.name.localeCompare(b.name));
            sortedCatalog.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = `[${item.category}] ${item.name}`;
                select.appendChild(opt);
            });

            const uniqueCats = [...new Set(catalog.map(i => i.category))];
            catList.innerHTML = uniqueCats.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');

            const renameFrom = document.getElementById('adminRenameFrom');
            if (renameFrom) {
                const currentRename = renameFrom.value;
                renameFrom.innerHTML = '<option value="">-- Choose category --</option>' + uniqueCats.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
                if (uniqueCats.includes(currentRename)) renameFrom.value = currentRename;
            }
        }

        async function renameCategory() {
            const fromSel = document.getElementById('adminRenameFrom');
            const toInput = document.getElementById('adminRenameTo');
            const from = fromSel ? fromSel.value : '';
            const to = (toInput && toInput.value || '').trim();
            if (!from) { adminStatus.textContent = 'Choose a category to rename first.'; return; }
            if (!to) { adminStatus.textContent = 'Enter the new category name.'; return; }
            if (to === from) { adminStatus.textContent = 'New name is the same as the current one.'; return; }
            const matches = catalog.filter(i => i.category === from);
            if (!matches.length) { adminStatus.textContent = 'No items found in that category.'; return; }
            if (!confirm('Rename category "' + from + '" to "' + to + '"? This updates ' + matches.length + ' item' + (matches.length === 1 ? '' : 's') + ' in the cloud catalog.')) return;
            adminStatus.textContent = 'Renaming category...';
            try {
                catalog.forEach(i => { if (i.category === from) i.category = to; });
                await persistCatalog();
                if (selectedCategory === from) selectedCategory = to;
                populateAdminItemList();
                buildCategoryButtons();
                renderCatalog();
                toInput.value = '';
                fromSel.value = '';
                adminStatus.textContent = 'Renamed "' + from + '" to "' + to + '" (' + matches.length + ' items updated).';
            } catch (err) {
                adminStatus.textContent = 'Rename failed: ' + (err && err.message ? err.message : err);
            }
        }

        function attachSuggestions(input, listElId) {
            if (!input) return;
            let box = null;
            function hide() { if (box) { box.remove(); box = null; } }
            function show() {
                hide();
                const listEl = document.getElementById(listElId);
                if (!listEl) return;
                const options = [...listEl.querySelectorAll('option')].map(o => o.value || o.textContent).filter(Boolean);
                const q = (input.value || '').trim().toLowerCase();
                const matches = options.filter(o => !q || o.toLowerCase().includes(q)).slice(0, 40);
                if (!matches.length) return;
                box = document.createElement('div');
                box.className = 'suggestion-box';
                const rect = input.getBoundingClientRect();
                box.style.left = rect.left + 'px';
                box.style.top = (rect.bottom + 4) + 'px';
                box.style.width = rect.width + 'px';
                matches.forEach(m => {
                    const it = document.createElement('div');
                    it.className = 'suggestion-item';
                    it.textContent = m;
                    it.addEventListener('pointerdown', e => { e.preventDefault(); input.value = m; input.dispatchEvent(new Event('input', { bubbles: true })); hide(); });
                    box.appendChild(it);
                });
                document.body.appendChild(box);
            }
            input.removeAttribute('list');
            input.addEventListener('focus', show);
            input.addEventListener('input', show);
            input.addEventListener('blur', () => setTimeout(hide, 150));
            window.addEventListener('scroll', hide, true);
            window.addEventListener('resize', hide);
        }
                attachSuggestions(document.getElementById('adminCategory'), 'adminCategoryOptions');

        function forceAppRefresh() {
            const banner = document.createElement('div');
            banner.textContent = 'Updating app...';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:300;background:#1F6FD1;color:#FFFFFF;font:600 13px/1.4 sans-serif;text-align:center;padding:8px 12px;';
            document.body.appendChild(banner);
            (async () => {
                try {
                    if ('caches' in window) {
                        const keys = await caches.keys();
                        await Promise.all(keys.filter(k => k.startsWith('asbc-calc-')).map(k => caches.delete(k)));
                    }
                    if (navigator.serviceWorker) {
                        const reg = await navigator.serviceWorker.getRegistration();
                        if (reg && reg.update) await reg.update();
                    }
                } catch (e) { /* reload anyway */ }
                setTimeout(() => window.location.reload(), 700);
            })();
        }
        (function initLogoRefresh() {
            const logo = document.getElementById('asbcLogo');
            if (!logo) return;
            let clicks = 0, timer = null;
            logo.style.cursor = 'pointer';
            logo.title = 'Triple-tap to refresh the app';
            logo.addEventListener('click', () => {
                clicks++;
                clearTimeout(timer);
                timer = setTimeout(() => { clicks = 0; }, 1400);
                if (clicks >= 3) { clicks = 0; clearTimeout(timer); forceAppRefresh(); }
            });
        })();

        let selectedOriginalId = null;
        const adminItemSelect = document.getElementById('adminItemSelect');
        const adminCategory = document.getElementById('adminCategory');
        const adminName = document.getElementById('adminName');
        const adminInstall = document.getElementById('adminInstall');
        const adminProgramming = document.getElementById('adminProgramming');
        const adminStatus = document.getElementById('adminStatus');
        const adminSaveButton = document.getElementById('adminSaveButton');
        const adminDeleteButton = document.getElementById('adminDeleteButton');

        let adminAddons = [];

        function renderAdminAddons() {
            const wrap = document.getElementById('adminAddonsRows');
            if (!wrap) return;
            wrap.innerHTML = adminAddons.map((addon, index) => `
                <div class="grid grid-cols-[1fr_4.5rem_4.5rem_2rem] gap-1.5 items-center">
                    <input type="text" value="${escapeHtml(addon.name || '')}" placeholder="Add-on name" data-admin-addon-name="${index}" class="bg-card border border-line rounded-lg p-2 text-xs w-full">
                    <input type="number" min="0" step="0.25" value="${addon.installHours ?? ''}" placeholder="Inst" data-admin-addon-inst="${index}" class="bg-card border border-line rounded-lg p-2 text-xs w-full">
                    <input type="number" min="0" step="0.25" value="${addon.programmingHours ?? ''}" placeholder="Prog" data-admin-addon-prog="${index}" class="bg-card border border-line rounded-lg p-2 text-xs w-full">
                    <button type="button" onclick="removeAdminAddonRow(${index})" class="w-8 h-8 rounded-lg bg-soft text-bad text-sm">×</button>
                </div>
            `).join('');
        }
        function addAdminAddonRow() { adminAddons.push({ name: '', installHours: '', programmingHours: '' }); renderAdminAddons(); }
        function removeAdminAddonRow(index) { adminAddons.splice(index, 1); renderAdminAddons(); }
        function readAdminAddons() {
            const wrap = document.getElementById('adminAddonsRows');
            if (!wrap) return [];
            return [...wrap.querySelectorAll('[data-admin-addon-name]')].map(input => {
                const name = input.value.trim();
                if (!name) return null;
                const row = input.closest('.grid');
                const inst = Number(row.querySelector('[data-admin-addon-inst]').value) || 0;
                const prog = Number(row.querySelector('[data-admin-addon-prog]').value) || 0;
                return { name, installHours: inst, programmingHours: prog };
            }).filter(Boolean);
        }
        function setAdminAddons(list) { adminAddons = (list || []).map(addon => ({ ...addon })); renderAdminAddons(); }

        adminItemSelect.addEventListener('change', () => {
            const selectedId = adminItemSelect.value;
            if (!selectedId) {
                selectedOriginalId = null;
                adminCategory.value = '';
                adminName.value = '';
                adminName.readOnly = false;
                adminCategory.readOnly = false;
                adminInstall.value = '';
                adminProgramming.value = '';
                setAdminAddons([]);
                return;
            }

            const item = catalog.find(i => i.id === selectedId);
            if (item) {
                selectedOriginalId = item.id;
                adminCategory.value = item.category;
                adminName.value = item.name;
                adminInstall.value = item.installHours;
                adminProgramming.value = item.programmingHours;
                setAdminAddons(item.addons || []);
            }
        });

        function toggleAdminModal(show) {
            const modal = document.getElementById('adminItemModal');
            if (show) fillApprovedUsersEditor();
            modal.classList.toggle('hidden', !show);
            modal.classList.toggle('flex', show);
            adminStatus.textContent = '';
            if (show) {
                populateAdminItemList();
                adminItemSelect.value = '';
                selectedOriginalId = null;
                fillSettingsInputs();
                adminCategory.value = '';
                adminName.value = '';
                adminCategory.readOnly = false;
                adminName.readOnly = false;
                adminInstall.value = '';
                adminProgramming.value = '';
                setAdminAddons([]);
            }
        }

        async function persistCatalog() {
            localStorage.setItem('asbcCachedCatalog', JSON.stringify(catalog));
            const items = catalog.map(i => ({
                id: i.id, category: i.category, name: i.name,
                installHours: i.installHours, programmingHours: i.programmingHours,
                addons: (i.addons && i.addons.length) ? addonsToCell(i.addons) : ''
            }));
            await db.collection('config').doc('catalog').set({ items, updatedAt: new Date().toISOString() });
        }

        function migrateItemReferences(oldId, newId, newName) {
            if (favoriteIds.has(oldId)) { favoriteIds.delete(oldId); favoriteIds.add(newId); localStorage.setItem('asbcFavoriteIds', JSON.stringify([...favoriteIds])); }
            Object.keys(tileAddons).forEach(k => { if (k === oldId || k.indexOf(oldId + '|') === 0) { tileAddons[newId + k.slice(oldId.length)] = tileAddons[k]; delete tileAddons[k]; } });
            localStorage.setItem('asbcTileAddons', JSON.stringify(tileAddons));
            quoteCart.forEach(entry => { if (entry.id === oldId) { entry.id = newId; if (newName) entry.name = newName; } });
            scheduleDraftSave();
        }

        function fillSettingsInputs() {
            const h = document.getElementById('settingsHourly'); if (h) h.value = appSettings.hourlyRate;
            const r = document.getElementById('settingsRecycling'); if (r) r.value = appSettings.recyclingFee;
            const m = document.getElementById('settingsMarkup'); if (m) m.value = appSettings.defaultMarkup;
            const z = document.getElementById('settingsZones'); if (z) z.value = (appSettings.zonePresets || []).join('\n');
            const ps = ASBCPricing.settings(appSettings);
            document.querySelectorAll('[data-pset]').forEach(el => { el.value = ps[el.dataset.pset]; });
        }

        async function saveGlobalSettings() {
            const h = document.getElementById('settingsHourly');
            const r = document.getElementById('settingsRecycling');
            const m = document.getElementById('settingsMarkup');
            const z = document.getElementById('settingsZones');
            appSettings.hourlyRate = Number(h && h.value) || 200;
            appSettings.recyclingFee = Number(r && r.value) || 75;
            appSettings.defaultMarkup = 5; // locked
            appSettings.defaultRecyclingToggle = appSettings.defaultRecyclingToggle || 'no';
            appSettings.zonePresets = (z && z.value ? z.value.split('\n') : []).map(s => s.trim()).filter(Boolean);
            document.querySelectorAll('[data-pset]').forEach(el => { const v = Number(el.value); if (el.value !== '' && Number.isFinite(v)) appSettings[el.dataset.pset] = v; });
            localStorage.setItem('asbcAppSettings', JSON.stringify(appSettings));
            applyAppSettings();
            try {
                await db.collection('config').doc('settings').set(Object.assign({}, appSettings, { updatedAt: new Date().toISOString() }));
                adminStatus.innerHTML = '<span class="text-good">Global settings saved. Live everywhere.</span>';
            } catch (err) {
                adminStatus.innerHTML = `<span class="text-bad">Settings kept locally; cloud save failed: ${err.message}</span>`;
            }
        }

        function exportCatalogJson() {
            const items = catalog.map(i => {
                const clean = { id: i.id, category: i.category, name: i.name, installHours: i.installHours, programmingHours: i.programmingHours };
                if (i.addons && i.addons.length) clean.addons = i.addons;
                return clean;
            });
            const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'labor-catalog.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }

        let adminEditMode = false;
        function toggleAdminEditMode() {
            adminEditMode = !adminEditMode;
            const banner = document.getElementById('adminEditModeBanner');
            if (banner) banner.classList.toggle('hidden', !adminEditMode);
            const btn = document.getElementById('adminEditModeButton');
            if (btn) btn.textContent = adminEditMode ? 'Exit Card Edit Mode' : 'Toggle Card Edit Mode';
            renderCatalog();
        }

        let suppressDraftSave = false;
        let hasUnsavedCloudChanges = false;
        let draftSaveTimer = null;
        function scheduleDraftSave() {
            clearTimeout(draftSaveTimer);
            draftSaveTimer = setTimeout(saveActiveDraft, 400);
        }
        function saveActiveDraft() {
            try {
                localStorage.setItem('asbcActiveDraft', JSON.stringify({
                    cart: quoteCart,
                    customerName: customerName.value,
                    salesManagerName: salesManagerName.value,
                    dtoolsOpportunityId: currentProjectData().dtoolsOpportunityId,
                    oppMeta: currentOppMeta,
                    pricingV2, site: document.getElementById('siteConditions').value, trip: document.getElementById('tripToggle').value, pm: document.getElementById('pmToggle').value,
                    loadedEstimateId: currentLoadedEstimateId,
                    recyclingToggle: recyclingToggle.value,
                    customRecyclingInput: customRecyclingInput.value,
                    materialsMarkup: getMarkupPercent(),
                    crewSize: crewSize.value,
                    isTemplate: isTemplateCheckbox.checked,
                    isLocked: isLockedCheckbox ? isLockedCheckbox.checked : false,
                    savedAt: new Date().toISOString()
                }));
            } catch (_e) {}
            if (!suppressDraftSave) { hasUnsavedCloudChanges = true; updateSaveIndicator(); }
        }
        function updateSaveIndicator() {
            const btn = document.getElementById('saveQuoteButton');
            if (btn) btn.textContent = hasUnsavedCloudChanges ? 'Save \u2022' : 'Save';
        }
        function restoreActiveDraft() {
            try {
                const raw = localStorage.getItem('asbcActiveDraft'); if (!raw) return;
                const d = JSON.parse(raw);
                if (!d || !Array.isArray(d.cart) || !d.cart.length) return;
                if (quoteCart.length) return;
                suppressDraftSave = true;
                quoteCart = d.cart;
                if (typeof d.customerName === 'string') customerName.value = d.customerName;
                if (typeof d.salesManagerName === 'string') salesManagerName.value = d.salesManagerName;
                if (d.oppMeta && typeof d.oppMeta === 'object') currentOppMeta = { id: d.oppMeta.id || '', number: d.oppMeta.number || '', clientName: d.oppMeta.clientName || '' };
                currentLoadedEstimateId = d.loadedEstimateId || '';
                if (d.recyclingToggle) recyclingToggle.value = d.recyclingToggle;
                if (typeof d.customRecyclingInput === 'string') customRecyclingInput.value = d.customRecyclingInput;
                
                if (d.crewSize) crewSize.value = d.crewSize;
                if (typeof d.pricingV2 === 'boolean') pricingV2 = d.pricingV2;
                if (d.site) document.getElementById('siteConditions').value = d.site;
                if (d.trip) document.getElementById('tripToggle').value = d.trip;
                if (d.pm) document.getElementById('pmToggle').value = d.pm;
                if (typeof d.isTemplate === 'boolean') isTemplateCheckbox.checked = d.isTemplate;
                if (isLockedCheckbox && typeof d.isLocked === 'boolean') isLockedCheckbox.checked = d.isLocked;
                renderQuote();
            } catch (_e) {} finally { suppressDraftSave = false; }
        }

        function renameZone(oldZone) {
            const next = prompt(`Rename space "${oldZone}" to:`, oldZone);
            if (!next) return;
            const newZone = next.trim();
            if (!newZone || newZone === oldZone) return;
            quoteCart.forEach(item => { if ((item.zone || 'General') === oldZone) item.zone = newZone; });
            for (let i = quoteCart.length - 1; i >= 0; i--) {
                const a = quoteCart[i];
                if ((a.zone || 'General') !== newZone) continue;
                const dup = quoteCart.findIndex((c, j) => j < i && c.id === a.id && !c.isCustom && (c.zone || 'General') === newZone && cartAddonKey(c.addon) === cartAddonKey(a.addon));
                if (dup > -1) { quoteCart[dup].qty += a.qty; quoteCart.splice(i, 1); }
            }
            saveActiveDraft();
            renderCatalog();
            renderQuote();
        }

        async function saveAdminSheetItem() {
            const category = adminCategory.value.trim();
            const name = adminName.value.trim();
            const installHours = Number(adminInstall.value) || 0;
            const programmingHours = Number(adminProgramming.value) || 0;
            const addons = readAdminAddons();

            if (!category || !name) {
                alert("Category and Item Name are required.");
                return;
            }

            adminSaveButton.disabled = true;
            adminSaveButton.textContent = "Saving...";
            adminStatus.textContent = "Saving to cloud database...";

            try {
                const newId = getStableCatalogId({}, category, name);
                let idx = -1;
                if (selectedOriginalId) idx = catalog.findIndex(i => i.id === selectedOriginalId);
                if (idx === -1) idx = catalog.findIndex(i => i.name.toLowerCase() === name.toLowerCase() && i.category.toLowerCase() === category.toLowerCase());
                if (idx > -1) {
                    const oldId = catalog[idx].id;
                    catalog[idx] = { id: newId, category, name, installHours, programmingHours, totalHours: installHours + programmingHours, addons: addons.length ? addons : null };
                    if (newId !== oldId) migrateItemReferences(oldId, newId, name);
                } else {
                    catalog.push({ id: newId, category, name, installHours, programmingHours, totalHours: installHours + programmingHours, addons: addons.length ? addons : null });
                }
                await persistCatalog();
                selectedOriginalId = newId;
                renderCatalog();
                renderQuote();
                populateAdminItemList();

                adminStatus.innerHTML = `<span class="text-good">Saved. Live on every device.</span>`;
                setTimeout(() => { toggleAdminModal(false); }, 1200);

            } catch (err) {
                console.error("Failed to save catalog item:", err);
                adminStatus.innerHTML = `<span class="text-bad">Failed to save: ${err.message}</span>`;
            } finally {
                adminSaveButton.disabled = false;
                adminSaveButton.textContent = "Save Item";
            }
        }

        async function deleteAdminSheetItem() {
            const category = adminCategory.value.trim();
            const name = adminName.value.trim();

            if (!category || !name) {
                alert("Select an existing item (or enter its Category and Name) before deleting.");
                return;
            }

            if (!confirm('Delete "' + name + '" from the catalog? This cannot be undone.')) return;

            adminDeleteButton.disabled = true;
            adminDeleteButton.textContent = "Deleting...";
            adminStatus.textContent = "Deleting from cloud database...";

            try {
                const itemId = getStableCatalogId({}, category, name);
                const idx = catalog.findIndex(i => i.id === itemId) !== -1
                    ? catalog.findIndex(i => i.id === itemId)
                    : catalog.findIndex(i => i.name.toLowerCase() === name.toLowerCase() && i.category.toLowerCase() === category.toLowerCase());
                if (idx > -1) { catalog.splice(idx, 1); }
                favoriteIds.delete(itemId);
                Object.keys(tileAddons).forEach(k => { if (k === itemId || k.indexOf(itemId + '|') === 0) { delete tileAddons[k]; } });
                localStorage.setItem('asbcTileAddons', JSON.stringify(tileAddons));
                await persistCatalog();
                try { localStorage.setItem('asbcFavoriteIds', JSON.stringify([...favoriteIds])); } catch (_e2) {}

                renderCatalog();
                renderQuote();
                populateAdminItemList();

                adminStatus.innerHTML = '<span class="text-good">Deleted. Live on every device.</span>';
                setTimeout(() => { toggleAdminModal(false); }, 1200);
            } catch (err) {
                console.error("Failed to delete catalog item:", err);
                adminStatus.innerHTML = `<span class="text-bad">Failed to delete: ${err.message}</span>`;
            } finally {
                adminDeleteButton.disabled = false;
                adminDeleteButton.textContent = "Delete Item";
            }
        }

        function clearQuote() {
            if (quoteCart.length === 0 || window.confirm('Clear the entire estimate?')) {
                quoteCart = [];
                tileAddons = {};
                localStorage.setItem('asbcTileAddons', JSON.stringify(tileAddons));
                currentLoadedEstimateId = '';
                customerName.value = '';
                showOppNameField(false);
                if (dtoolsOpportunity) dtoolsOpportunity.value = '';
                currentOppMeta = { id: '', number: '', clientName: '' };
                salesManagerName.value = '';
                currentLoadedIsTemplate = false;
                isTemplateCheckbox.checked = false;
                if (isLockedCheckbox) isLockedCheckbox.checked = false;
                recyclingToggle.value = String(appSettings.defaultRecyclingToggle || 'no');
                customRecyclingInput.value = '';
                
                crewSize.value = '2';  // v10.0.1 default crew of 2
                pricingV2 = true;
                document.getElementById('siteConditions').value = 'standard';
                document.getElementById('tripToggle').value = 'no';  // v10.0.1 trip charge off by default
                document.getElementById('pmToggle').value = 'no';
                localStorage.removeItem('asbcActiveDraft');
                currentActuals = null;
                hasUnsavedCloudChanges = false; updateSaveIndicator();
                renderCatalog();
                renderQuote();
            }
        }

        async function shareQuote() {
            if (quoteCart.length === 0) {
                alert('Add some items to the quote first.');
                return;
            }
            const missingFields = [];
            if (!customerName.value.trim()) missingFields.push('Opportunity Name');
            if (!salesManagerName.value.trim()) missingFields.push('Sales Manager');
            if (missingFields.length) {
                alert(`Please fill in the ${missingFields.join(' and the ')} field${missingFields.length > 1 ? 's' : ''} before sharing the quote.`);
                if (missingFields.length === 1) {
                    (missingFields[0] === 'Opportunity Name' ? customerName : salesManagerName).focus();
                } else {
                    customerName.focus();
                }
                return;
            }

            const data = currentProjectData();
            const projectName = data.customerName || 'ASBC Estimate';
            const totalHours = document.getElementById('hoursTotal').textContent;
            const daysTotal = document.getElementById('daysTotal').textContent;
            const selectedCrew = crewSize.value;
            const totalPrice = document.getElementById('priceTotal').textContent;

            let shareText = `ASBC Labor Estimate\n`;
            shareText += `Project: ${projectName}\n`;
            if (data.salesManagerName) {
                shareText += `Sales Manager: ${data.salesManagerName}\n`;
            }
            shareText += `Total Labor: ${totalHours} hrs\n`;
            shareText += `Est. Schedule: ${daysTotal} (${selectedCrew} Techs)\n`;
            shareText += `Total Price: ${totalPrice}\n\n`;
            shareText += `Breakdown by Space:\n`;
            
            const zonesObj = {};
            quoteCart.forEach((item) => {
                const z = item.zone || 'General';
                if (!zonesObj[z]) zonesObj[z] = [];
                zonesObj[z].push(item);
            });

            Object.keys(zonesObj).sort().forEach(zoneName => {
                shareText += `\n[${zoneName}]\n`;
                zonesObj[zoneName].forEach(item => {
                    const addonLabel = item.addon ? ` (${item.addon.name})` : '';
                    if (!isHoursShown) {
                        shareText += `- ${item.qty}x ${item.name}${addonLabel}\n`;
                    } else {
                        shareText += `- ${item.qty}x ${item.name}${addonLabel} (${(item.totalHours * item.qty).toFixed(2)} hrs)\n`;
                    }
                });
            });

            if (navigator.share) {
                try {
                    await navigator.share({
                        title: `ASBC Estimate: ${projectName}`,
                        text: shareText
                    });
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        fallbackCopy(shareText);
                    }
                }
            } else {
                fallbackCopy(shareText);
            }
        }

        function fallbackCopy(text) {
            navigator.clipboard.writeText(text).then(() => {
                alert('Quote copied to clipboard! You can now paste it into an email or message.');
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Could not copy to clipboard.');
            });
        }

        productGrid.addEventListener('click', event => {
            const quantityButton = event.target.closest('.quantity-button');
            if (quantityButton) return updateProductQuantity(quantityButton.dataset.productId, Number(quantityButton.dataset.change));
            const favoriteButton = event.target.closest('.favorite-button');
            if (favoriteButton) toggleFavorite(favoriteButton.dataset.favoriteId);
        });

        productGrid.addEventListener('click', event => {
            const editBtn = event.target.closest('[data-admin-edit]');
            if (editBtn) {
                const item = catalog.find(i => i.id === editBtn.dataset.adminEdit);
                if (item) {
                    toggleAdminModal(true);
                    selectedOriginalId = item.id;
                    adminCategory.value = item.category;
                    adminName.value = item.name;
                    adminInstall.value = item.installHours;
                    adminProgramming.value = item.programmingHours;
                    setAdminAddons(item.addons || []);
                }
                return;
            }
            if (event.target.closest('.quantity-button')) scheduleDraftSave();
        });
        productGrid.addEventListener('input', scheduleDraftSave);
        quoteList.addEventListener('input', scheduleDraftSave);
        quoteList.addEventListener('change', scheduleDraftSave);
        let currentActuals = null;

        function actualsRowsFromCart() {
            return serializeQuoteCart().map(entry => {
                const catItem = catalog.find(i => i.id === entry.id);
                const name = entry.isCustom ? entry.name : (catItem ? catItem.name : entry.id);
                const base = entry.isCustom
                    ? (Number(entry.installHours) || 0) + (Number(entry.programmingHours) || 0)
                    : (catItem ? (catItem.installHours + catItem.programmingHours) : 0);
                const addonHours = entry.addon ? (Number(entry.addon.installHours) || 0) + (Number(entry.addon.programmingHours) || 0) : 0;
                const est = Math.round(((base + addonHours) * entry.qty) * 100) / 100;
                const prev = ((currentActuals && currentActuals.lines) || []).find(l => l.id === entry.id && (l.zone || 'General') === (entry.zone || 'General'));
                return { id: entry.id, name, zone: entry.zone || 'General', qty: entry.qty, estHours: est, actualHours: prev && prev.actualHours != null ? prev.actualHours : '' };
            });
        }

        function toggleActualsModal(show) {
            const modal = document.getElementById('actualsModal');
            if (!show) { modal.classList.add('hidden'); modal.classList.remove('flex'); return; }
            if (quoteCart.length === 0) { alert('Add some items first.'); return; }
            if (!currentLoadedEstimateId) { alert('Save the quote first (Save/Print), then log actuals against it.'); return; }
            const rows = actualsRowsFromCart();
            document.getElementById('actualsList').innerHTML = rows.map((row, i) => `
                <div class="flex items-center gap-2 bg-card border border-line rounded-lg p-2">
                    <div class="flex-1 min-w-0">
                        <div class="text-sm text-ink truncate">${escapeHtml(row.name)}${row.qty > 1 ? ` ×${row.qty}` : ''}</div>
                        <div class="text-[10px] text-mute">${escapeHtml(row.zone)} · est ${row.estHours.toFixed(2)} hrs</div>
                    </div>
                    <input type="number" min="0" step="0.25" inputmode="decimal" data-actual-index="${i}" value="${row.actualHours}" placeholder="actual" class="w-24 bg-card border border-line rounded-lg p-2 text-sm text-ink text-right font-mono">
                </div>
            `).join('');
            document.getElementById('actualsNotes').value = (currentActuals && currentActuals.notes) || '';
            document.getElementById('actualsStatus').textContent = '';
            updateActualsTotals();
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        function updateActualsTotals() {
            const rows = actualsRowsFromCart();
            const inputs = [...document.querySelectorAll('#actualsList [data-actual-index]')];
            const estTotal = rows.reduce((s, r) => s + r.estHours, 0);
            let actTotal = 0; let entered = 0;
            rows.forEach((row, i) => {
                const raw = inputs[i] ? inputs[i].value : '';
                const v = Number(raw);
                if (raw !== '' && Number.isFinite(v)) { actTotal += v; entered++; }
            });
            document.getElementById('actualsTotals').innerHTML =
                `<span>Estimate: ${estTotal.toFixed(2)} hrs</span>` +
                `<span class="${actTotal > estTotal ? 'text-bad' : 'text-good'}">Actual${entered ? ` (${entered} line${entered > 1 ? 's' : ''})` : ''}: ${actTotal.toFixed(2)} hrs</span>`;
        }

        async function saveActuals() {
            const quoteId = currentLoadedEstimateId;
            if (!quoteId) { alert('Save the quote first, then log actuals.'); return; }
            const rows = actualsRowsFromCart();
            const inputs = [...document.querySelectorAll('#actualsList [data-actual-index]')];
            const lines = [];
            rows.forEach((row, i) => {
                const raw = inputs[i] ? inputs[i].value : '';
                if (raw !== '' && raw != null) {
                    const v = Number(raw);
                    if (Number.isFinite(v) && v >= 0) lines.push({ id: row.id, name: row.name, zone: row.zone, qty: row.qty, estHours: row.estHours, actualHours: v });
                }
            });
            if (!lines.length) { alert('Enter at least one actual hours value.'); return; }
            const totalEst = rows.reduce((s, r) => s + r.estHours, 0);
            const totalActual = lines.reduce((s, r) => s + r.actualHours, 0);
            const payload = {
                lines,
                totalEstHours: Math.round(totalEst * 100) / 100,
                totalActualHours: Math.round(totalActual * 100) / 100,
                notes: document.getElementById('actualsNotes').value.trim(),
                savedAt: new Date().toISOString()
            };
            const saveBtn = document.getElementById('actualsSaveButton');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            document.getElementById('actualsStatus').textContent = 'Saving actual hours...';
            try {
                await db.collection('quotes').doc(quoteId).set({ actuals: payload, updatedAt: new Date() }, { merge: true });
                currentActuals = payload;
                document.getElementById('actualsStatus').innerHTML = '<span class="text-good">Actual hours saved to the quote.</span>';
                setTimeout(() => toggleActualsModal(false), 1000);
            } catch (err) {
                console.error('Failed to save actuals:', err);
                document.getElementById('actualsStatus').innerHTML = `<span class="text-bad">Save failed: ${err.message}</span>`;
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Actuals';
            }
        }

        quoteList.addEventListener('click', event => {
            const zoneBtn = event.target.closest('[data-rename-zone]');
            if (zoneBtn) { renameZone(zoneBtn.dataset.renameZone); return; }
            const zt = event.target.closest('[data-zone-toggle]');
            if (zt) { const z = zt.dataset.zoneToggle; collapsedZones.has(z) ? collapsedZones.delete(z) : collapsedZones.add(z); renderQuote(); return; }
            const button = event.target.closest('.quote-quantity-button');
            if (!button) return;
            updateQuoteQuantity(Number(button.dataset.quoteIndex), Number(button.dataset.change));
        });

        productGrid.addEventListener('change', event => {
            const addonSelect = event.target.closest('[data-addon-product-id]');
            if (addonSelect) {
                const productItem = catalog.find(cat => cat.id === addonSelect.dataset.addonProductId);
                const options = (productItem && getProductAddonOptions(productItem)) || [];
                const pick = addonSelect.value === '' ? null : (options[Number(addonSelect.value)] || null);
                setTileAddon(addonSelect.dataset.addonProductId, pick);
                return;
            }
            const input = event.target.closest('[data-qty-product-id]');
            if (input) setProductQuantity(input.dataset.qtyProductId, input.value);
        });

        quoteList.addEventListener('change', event => {
            const quoteAddonSelect = event.target.closest('[data-quote-addon-index]');
            if (quoteAddonSelect) {
                const entry = quoteCart[Number(quoteAddonSelect.dataset.quoteAddonIndex)];
                if (entry) {
                    const src = catalog.find(ci => ci.id === entry.id) || entry;
                    const options = (src && Array.isArray(src.addons)) ? src.addons : [];
                    const pick = quoteAddonSelect.value === '' ? null : (options[Number(quoteAddonSelect.value)] || null);
                    const incoming = normalizeAddon(pick);
                    const lineIndex = Number(quoteAddonSelect.dataset.quoteAddonIndex);
                    const dupIndex = quoteCart.findIndex((c, i) => i !== lineIndex && c.id === entry.id && !c.isCustom && (c.zone || 'General') === (entry.zone || 'General') && cartAddonKey(c.addon) === cartAddonKey(incoming));
                    if (dupIndex > -1) { quoteCart[dupIndex].qty += entry.qty; quoteCart.splice(lineIndex, 1); }
                    else { entry.addon = incoming; }
                    scheduleDraftSave();
                    renderCatalog();
                    renderQuote();
                }
                return;
            }
            const input = event.target.closest('[data-qty-quote-index]');
            if (input) setQuoteQuantity(Number(input.dataset.qtyQuoteIndex), input.value);
        });

        [productGrid, quoteList].forEach(container => {
            container.addEventListener('focusin', event => {
                if (event.target.classList && event.target.classList.contains('qty-input')) event.target.select();
            });
            container.addEventListener('keydown', event => {
                if (event.key === 'Enter' && event.target.classList && event.target.classList.contains('qty-input')) { event.preventDefault(); event.target.blur(); }
            });
        });

        const _actualsListEl = document.getElementById('actualsList'); if (_actualsListEl) _actualsListEl.addEventListener('input', updateActualsTotals);
        searchInput.addEventListener('input', renderCatalog);
        activeZone.addEventListener('input', renderCatalog);
        activeZone.addEventListener('change', renderCatalog);
        customerName.addEventListener('input', renderQuote);
        salesManagerName.addEventListener('input', renderQuote);
        const dtoolsOpportunity = document.getElementById('dtoolsOpportunity');
        if (dtoolsOpportunity) {
        let dtoolsOppsCache = [];
        async function loadOppsForRep() {
            const rep = salesManagerName.value;
            dtoolsOpportunity.innerHTML = '<option value="">D-Tools opportunities</option>';
            if (!rep) return;
            dtoolsOpportunity.innerHTML = '<option value="">Loading opportunities…</option>';
            try {
                const snap = await db.collection('opportunities').where('owner', '==', rep).limit(200).get();
                dtoolsOppsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                dtoolsOppsCache.sort((a, b) => String(b.modifiedDate || '').localeCompare(String(a.modifiedDate || '')));
                const open = dtoolsOppsCache.filter(o => !o.isArchived && o.stage && !/lost|won|closed/i.test(o.stage));
                const list = open.length ? open : dtoolsOppsCache;
                let newestSync = 0;
                dtoolsOppsCache.forEach(o => { const t = o.updatedAt && o.updatedAt.toMillis ? o.updatedAt.toMillis() : Date.parse(o.updatedAt || '') || 0; if (t > newestSync) newestSync = t; });
                try { const sy = await db.collection('config').doc('sync').get(); const lr = sy.exists && sy.data().lastRun; if (lr) newestSync = lr.toMillis ? lr.toMillis() : (Date.parse(lr) || newestSync); } catch (e) { /* stamp is optional */ }
                const syncAgo = newestSync ? (() => { const m = Math.round((Date.now() - newestSync) / 60000); return m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; })() : '';
                dtoolsOpportunity.innerHTML = '<option value="">' + (list.length ? list.length + ' opportunity(ies): pick one' : 'No D-Tools opportunities') + (syncAgo ? ' (D-Tools synced ' + syncAgo + ')' : '') + '</option>';
                const manualOpt = document.createElement('option');
                manualOpt.value = 'manual';
                manualOpt.textContent = 'Manual (not in D-Tools)';
                dtoolsOpportunity.appendChild(manualOpt);
                for (const o of list) {
                    const opt = document.createElement('option');
                    opt.value = o.id;
                    opt.textContent = o.name + (o.clientName ? ' - ' + o.clientName : '');
                    dtoolsOpportunity.appendChild(opt);
                }
            } catch (e) {
                dtoolsOpportunity.innerHTML = '<option value="">Opportunities unavailable</option>';
            }
        }
        salesManagerName.addEventListener('change', loadOppsForRep);
        dtoolsOpportunity.addEventListener('change', () => {
            const o = dtoolsOppsCache.find(x => x.id === dtoolsOpportunity.value);
            if (o) { customerName.value = o.name; currentOppMeta = { id: o.id, number: o.number || '', clientName: o.clientName || '' }; showOppNameField(false); renderQuote(); scheduleDraftSave(); }
            else if (dtoolsOpportunity.value === 'manual') {
                currentOppMeta = { id: '', number: '', clientName: '' };
                const nm = window.prompt('Opportunity name:');
                if (nm && nm.trim()) { customerName.value = nm.trim(); renderQuote(); }
                else { dtoolsOpportunity.value = ''; }
            }
            else { showOppNameField(false); }
        });
        }
        customRecyclingInput.addEventListener('input', renderQuote);

        favoritesFilterButton.addEventListener('click', () => {
            favoritesOnly = !favoritesOnly;
            favoritesFilterButton.classList.toggle('favorites-active', favoritesOnly);
            favoritesFilterButton.textContent = favoritesOnly ? '★ Favorites' : '☆ Favorites';
            renderCatalog();
        });

        [recyclingToggle, crewSize, document.getElementById('siteConditions'), document.getElementById('tripToggle'), document.getElementById('pmToggle')].forEach(control => { control.addEventListener('change', () => { renderQuote(); scheduleDraftSave(); }); });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') { toggleCustomModal(false); toggleEstimate(false); toggleAdminModal(false); }
        });

        let deferredInstallPrompt = null;
        const installAppButton = document.getElementById('installAppButton');
        const installAppIcon = document.getElementById('installAppIcon');
        const installAppText = document.getElementById('installAppText');

        function setInstallIcon() {
            const ua = navigator.userAgent.toLowerCase();
            let svg = '';
            
            if (ua.includes('android')) {
                svg = `<svg class="w-4 h-4 fill-current" viewBox="0 0 576 512"><path d="M420.22 165.29a244 244 0 0 0 -264.44 0l-28.75-49.76a14.77 14.77 0 0 0 -20.19-5.41 14.65 14.65 0 0 0 -5.39 20l30.06 52.05A250.77 250.77 0 0 0 0 357.51h576a250.73 250.73 0 0 0 -131.51-175.34l30.05-52.05a14.63 14.63 0 0 0 -5.4-20 14.76 14.76 0 0 0 -20.18 5.41zm-247.96 109.13a29.15 29.15 0 1 1 29.14-29.15 29.16 29.16 0 0 1 -29.14 29.15zm231.48 0a29.15 29.15 0 1 1 29.15-29.15 29.16 29.16 0 0 1 -29.15 29.15z"/></svg>`;
            } else if (ua.includes('mac') || ua.includes('iphone') || ua.includes('ipad')) {
                svg = `<svg class="w-4 h-4 fill-current pb-[1px]" viewBox="0 0 384 512"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.3 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.3zM34.3 120.5c5.3-26.1 27.5-63.6 57.6-82.5 2.1-1.3 4.4-2.5 6.7-3.6 22.3-10.4 46.3-15.1 69.8-15.1 1.4 0 2.8 0 4.1.1 1.6 30.4-11.4 67.8-37.1 91.8-19.1 17.9-46 29.8-70.1 31.3-1.8.1-3.6.1-5.3.1-1.5 0-3-.1-4.5-.2-1.2-22.1 4.7-48.4 18.8-71.9z"/></svg>`;
            } else if (ua.includes('win')) {
                svg = `<svg class="w-4 h-4 fill-current" viewBox="0 0 448 512"><path d="M0 93.7l183.6-25.3v177.4H0V93.7zm0 324.6l183.6 25.3V268.4H0v149.9zm203.8 28L448 480V268.4H203.8v177.9zm0-380.6v180.1H448V32L203.8 65.7z"/></svg>`;
            }

            if (svg) installAppIcon.innerHTML = svg;
            installAppText.textContent = `Install`;
        }

        window.addEventListener('beforeinstallprompt', event => {
            event.preventDefault();
            deferredInstallPrompt = event;
            setInstallIcon();
            installAppButton.classList.remove('hidden');
        });

        installAppButton.addEventListener('click', async () => {
            if (!deferredInstallPrompt) return;
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            installAppButton.classList.add('hidden');
        });

        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            installAppButton.classList.add('hidden');
        });

        document.getElementById('versionNumber').textContent = `v${APP_VERSION} (${BUILD_DATE})`;
        document.title = `Calculator | ASBC Tools v${APP_VERSION}`;

        window.saveEstimate = saveEstimate;
        window.saveAndPrint = saveAndPrint;
        window.toggleCustomModal = toggleCustomModal;
        window.addCustomItem = addCustomItem;
        window.clearQuote = clearQuote;
        window.toggleEstimate = toggleEstimate;
        window.loadCatalog = loadCatalog;
        window.shareQuote = shareQuote;
        window.toggleAdminModal = toggleAdminModal;
        window.deleteAdminSheetItem = deleteAdminSheetItem;
        window.saveAdminSheetItem = saveAdminSheetItem;
        window.prepareAndPrint = prepareAndPrint;
        window.exportCatalogJson = exportCatalogJson;
        window.toggleAdminEditMode = toggleAdminEditMode;
        window.saveGlobalSettings = saveGlobalSettings;
        window.renameZone = renameZone;
        window.toggleActualsModal = toggleActualsModal;
        window.saveActuals = saveActuals;

        applyShowHoursState();
        applyProjectData();
        loadRepLeaderboard();
        let _bootQuoteId = new URLSearchParams(location.search).get('quote'); // opened after sign-in (see onAuthStateChanged)
        if (_bootQuoteId) history.replaceState(null, '', location.pathname + '?calc=1'); // v10.6.0 keep ?calc=1 so sign-in stays in the calculator (was sending Load to Home)
        if (localStorage.getItem('asbcWideEstimate') === '1') toggleWideEstimate(true);
        if (localStorage.getItem('asbcPricingOpen') === '1') togglePricingDetails(true);
        document.addEventListener('click', e => { const m = document.getElementById('moreTools'); if (m && m.classList.contains('open') && !e.target.closest('#moreTools') && !e.target.closest('#moreToolsButton')) m.classList.remove('open'); });
        
        restoreActiveDraft();
        loadAppSettings();
        loadCatalog();
    