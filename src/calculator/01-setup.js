
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

        const APP_VERSION = '11.12.0';
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

