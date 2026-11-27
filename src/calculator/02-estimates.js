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

