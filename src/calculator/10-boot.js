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
    