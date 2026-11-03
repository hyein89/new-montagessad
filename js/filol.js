/**
 * Traffic Handler - Consolidated Logic
 * Handles all exit types (mainExit, autoexit, reverse, back)
 * Supports both Zone IDs and Direct URLs (with placeholders)
 */

(function () {
    // --- 1. Utilities ---
    var parsedConfig = null;

    // Pre-built URL cache (built once during init, used synchronously on trigger)
    var preBuiltUrls = {
        mainExit_currentTab: null,
        mainExit_newTab: null
    };

    // Get platform version (async)
    var getPlatformVersion = async () => {
        var nav = navigator;
        if (!nav.userAgentData) return "";
        try {
            var hints = ["platformVersion"];
            return (await nav.userAgentData.getHighEntropyValues(hints)).platformVersion;
        } catch (e) {
            console.error("Error retrieving pVersion", e);
            return "";
        }
    };

    // Get Timezone
    var getTimezone = () => {
        if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
            var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz) return tz;
        }
        return "";
    };

    // Get Timezone Offset
    var getTimezoneOffset = () => (new Date).getTimezoneOffset();

    // Helper to create URLSearchParams from object
    var createSearchParams = (obj) => {
        let params = new URLSearchParams();
        Object.keys(obj).forEach(key => {
            if (obj[key]) params.set(key, obj[key]);
        });
        return params;
    };

    // --- 2. Parameter Parsing ---

    var currentUrl = new URL(window.location.href);
    var urlParams = {
        pz: currentUrl.searchParams.get("pz") ?? "",
        tb: currentUrl.searchParams.get("tb") ?? "",
        tb_reverse: currentUrl.searchParams.get("tb_reverse") ?? "",
        ae: currentUrl.searchParams.get("ae") ?? "",
        z: currentUrl.searchParams.get("z") ?? "",
        var: currentUrl.searchParams.get("var") ?? "",
        var_1: currentUrl.searchParams.get("var_1") ?? "",
        var_2: currentUrl.searchParams.get("var_2") ?? "",
        var_3: currentUrl.searchParams.get("var_3") ?? "",
        b: currentUrl.searchParams.get("b") ?? "",
        campaignid: currentUrl.searchParams.get("campaignid") ?? "",
        abtest: currentUrl.searchParams.get("abtest") ?? "",
        rhd: currentUrl.searchParams.get("rhd") ?? "1",
        s: currentUrl.searchParams.get("s") ?? "",
        ymid: currentUrl.searchParams.get("ymid") ?? "",
        wua: currentUrl.searchParams.get("wua") ?? "",
        use_full_list_or_browsers: currentUrl.searchParams.get("use_full_list_or_browsers") ?? "",
        cid: currentUrl.searchParams.get("cid") ?? "",
        geo: currentUrl.searchParams.get("geo") ?? ""
    };

    // --- 3. URL Construction & Resolution ---

    // Resolve placeholders in URL (e.g. {{var_1}})
    var resolveUrl = (template, params) => {
        let url = template;
        Object.keys(params).forEach(key => {
            if (params[key]) {
                // Replace {{key}}, {{.key}}, {{ key }}
                const patterns = [
                    new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'),
                    new RegExp(`\\{\\{\\s*\\.${key}\\s*\\}\\}`, 'g')
                ];
                patterns.forEach(regex => {
                    url = url.replace(regex, params[key]);
                });
            }
        });
        return url;
    };

    // Build params object for Remoby zone links (/sm)
    var buildZoneParams = async ({ zone, passParamToParams }) => {
        const preservedClickId = urlParams.var_1;

        let paramsObj = {
            click_id: preservedClickId,
            ymid: preservedClickId,
            var: urlParams.var_2 ?? urlParams.z,
            var3: urlParams.var_3
        };

        if (zone) paramsObj.src = zone;

        // Custom param mapping if needed (rarely used but supported)
        let finalParams = createSearchParams(paramsObj);

        if (passParamToParams) {
            passParamToParams.forEach(mapping => {
                var { from, to, joinWith } = mapping;
                let val = Array.isArray(from)
                    ? from.map(p => currentUrl.searchParams.get(p) ?? "").filter(Boolean).join(joinWith ?? "")
                    : currentUrl.searchParams.get(from) ?? "";
                if (val) {
                    to.forEach(targetParam => finalParams.set(targetParam, val));
                }
            });
        }

        return finalParams;
    };

    // Construct full Zone URL
    var buildZoneUrl = async (zone, domain, passParamToParams) => { 
    let targetDomain = domain.includes("http") ? domain : "https://" + domain; 
    let baseUrl = new URL(targetDomain + "/4/" + zone.toString()); 
    let params = await buildZoneParams({ zone: zone.toString(), passParamToParams }); 
    return decodeURIComponent(baseUrl.toString() + "?" + params.toString()); 
};


    // --- 4. Navigation & Exit Logic ---

    // Simple redirect
    var redirect = (url) => {
        window.location.replace(url);
    };

    var exitError = (data, name) => {
        console.error(`${name || "Exit"} failed, missing data`, data);
    };

    var resolveDefaultBackHtmlBase = (origin, pathname) => {
        let backBase = `${origin}${pathname}`;
        if (backBase.includes("index.html")) {
            backBase = backBase.split("/index.html")[0];
        }
        if (backBase.includes("back.html")) {
            backBase = backBase.split("/back.html")[0];
        }
        if (backBase.endsWith("/")) {
            backBase = backBase.substring(0, backBase.length - 1);
        }
        return `${backBase}/back.html`;
    };

    var isBackTrapLocation = () => {
        try {
            return window.location.pathname.endsWith("/back.html");
        } catch (e) {
            return false;
        }
    };

    // Initialize Back Button Trap
    var initBack = async (config) => {
        var backConfig = config ? config.back : null;
        if (!backConfig) return;

        var currentTab = backConfig.currentTab;
        if (!currentTab) return;

        var count = backConfig.count ?? 3;
        var { origin, pathname } = window.location;
        var backUrl = new URL(resolveDefaultBackHtmlBase(origin, pathname));

        // Push state history
        var pushHistory = (urlStr) => {
            try {
                var originalUrl = window.location.href;
                for (let i = 0; i < count; i++) {
                    window.history.pushState(null, "Please wait...", urlStr);
                }
                window.history.pushState(null, document.title, originalUrl);
                console.log(`Back initialized ${count} times with ${urlStr}`);
            } catch (e) {
                console.error("Failed to push state", e);
            }
        };

        if (currentTab.url) {
            // URL Mode: Store template in SessionStorage, pass simple params
            try {
                sessionStorage.setItem("back_url_template", currentTab.url);
            } catch (err) {
                console.warn("SessionStorage error", err);
            }
            let params = createSearchParams(urlParams);
            params.set("use_template", "1");
            // Add domain for safety/logging
            try {
                let parsed = new URL(currentTab.url.includes("http") ? currentTab.url : "https://" + currentTab.url);
                params.set("domain", parsed.origin);
            } catch (e) { }

            pushHistory(backUrl.toString() + "?" + params.toString());

        } else if (currentTab.domain && currentTab.zoneId) {
            let zoneParams = await buildZoneParams({ zone: currentTab.zoneId });
            zoneParams.set("z", currentTab.zoneId);
            zoneParams.set("domain", currentTab.domain);
            zoneParams.forEach((value, key) => {
                backUrl.searchParams.set(key, value);
            });
            pushHistory(backUrl.toString());
        }
    };

    // Handle AutoExit and Reverse
    var handleExit = async (config, type, initBackFlag = true) => {
        var exitData = config[type] ? config[type].currentTab : null;
        console.log(type + " triggered", config);

        if (exitData) {
            let finalUrl;
            if (exitData.zoneId && exitData.domain) {
                finalUrl = await buildZoneUrl(exitData.zoneId, exitData.domain);
            } else if (exitData.url) {
                finalUrl = resolveUrl(exitData.url, urlParams);
            }

            if (finalUrl) {
                if (initBackFlag) await initBack(config);
                redirect(finalUrl);
                return;
            }
        }
        exitError(exitData, type);
    };

    // Handle MainExit (Click)
    // Uses pre-built URLs â€” FULLY SYNC for popup safety on all browsers
    var handleMainExit = (config, type, preOpenedNewTab = null) => {
        var exitConfig = config[type];
        console.log(type + " triggered (sync, pre-built)", config);

        if (exitConfig) {
            // Use pre-built URLs
            var currentUrlResolved = preBuiltUrls.mainExit_currentTab;
            var newUrlResolved = preBuiltUrls.mainExit_newTab;

            // Execute Navigation â€” ALL SYNC, no await
            let newTabOpened = preOpenedNewTab;
            if (newUrlResolved) {
                if (newTabOpened && !newTabOpened.closed) {
                    try {
                        newTabOpened.location.replace(newUrlResolved);
                    } catch (e) {
                        newTabOpened = window.open(newUrlResolved, "_blank");
                    }
                } else {
                    newTabOpened = window.open(newUrlResolved, "_blank");
                }

                if (newTabOpened) {
                    try {
                        newTabOpened.opener = null;
                    } catch (e) { }
                }
            }

            if (currentUrlResolved) {
                window.location.replace(currentUrlResolved);
            } else {
                exitError(exitConfig, type);
            }
        } else {
            exitError(exitConfig, type);
        }
    };

    // Uses pre-built URLs â€” sync where possible
    var handleMainExitNewImmediateCurrentOnReturn = (config, type, options = {}) => {
        var exitConfig = config[type];
        console.log(type + " triggered (new-immediate/current-on-return, pre-built)", config);

        if (!exitConfig) {
            exitError(exitConfig, type);
            return;
        }

        // Use pre-built URLs
        var currentUrlResolved = preBuiltUrls.mainExit_currentTab;
        var newUrlResolved = preBuiltUrls.mainExit_newTab;

        // Open new tab immediately â€” SYNC from user click
        let newTabOpened = null;
        if (newUrlResolved) {
            newTabOpened = window.open(newUrlResolved, "_blank");
            if (newTabOpened) {
                try {
                    newTabOpened.opener = null;
                } catch (e) { }
            }
        }

        if (!currentUrlResolved) {
            exitError(exitConfig, type);
            return;
        }

        var triggerDelay = parseInt(options.triggerDelayMs, 10);
        var triggerDelayMs = !isNaN(triggerDelay) && triggerDelay > 0 ? triggerDelay : 1000;
        var currentTabOnReturn = options.currentTabOnReturn === true;
        var requireHiddenBeforeCurrent = options.requireHiddenBeforeCurrent !== false;

        var currentRedirectStarted = false;
        var runCurrentRedirect = async () => {
            if (currentRedirectStarted) return;
            currentRedirectStarted = true;

            if (window.CAPTCHA_UI && typeof window.CAPTCHA_UI.startVerification === "function") {
                await window.CAPTCHA_UI.startVerification(triggerDelayMs);
            } else {
                await new Promise(resolve => setTimeout(resolve, triggerDelayMs));
            }

            window.location.replace(currentUrlResolved);
        };

        if (!currentTabOnReturn) {
            runCurrentRedirect();
            return;
        }

        var hiddenSeen = document.visibilityState === "hidden";
        var onVisibility = () => {
            if (document.visibilityState === "hidden") {
                hiddenSeen = true;
                return;
            }

            if (document.visibilityState === "visible") {
                if (!requireHiddenBeforeCurrent || hiddenSeen) {
                    document.removeEventListener("visibilitychange", onVisibility);
                    runCurrentRedirect();
                }
            }
        };

        document.addEventListener("visibilitychange", onVisibility);

        // Fallback: if browser blocks new tab, continue with current tab flow.
        if (!newTabOpened) {
            runCurrentRedirect();
        }
    };

    // --- 5. Configuration Parser ---

    var parseAppConfig = (rawConfig) => {
        if (typeof rawConfig === "undefined") {
            document.body.innerHTML = `<p>LANDING CAN'T BE RENDERED. PLEASE ADD CODE FROM PROPUSH.</p>`;
            return false;
        }

        let { domain, videoCount, prizeName, prizeImg, ...exits } = rawConfig;
        let parsed = { videoCount, prizeName, prizeImg };

        let tabs = ["currentTab", "newTab"];
        let types = ["zoneId", "url"];

        Object.entries(exits).forEach(([key, value]) => {
            let [exitName, tabOrType, type] = key.split("_");

            if (exitName) {
                if (!parsed[exitName]) parsed[exitName] = {};

                if (tabs.includes(tabOrType)) {
                    // e.g. mainExit_currentTab_url
                    let tab = tabOrType; // currentTab
                    // type is 'url' or 'zoneId'
                    if (types.includes(type)) {
                        parsed[exitName][tab] = {
                            ...parsed[exitName][tab],
                            domain: type === "zoneId" ? domain : undefined,
                            [type]: value
                        };
                    }
                } else if (types.includes(tabOrType)) {
                    // e.g. autoexit_url (implies currentTab)
                    let typeName = tabOrType;
                    parsed[exitName].currentTab = {
                        ...parsed[exitName].currentTab,
                        domain: typeName === "zoneId" ? domain : undefined,
                        [typeName]: value
                    };
                } else {
                    // e.g. autoexit_timeToRedirect
                    let setting = tabOrType;
                    parsed[exitName][setting] = value;
                }
            }
        });

        return parsed;
    };


    // --- 6. Initialization ---

    var init = async () => {
        parsedConfig = parseAppConfig(APP_CONFIG);
        if (!parsedConfig) return;

        // --- Pre-build URLs (async, runs once during init) ---
        try {
            var mainExitConf = parsedConfig.mainExit;
            if (mainExitConf) {
                if (mainExitConf.currentTab) {
                    if (mainExitConf.currentTab.zoneId && mainExitConf.currentTab.domain) {
                        preBuiltUrls.mainExit_currentTab = await buildZoneUrl(mainExitConf.currentTab.zoneId, mainExitConf.currentTab.domain);
                    } else if (mainExitConf.currentTab.url) {
                        preBuiltUrls.mainExit_currentTab = resolveUrl(mainExitConf.currentTab.url, urlParams);
                    }
                }
                if (mainExitConf.newTab) {
                    if (mainExitConf.newTab.zoneId && mainExitConf.newTab.domain) {
                        preBuiltUrls.mainExit_newTab = await buildZoneUrl(mainExitConf.newTab.zoneId, mainExitConf.newTab.domain);
                    } else if (mainExitConf.newTab.url) {
                        preBuiltUrls.mainExit_newTab = resolveUrl(mainExitConf.newTab.url, urlParams);
                    }
                }
            }
            // Pre-build back trap
            await initBack(parsedConfig);
            console.log("Pre-built URLs ready", preBuiltUrls);
        } catch (e) {
            console.error("URL pre-build error", e);
        }

        // 1. Setup Main Exit (Click Listener)
        var mainExitConfig = parsedConfig.mainExit || {};
        var mainExitTriggered = false;
        var triggerSelector = mainExitConfig.triggerSelector;
        var triggerDelay = parseInt(mainExitConfig.triggerDelayMs, 10);
        var triggerDelayMs = !isNaN(triggerDelay) && triggerDelay > 0 ? triggerDelay : 0;
        var openNewImmediately = mainExitConfig.openNewImmediately === true;
        var currentTabOnReturn = mainExitConfig.currentTabOnReturn === true;
        var requireHiddenBeforeCurrent = mainExitConfig.requireHiddenBeforeCurrent !== false;
        var shouldPreopenNewTab = mainExitConfig.preopenNewTab === true;

        var runMainExit = () => {
            if (mainExitTriggered) return;
            mainExitTriggered = true;

            if (openNewImmediately && currentTabOnReturn) {
                handleMainExitNewImmediateCurrentOnReturn(parsedConfig, "mainExit", {
                    triggerDelayMs: triggerDelayMs,
                    currentTabOnReturn: true,
                    requireHiddenBeforeCurrent: requireHiddenBeforeCurrent
                });
                return;
            }

            let preOpenedNewTab = null;
            if (triggerDelayMs > 0 && shouldPreopenNewTab && mainExitConfig.newTab) {
                try {
                    preOpenedNewTab = window.open("about:blank", "_blank");
                    if (preOpenedNewTab) {
                        preOpenedNewTab.opener = null;
                        try {
                            preOpenedNewTab.blur();
                            window.focus();
                        } catch (e) { }
                    }
                } catch (e) { }
            }

            if (triggerDelayMs > 0) {
                setTimeout(() => handleMainExit(parsedConfig, "mainExit", preOpenedNewTab), triggerDelayMs);
            } else {
                handleMainExit(parsedConfig, "mainExit", preOpenedNewTab);
            }
        };

        if (triggerSelector) {
            document.addEventListener("click", (event) => {
                let target = event.target;
                let triggerEl = target && target.closest ? target.closest(triggerSelector) : null;
                if (!triggerEl) return;
                if (triggerEl.getAttribute("data-main-exit-disabled") === "1") return;
                runMainExit();
            });
        } else {
            document.addEventListener("click", runMainExit);
        }

        // 2. Setup Auto Exit
        var autoExitConfig = parsedConfig.autoexit;
        // Check for 'ae' param override
        let aeParam = parseInt(urlParams.ae, 10);
        let timeout = !isNaN(aeParam) ? aeParam : (autoExitConfig ? (autoExitConfig.timeToRedirect ?? 90) : 90);

        if (timeout > 0 && autoExitConfig && autoExitConfig.currentTab) {
            const delay = timeout * 1000;
            let deadline = 0;
            let timerId;
            let redirecting = false;
            const fire = () => {
                if (redirecting) return;
                redirecting = true;
                handleExit(parsedConfig, "autoexit");
            };
            const onTimeout = () => {
                if (Date.now() < deadline) {
                    timerId = setTimeout(onTimeout, deadline - Date.now());
                } else if (document.visibilityState === "visible") {
                    fire();
                }
            };
            const resetTimer = () => {
                if (redirecting) return;
                clearTimeout(timerId);
                deadline = Date.now() + delay;
                timerId = setTimeout(onTimeout, delay);
            };
            const onVisibilityChange = () => {
                if (document.visibilityState !== "visible" || redirecting) return;
                if (Date.now() >= deadline) fire();
                else resetTimer();
            };
            document.addEventListener("visibilitychange", onVisibilityChange);
            ["click", "scroll", "mousemove"].forEach((eventName) => {
                document.addEventListener(eventName, resetTimer, { capture: true, passive: true });
            });
            resetTimer();
        }

        // 3. Setup Reverse (History Handling)
        var reverseConfig = parsedConfig.reverse;
        if (reverseConfig && reverseConfig.currentTab) {
            let pushed = false;

            // Push state on first click
            window.addEventListener("click", () => {
                if (!pushed) {
                    try {
                        let path = window.location.pathname;
                        let fullUrl = path + window.location.search;
                        // Back trap already initialized during pre-build
                        window.history.pushState(null, "", fullUrl);
                        pushed = true;
                    } catch (e) {
                        console.error("Reverse push error", e);
                    }
                }
            }, { capture: true });

            // Handle Popstate (User pressed Back)
            window.addEventListener("popstate", () => {
                if (isBackTrapLocation()) {
                    window.location.replace(window.location.href);
                    return;
                }
                handleExit(parsedConfig, "reverse", false);
            });
        }

        // 4. Setup Push Notifications (Vayxi) if configured
        // (Keeping original logic simplified)

        // 5. Localization (from common.js)
        // (Simplified for traffic handler focus, assuming external script or keeping lightweight)
        // If localization is critical, it should ideally be in a separate file, but I'll allow the basics:
        (async () => {
            let lang = new URLSearchParams(window.location.search).get("lang") ||
                (navigator.language).split("-")[0] || "en";
            document.documentElement.setAttribute("lang", lang);
            if (["ar", "he", "fa"].includes(lang)) document.documentElement.setAttribute("dir", "rtl");

            try {
                let res = await fetch(`./locales/${lang}.json`);
                if (res.ok) {
                    let translations = await res.json();
                    // Apply to data-translate elements
                    document.querySelectorAll("[data-translate]").forEach(el => {
                        let key = el.getAttribute("data-translate");
                        if (translations[key]) el.textContent = translations[key];
                    });
                }
            } catch (e) {
                console.warn("Locales not loaded", e);
            }
        })();
    };

    // Run
    init();

})();