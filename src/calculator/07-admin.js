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
                    <input type="text" value="${escapeHtml(addon.name || '')}" placeholder="Add-on name" data-admin-addon-name="${index}" class="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs w-full">
                    <input type="number" min="0" step="0.25" value="${addon.installHours ?? ''}" placeholder="Inst" data-admin-addon-inst="${index}" class="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs w-full">
                    <input type="number" min="0" step="0.25" value="${addon.programmingHours ?? ''}" placeholder="Prog" data-admin-addon-prog="${index}" class="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs w-full">
                    <button type="button" onclick="removeAdminAddonRow(${index})" class="w-8 h-8 rounded-lg bg-gray-800 text-red-400 text-sm">×</button>
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
                adminStatus.innerHTML = '<span class="text-green-400">Global settings saved. Live everywhere.</span>';
            } catch (err) {
                adminStatus.innerHTML = `<span class="text-red-400">Settings kept locally; cloud save failed: ${err.message}</span>`;
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

