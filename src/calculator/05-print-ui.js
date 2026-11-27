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
