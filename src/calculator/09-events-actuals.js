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
                <div class="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg p-2">
                    <div class="flex-1 min-w-0">
                        <div class="text-sm text-white truncate">${escapeHtml(row.name)}${row.qty > 1 ? ` ×${row.qty}` : ''}</div>
                        <div class="text-[10px] text-textMuted">${escapeHtml(row.zone)} · est ${row.estHours.toFixed(2)} hrs</div>
                    </div>
                    <input type="number" min="0" step="0.25" inputmode="decimal" data-actual-index="${i}" value="${row.actualHours}" placeholder="actual" class="w-24 bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white text-right font-mono">
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
                `<span class="${actTotal > estTotal ? 'text-red-400' : 'text-green-400'}">Actual${entered ? ` (${entered} line${entered > 1 ? 's' : ''})` : ''}: ${actTotal.toFixed(2)} hrs</span>`;
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
                document.getElementById('actualsStatus').innerHTML = '<span class="text-green-400">Actual hours saved to the quote.</span>';
                setTimeout(() => toggleActualsModal(false), 1000);
            } catch (err) {
                console.error('Failed to save actuals:', err);
                document.getElementById('actualsStatus').innerHTML = `<span class="text-red-400">Save failed: ${err.message}</span>`;
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

