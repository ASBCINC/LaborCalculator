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

