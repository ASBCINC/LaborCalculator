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
                quoteList.innerHTML = '<div class="text-textMuted text-center mt-10 italic">No items added yet.</div>';
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
                    zoneCard.className = 'print-zone-card bg-gray-900 rounded-xl border border-gray-800 overflow-hidden';

                    const zoneHeader = document.createElement('div');
                    zoneHeader.className = 'print-zone-header bg-gray-800/80 px-3 py-2 border-b border-gray-800 flex justify-between items-center cursor-pointer select-none';
                    zoneHeader.dataset.zoneToggle = zoneName;
                    
                    const zoneTotalHours = zoneTotals[zoneName] || 0;
                    const zoneCost = zoneTotalHours * HOURLY_RATE;

                    zoneHeader.innerHTML = `
                        <div class="text-[11px] text-brandGold uppercase tracking-wider font-bold"><span class="print-hide inline-block w-3 text-textMuted">${collapsedZones.has(zoneName) ? '▸' : '▾'}</span>${escapeHtml(zoneName)} <span class="print-hide normal-case tracking-normal font-normal text-textMuted">(${zonesObj[zoneName].length})</span><button type="button" data-rename-zone="${escapeHtml(zoneName)}" class="zone-rename-btn ml-2 print-hide" title="Rename this space">Rename</button></div>
                        <div class="text-[10px] text-textMuted font-mono">
                            ${isHoursShown ? `${zoneTotalHours.toFixed(2)} hrs · ` : ''}${currencyFormatter.format(zoneCost)}
                        </div>
                    `;
                    zoneCard.appendChild(zoneHeader);

                    const itemsContainer = document.createElement('div');
                    itemsContainer.className = 'divide-y divide-gray-800/60' + (collapsedZones.has(zoneName) ? ' zone-collapsed' : '');

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
                            ? `<select data-quote-addon-index="${item.originalIndex}" class="addon-select mt-1 print-hide">${addonOptionsHtml(item.addon ? item.addon.name : '', lineAddonOptions)}</select>${item.addon ? `<div class="text-[11px] text-brandGold font-mono mt-0.5">+ ${(addonHoursPerItem * quantity).toFixed(2)} hrs add-on</div>` : ''}`
                            : (item.addon ? `<div class="text-[11px] text-brandGold font-mono mt-0.5">+ ${escapeHtml(item.addon.name)} · ${(addonHoursPerItem * quantity).toFixed(2)} hrs add-on</div>` : '');
                        const row = document.createElement('div');
                        row.className = 'print-item-row px-2.5 py-1.5 flex justify-between items-center hover:bg-gray-800/30 transition-colors';
                        row.innerHTML = `
                            <div class="flex-1 pr-3">
                                <div class="text-sm font-medium leading-tight mb-0.5 text-white flex items-center gap-2">
                                    <span class="hidden print:inline-block w-3 h-3 border border-gray-400 rounded-sm"></span>
                                    <span>${escapeHtml(item.name)}${item.addon ? `<span class="hidden print:inline text-xs text-gray-500"> - ${escapeHtml(item.addon.name)}</span>` : ''}</span>
                                </div>
                                <div class="item-hours-display text-xs text-textMuted font-mono">${(totalHoursPerItem * quantity).toFixed(2)} hrs (${installHours.toFixed(2)} inst + ${programmingHours.toFixed(2)} prog)</div>
                                ${addonCell}
                            </div>
                            <div class="flex items-center bg-gray-800 rounded-lg print-hide shrink-0">
                                <button type="button" data-quote-index="${item.originalIndex}" data-change="-1" class="quote-quantity-button w-8 h-8 text-lg">−</button>
                                <input type="number" inputmode="numeric" pattern="[0-9]*" min="0" step="1" value="${quantity}" data-qty-quote-index="${item.originalIndex}" aria-label="Quantity" class="qty-input w-10 h-8 text-center font-mono text-sm">
                                <button type="button" data-quote-index="${item.originalIndex}" data-change="1" class="quote-quantity-button w-8 h-8 text-lg">+</button>
                            </div>
                            <div class="hidden print:block text-xs font-mono font-bold text-black">
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
                    <div class="flex justify-between items-center text-textMuted">
                        <span class="truncate pr-2">${escapeHtml(zName)}</span>
                        <span class="font-mono text-white shrink-0">
                            ${isHoursShown ? `<span class="text-textMuted mr-2">${hrs.toFixed(2)} hrs</span>` : ''}
                            <span class="text-brandGold font-medium">${currencyFormatter.format(cost)}</span>
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
            breakdown.innerHTML = quoteCart.length ? '<div class="text-xs uppercase tracking-wider text-textMuted mb-2 font-medium">Labor by category</div>' + Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([category, hours]) => `<div class="flex justify-between text-xs sm:text-sm text-textMuted"><span>${escapeHtml(category)}</span><span class="font-mono text-white">${isHoursShown ? `${hours.toFixed(2)} hrs · ` : ''}${currencyFormatter.format(hours * HOURLY_RATE)}</span></div>`).join('') : '';

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

