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
                button.className = 'category-button shrink-0 whitespace-nowrap h-8 px-2.5 sm:px-3 rounded-full border border-[#242424] bg-[#0F0F0F] text-white text-xs sm:text-[13px] transition-colors duration-200 hover:border-[#555555]';
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
            return `<div class="text-[11px] mt-1" style="color:${l.act > l.est ? '#A1440B' : '#0E7A4D'}">Real jobs: ${l.act.toFixed(2)} hrs/unit vs ${l.est.toFixed(2)} in the catalog (${l.n} jobs)${isAdminUser() ? ` <button type="button" data-learn="${item.id}" class="underline text-brandGold ml-1">Apply</button>` : ''}</div>`; }
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
                productGrid.innerHTML = '<div class="col-span-full text-center text-textMuted py-12">No matching products.</div>';
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
                    card.className = 'bg-gray-900 border border-gray-700 rounded-xl p-2.5 flex items-center justify-between hover:border-brandGold transition-colors';
                    card.innerHTML = `
                        <div class="flex-1 min-w-0 pr-3">
                            <div class="flex items-center gap-2 mb-0.5">
                                <button type="button" data-favorite-id="${item.id}" class="favorite-button text-lg leading-none mt-[-2px] ${favoriteIds.has(item.id) ? 'text-brandGold' : 'text-textMuted'}">${favoriteIds.has(item.id) ? '★' : '☆'}</button>
                                <div class="text-[10px] text-brandGold uppercase tracking-wider truncate">${escapeHtml(item.category)}</div>
                            </div>
                            <h3 class="font-medium text-sm leading-snug truncate whitespace-nowrap">${escapeHtml(item.name)}</h3>
                            ${adminEditMode ? `<button type="button" data-admin-edit="${item.id}" class="admin-edit-btn mt-1">Edit</button>` : ''}
                            <div class="item-hours-display text-[10px] text-textMuted font-mono mt-0.5">${item.installHours.toFixed(2)} inst + ${item.programmingHours.toFixed(2)} prog${tileAddon ? ` + ${(tileAddon.installHours + tileAddon.programmingHours).toFixed(2)} add-on` : ''}</div>
                            ${itemAddonOptions ? `<select data-addon-product-id="${item.id}" class="addon-select mt-1">${addonOptionsHtml(tileAddon ? tileAddon.name : '', itemAddonOptions)}</select>` : ''}
                        </div>
                        <div class="flex items-center bg-gray-800 rounded-xl overflow-hidden shrink-0">
                            <button type="button" data-product-id="${item.id}" data-change="-1" class="quantity-button w-9 h-9 text-lg">−</button>
                            <input type="number" inputmode="numeric" pattern="[0-9]*" min="0" step="1" value="${quantity}" data-qty-product-id="${item.id}" aria-label="Quantity" class="qty-input w-11 h-9 text-center text-sm font-mono font-bold">
                            <button type="button" data-product-id="${item.id}" data-change="1" class="quantity-button w-9 h-9 text-lg hover:bg-brandGold hover:text-bgDark">+</button>
                        </div>
                    `;
                } else {
                    card.className = 'bg-gray-900 border border-gray-700 rounded-xl p-3 flex flex-col justify-between hover:border-brandGold transition-colors';
                    card.innerHTML = `
                        <div>
                            <div class="flex justify-between gap-3">
                                <div class="text-xs text-brandGold mb-1 uppercase tracking-wider">${escapeHtml(item.category)}</div>
                                <button type="button" data-favorite-id="${item.id}" class="favorite-button -mt-1.5 -mr-1.5 w-9 h-9 text-lg ${favoriteIds.has(item.id) ? 'text-brandGold' : 'text-textMuted'}">${favoriteIds.has(item.id) ? '★' : '☆'}</button>
                            </div>
                            <h3 class="font-medium text-sm leading-snug">${escapeHtml(item.name)}</h3>
                            ${adminEditMode ? `<button type="button" data-admin-edit="${item.id}" class="admin-edit-btn self-start mt-1">Edit</button>` : ''}
                        </div>
                        <div class="flex justify-between items-center gap-2 border-t border-gray-800 pt-2.5">
                            <div class="item-hours-display text-xs text-textMuted font-mono">${item.installHours.toFixed(2)} install + ${item.programmingHours.toFixed(2)} prog${tileAddon ? ` + ${(tileAddon.installHours + tileAddon.programmingHours).toFixed(2)} add-on` : ''}</div>
                            ${itemAddonOptions ? `<select data-addon-product-id="${item.id}" class="addon-select addon-select-row">${addonOptionsHtml(tileAddon ? tileAddon.name : '', itemAddonOptions)}</select>` : ''}
                            <div class="flex items-center bg-gray-800 rounded-xl overflow-hidden shrink-0 ml-auto">
                                <button type="button" data-product-id="${item.id}" data-change="-1" class="quantity-button w-9 h-9 text-lg">−</button>
                                <input type="number" inputmode="numeric" pattern="[0-9]*" min="0" step="1" value="${quantity}" data-qty-product-id="${item.id}" aria-label="Quantity" class="qty-input w-11 h-9 text-center font-mono text-sm font-bold">
                                <button type="button" data-product-id="${item.id}" data-change="1" class="quantity-button w-9 h-9 text-lg hover:bg-brandGold hover:text-bgDark">+</button>
                            </div>
                        </div>
                    `;
                }
                { const lb = learnedHtml(item); if (lb) { const t = card.querySelector('h3'); if (t) t.insertAdjacentHTML('afterend', lb); } }  // v9.3.0 learned hours
                productGrid.appendChild(card);
            });
        }

