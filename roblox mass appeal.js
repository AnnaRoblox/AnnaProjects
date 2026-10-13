// ==UserScript==
// @name         Roblox Mass Appeal
// @namespace    github.com/annaroblox
// @version      2.3
// @description  Adds a button to appeal all appealable items with concurrent requests. Tracks appeal counts and handles maxed-out violations.
// @author       AnnaRoblox
// @match        *://*.roblox.com/report-appeals*
// @match        *://*.roblox.com/*/report-appeals*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      apis.roblox.com
// @connect      auth.roblox.com
// @connect      github.com
// @connect      raw.githubusercontent.com
// @connect      objects.githubusercontent.com
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';
    console.log("Roblox Mass Appeal [v2.3]: Script active.");

    const APPEAL_MESSAGE_PLACEHOLDER = "I believe this moderation was a mistake. I respectfully request a review. Thank you";
    const MAX_VIOLATIONS_BEFORE_CLEAR = 500;
    const REMOTE_MESSAGES_URL = "https://github.com/AnnaRoblox/AnnaProjects/raw/refs/heads/main/roblox%20appeal%20messages.txt";

    function getAppealHistory() {
        return JSON.parse(localStorage.getItem('mass-appeal-history') || '{}');
    }

    function saveAppealHistory(history) {
        localStorage.setItem('mass-appeal-history', JSON.stringify(history));
    }

    // Default appeal messages are fetched from the remote list (one message per line).
    let DEFAULT_MESSAGES = [APPEAL_MESSAGE_PLACEHOLDER];
    let remoteMessagesLoaded = false;

    function fetchRemoteMessages() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: REMOTE_MESSAGES_URL,
                onload: function (r) {
                    if (r.status >= 200 && r.status < 300) {
                        const lines = r.responseText
                            .split(/\r?\n/)
                            .map(line => line.trim())
                            .filter(line => line.length > 0);
                        resolve(lines);
                    } else {
                        reject(`HTTP ${r.status}`);
                    }
                },
                onerror: () => reject("Network error while fetching remote messages")
            });
        });
    }

    async function loadRemoteMessages() {
        try {
            const lines = await fetchRemoteMessages();
            if (lines.length > 0) {
                DEFAULT_MESSAGES = lines;
                remoteMessagesLoaded = true;
                console.log(`Roblox Mass Appeal [v2.3]: Loaded ${lines.length} default messages from remote list.`);
            }
        } catch (e) {
            console.warn("Roblox Mass Appeal [v2.3]: Failed to load remote messages -", e);
        }
        return DEFAULT_MESSAGES;
    }

    let currentCsrfToken = null;

    function getCustomMessages() {
        try {
            return JSON.parse(localStorage.getItem('mass-appeal-custom-messages')) || [];
        } catch (e) {
            return [];
        }
    }

    function saveCustomMessages(messages) {
        localStorage.setItem('mass-appeal-custom-messages', JSON.stringify(messages));
    }

    function getAllMessages() {
        return [...DEFAULT_MESSAGES, ...getCustomMessages()];
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag));
    }

    function getMetaCsrf() {
        return document.querySelector('meta[name="csrf-token"]')?.getAttribute('data-token') || null;
    }

    async function fetchFreshCsrfToken() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: "https://auth.roblox.com/v2/logout",
                headers: { "Content-Type": "application/json" },
                withCredentials: true,
                onload: function (r) {
                    const token = r.responseHeaders.match(/x-csrf-token:\s*([^\r\n]+)/i)?.[1];
                    if (token) {
                        currentCsrfToken = token.trim();
                        resolve(currentCsrfToken);
                    } else {
                        reject("Could not extract token from headers");
                    }
                },
                onerror: () => reject("Network error while fetching token")
            });
        });
    }

    async function getValidToken() {
        let token = getMetaCsrf() || currentCsrfToken;
        if (token) return token;
        try {
            token = await fetchFreshCsrfToken();
            return token;
        } catch (e) {
            throw e;
        }
    }

    // LIVE APPEAL COUNTER

    const STATS_DEFS = [
        { key: 'accepted',     label: 'Accepted',     color: '#43b581', title: 'Appeals that were accepted.' },
        { key: 'received',     label: 'Received',     color: '#faa61a', title: 'Appeals submitted and still awaiting review, including ones this tool just sent.' },
        { key: 'denied',       label: 'Denied',       color: '#f04747', title: 'Denied appeals that can still be appealed again.' },
        { key: 'appealable',   label: 'Appealable',   color: '#7289da', title: 'Violations that can be appealed right now - these are what "Appeal All" queues.' },
        { key: 'unappealable', label: 'Unappealable', color: '#747f8d', title: 'Violations that reached the maximum number of appeals. Roblox renders these with the same text as a normal denial, so they are tracked locally as the tool discovers them.' },
        { key: 'total',        label: 'Total',        color: '#ffffff', title: 'Total violations found on the page.' }
    ];

    let lastStats = null;
    let lastRenderedStats = null;
    let lastRenderedAt = 0;
    let statsObserver = null;

    // Appeals this page session submitted successfully. The page text does not
    // change until Roblox re-renders/reloads, so without this the counter would
    // keep showing them as "Appealable" right after a run. Session-only: after
    // the reload the real "Appeal Received" text takes over.
    const locallySubmitted = new Set();

    function getViolationLinks() {
        return Array.from(document.querySelectorAll('a[href*="#/v/"]'));
    }

    function getViolationId(link) {
        const idx = link.href.indexOf('#/v/');
        return idx === -1 ? null : link.href.slice(idx + 4).split(/[?#/]/)[0];
    }

    // Read the status text from the link and, if it is bare, from its
    // closest ancestor row so cards that put the label in a sibling node
    // still get counted correctly.
    function getStatusText(link) {
        const own = (link.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (/accepted|recieved|received|pending|denied|rejected/.test(own)) return own;
        let node = link;
        for (let depth = 0; depth < 5 && node; depth++) {
            node = node.parentElement;
            if (!node) break;
            const ctx = (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (ctx.length > 600) break;
            if (/accepted|recieved|received|pending|denied|rejected|see details|appeal/.test(ctx)) return ctx;
        }
        return own;
    }

    // Appeal history values: 'accepted' (appeal won), 'maxed' (server said no
    // further appeal is allowed), and 'completed' (legacy marker from older
    // versions where the reason was not recorded).
    function isFinalAppealStatus(entry) {
        return entry === 'accepted' || entry === 'maxed' || entry === 'completed';
    }

    function classifyAppealStatus(text, id, history) {
        const recorded = id ? history[id] : null;

        // An accepted appeal is final and positive - live page text wins, and it
        // also upgrades legacy 'completed' entries to a precise reason.
        if (text.includes('appeal accepted') || text.includes('accepted')) return 'accepted';
        if (recorded === 'accepted') return 'accepted';

        // An appeal currently awaiting review.
        if (text.includes('appeal received') || text.includes('appeal recieved') ||
            text.includes('received') || text.includes('recieved') || text.includes('pending')) return 'received';

        // We submitted this one ourselves moments ago; the page text has not
        // caught up yet, so count it as awaiting review rather than appealable.
        if (id && locallySubmitted.has(id)) return 'received';

        // Reached max appeals. The page shows these with exactly the same text
        // as an ordinary denial, so the locally recorded reason is the ONLY way
        // to tell them apart. This must be checked before the denied text.
        if (recorded === 'maxed' || recorded === 'completed') return 'unappealable';

        if (text.includes('appeal denied') || text.includes('denied') || text.includes('rejected')) return 'denied';
        if (text.includes('no further appeal') || text.includes('cannot be appealed') ||
            text.includes("can't be appealed") || text.includes('not appealable')) return 'unappealable';
        return 'appealable';
    }

    function scanAppealStats() {
        const links = getViolationLinks();
        const history = getAppealHistory(); // read once per scan, not per link
        const stats = { accepted: 0, received: 0, denied: 0, appealable: 0, unappealable: 0, total: 0, scannedAt: Date.now() };
        const seen = new Set();

        for (const link of links) {
            const id = getViolationId(link);
            if (id && seen.has(id)) continue; // ignore duplicated links for the same violation
            if (id) seen.add(id);

            const text = getStatusText(link);
            stats[classifyAppealStatus(text, id, history)]++;
            stats.total++;
        }

        lastStats = stats;
        renderStats(stats);
        return stats;
    }

    function formatTime(ts) {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function renderStats(stats) {
        const panel = document.getElementById('mass-appeal-stats');
        const badge = document.getElementById('mass-appeal-stats-float');

        if (!panel && !badge) return;

        const changed = !lastRenderedStats ||
            STATS_DEFS.some(d => lastRenderedStats[d.key] !== stats[d.key]) ||
            (stats.scannedAt - lastRenderedAt > 15000); // repaint so "updated HH:MM:SS" stays fresh
        if (!changed) return;
        lastRenderedAt = stats.scannedAt;

        if (panel) {
            const counts = STATS_DEFS.map(d =>
                `<div class="stat-box stat-${d.key}" title="${d.title}">
                    <span class="stat-value" style="color:${d.color}">${stats[d.key]}</span>
                    <span class="stat-label">${d.label}</span>
                </div>`
            ).join('');
            panel.innerHTML = `
                <div class="stats-grid">${counts}</div>
                <div class="stats-meta">Live &bull; updated ${formatTime(stats.scannedAt)} &bull; rescans every 2s and on page changes</div>
            `;
        }

        if (badge) {
            badge.innerHTML = `
                <div class="stats-float-title">
                    <span>\u{1F4CA} Appeal Stats</span>
                    <span class="stats-float-title-actions">
                        <span class="stats-float-grip" title="Drag to move">\u2261</span>
                        <button class="stats-float-hide" type="button" title="Hide floating badge">\u2715</button>
                    </span>
                </div>
                <div class="stats-float-row"><span style="color:#43b581">\u2705 Accepted</span><b>${stats.accepted}</b></div>
                <div class="stats-float-row"><span style="color:#faa61a">\u{1F4E5} Received</span><b>${stats.received}</b></div>
                <div class="stats-float-row"><span style="color:#f04747">\u274C Denied</span><b>${stats.denied}</b></div>
                <div class="stats-float-row"><span style="color:#7289da">\u{1F504} Appealable</span><b>${stats.appealable}</b></div>
                <div class="stats-float-row" title="Reached max appeals"><span style="color:#747f8d">\u{1F6AB} Maxed</span><b>${stats.unappealable}</b></div>
                <div class="stats-float-row stats-float-total"><span>Total</span><b>${stats.total}</b></div>
            `;
        }

        lastRenderedStats = stats;
    }

    function buildStatsPanel() {
        return `
            <div id="mass-appeal-stats" class="mass-appeal-stats">
                <div class="stats-grid">
                    ${STATS_DEFS.map(d => `<div class="stat-box stat-${d.key}"><span class="stat-value" style="color:${d.color}">0</span><span class="stat-label">${d.label}</span></div>`).join('')}
                </div>
                <div class="stats-meta">Waiting for appeals to load...</div>
            </div>
        `;
    }

    function isFloatEnabled() {
        // On by default: only an explicit "false" turns it off.
        return localStorage.getItem('mass-appeal-float-enabled') !== 'false';
    }

    function getSavedFloatPos() {
        try {
            const pos = JSON.parse(localStorage.getItem('mass-appeal-float-pos') || 'null');
            return (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) ? pos : null;
        } catch (e) {
            return null;
        }
    }

    function saveFloatPos(left, top) {
        localStorage.setItem('mass-appeal-float-pos', JSON.stringify({ left, top }));
    }

    function clampFloatPos(left, top, w, h) {
        const pad = 4;
        const maxLeft = Math.max(pad, window.innerWidth - w - pad);
        const maxTop = Math.max(pad, window.innerHeight - h - pad);
        return {
            left: Math.min(Math.max(pad, left), maxLeft),
            top: Math.min(Math.max(pad, top), maxTop)
        };
    }

    function applyFloatPos(badge, pos) {
        const p = clampFloatPos(pos.left, pos.top, badge.offsetWidth || 180, badge.offsetHeight || 140);
        badge.style.right = 'auto';
        badge.style.left = p.left + 'px';
        badge.style.top = p.top + 'px';
        return p;
    }

    function makeBadgeDraggable(badge) {
        let dragging = false;
        let startX = 0, startY = 0, origLeft = 0, origTop = 0;
        let currentPos = null; // last clamped position we applied

        const pointFrom = (e) => {
            if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        };

        function onMove(e) {
            if (!dragging) return;
            const p = pointFrom(e);
            const dx = p.x - startX;
            const dy = p.y - startY;
            // Past a small threshold this is a drag, not a click.
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) badge.dataset.justDragged = '1';
            currentPos = applyFloatPos(badge, { left: origLeft + dx, top: origTop + dy });
            if (e.cancelable) e.preventDefault();
        }

        function onUp() {
            if (!dragging) return;
            dragging = false;
            badge.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
            document.removeEventListener('touchcancel', onUp);
            if (badge.dataset.justDragged) {
                // Save the position we actually applied rather than re-measuring.
                if (currentPos) saveFloatPos(currentPos.left, currentPos.top);
                // The click handler consumes this; the timer is a fallback for
                // the case where no click event follows (e.g. touch drags).
                setTimeout(() => { delete badge.dataset.justDragged; }, 400);
            }
        }

        function onDown(e) {
            // Don't start a drag from the hide button.
            if (e.target.closest && e.target.closest('.stats-float-hide')) return;
            const p = pointFrom(e);
            const rect = badge.getBoundingClientRect();
            dragging = true;
            delete badge.dataset.justDragged;
            startX = p.x; startY = p.y;
            origLeft = rect.left; origTop = rect.top;
            currentPos = { left: origLeft, top: origTop };
            badge.style.right = 'auto';
            badge.style.left = origLeft + 'px';
            badge.style.top = origTop + 'px';
            badge.classList.add('dragging');
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onUp);
            document.addEventListener('touchcancel', onUp);
            if (e.cancelable) e.preventDefault();
        }

        badge.addEventListener('mousedown', onDown);
        badge.addEventListener('touchstart', onDown, { passive: false });

        // Keep the badge on-screen if the window is resized.
        window.addEventListener('resize', () => {
            const rect = badge.getBoundingClientRect();
            currentPos = applyFloatPos(badge, { left: rect.left, top: rect.top });
            saveFloatPos(currentPos.left, currentPos.top);
        });
    }

    function buildFloatingBadge() {
        if (!isFloatEnabled()) return;
        if (document.getElementById('mass-appeal-stats-float')) return;

        const badge = document.createElement('div');
        badge.id = 'mass-appeal-stats-float';
        badge.title = 'Drag to move \u2022 click to scroll to the Mass Appeal tool';
        badge.innerHTML = `
            <div class="stats-float-title">
                <span>\u{1F4CA} Appeal Stats</span>
                <span class="stats-float-title-actions">
                    <span class="stats-float-grip" title="Drag to move">\u2261</span>
                    <button class="stats-float-hide" type="button" title="Hide floating badge">\u2715</button>
                </span>
            </div>
            <div class="stats-float-row"><span>Loading...</span><b>0</b></div>
        `;
        (document.body || document.documentElement).appendChild(badge);

        // Restore the user's last position, else default to the top-left.
        const saved = getSavedFloatPos();
        if (saved) applyFloatPos(badge, saved);

        makeBadgeDraggable(badge);

        badge.addEventListener('click', (e) => {
            // A drag ended here - swallow the click that follows it.
            if (badge.dataset.justDragged) {
                delete badge.dataset.justDragged;
                return;
            }
            // Delegated because renderStats() rewrites the badge contents.
            if (e.target.closest && e.target.closest('.stats-float-hide')) {
                e.stopPropagation();
                setFloatEnabled(false);
                return;
            }
            if (badge.classList.contains('dragging')) return;
            const container = document.getElementById('mass-appeal-container');
            if (container) {
                container.scrollIntoView({ behavior: 'smooth', block: 'start' });
                container.classList.add('mass-appeal-flash');
                setTimeout(() => container.classList.remove('mass-appeal-flash'), 1200);
            }
        });
    }

    function setFloatEnabled(enabled) {
        localStorage.setItem('mass-appeal-float-enabled', enabled ? 'true' : 'false');
        const badge = document.getElementById('mass-appeal-stats-float');
        if (enabled) {
            buildFloatingBadge();
            if (lastStats) renderStats(lastStats);
        } else if (badge) {
            badge.remove();
            lastRenderedStats = null; // force a full repaint when re-enabled
        }
        const cb = document.getElementById('mass-appeal-float-toggle');
        if (cb) cb.checked = enabled;
    }

    function startStatsWatching() {
        // Refresh immediately, then on a timer (the appeals list is rendered
        // lazily / paginated, so counts keep changing after first paint).
        scanAppealStats();
        setInterval(() => {
            if (document.getElementById('mass-appeal-container') || document.getElementById('mass-appeal-stats-float')) {
                scanAppealStats();
            }
        }, 2000);

        // Also react instantly to DOM changes (like if you have to load more appeals or if the status changes).
        if (statsObserver) statsObserver.disconnect();
        let throttle = null;
        statsObserver = new MutationObserver((mutations) => {
            // Ignore mutations caused by our own UI (status log lines, counter
            // repaints) so we don't rescan in response to ourselves.
            const relevant = mutations.some(m => {
                const t = m.target;
                if (!t || t.nodeType !== 1 && t.nodeType !== 3) return true;
                const host = t.nodeType === 1 ? t : t.parentElement;
                if (!host || !host.closest) return true;
                return !(host.closest('#mass-appeal-container') || host.closest('#mass-appeal-stats-float'));
            });
            if (!relevant) return;
            if (throttle) return;
            throttle = setTimeout(() => {
                throttle = null;
                scanAppealStats();
            }, 400);
        });
        const target = document.querySelector('#report-appeals-app') || document.body;
        if (target) {
            statsObserver.observe(target, { childList: true, subtree: true, characterData: true });
        }
    }

    function statsSummaryLine(stats) {
        if (!stats) return '';
        return `\u{1F4CA} Accepted: ${stats.accepted} | Received: ${stats.received} | Denied: ${stats.denied} | Appealable: ${stats.appealable} | Unappealable: ${stats.unappealable} | Total: ${stats.total}`;
    }

    function renderCustomMessages() {
        const listContainer = document.getElementById('mass-appeal-custom-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';
        const custom = getCustomMessages();
        if (custom.length === 0) {
            listContainer.innerHTML = '<p style="color:#aaa; font-style:italic; font-size: 13px; text-align: center; margin: 10px 0;">No custom messages added yet.</p>';
            return;
        }
        custom.forEach((msg, idx) => {
            const item = document.createElement('div');
            item.className = 'custom-message-item';
            item.innerHTML = `
                <span class="custom-message-text">${escapeHTML(msg)}</span>
                <button class="custom-message-delete" data-index="${idx}" type="button">\u274C</button>
            `;
            listContainer.appendChild(item);
        });
        listContainer.querySelectorAll('.custom-message-delete').forEach(btn => {
            btn.addEventListener('click', function () {
                const index = parseInt(this.getAttribute('data-index'), 10);
                const current = getCustomMessages();
                current.splice(index, 1);
                saveCustomMessages(current);
                renderCustomMessages();
            });
        });
    }

    function renderDefaultMessages() {
        const listContainer = document.getElementById('mass-appeal-defaults-list');
        if (!listContainer) return;
        listContainer.innerHTML = '<p style="color:#aaa; font-style:italic; font-size: 13px; text-align: center; margin: 10px 0;">Loading default messages...</p>';

        const render = () => {
            listContainer.innerHTML = '';
            if (!DEFAULT_MESSAGES || DEFAULT_MESSAGES.length === 0) {
                listContainer.innerHTML = '<p style="color:#f04747; font-size: 13px; text-align: center; margin: 10px 0;">No default messages available.</p>';
                return;
            }
            if (!remoteMessagesLoaded) {
                const note = document.createElement('p');
                note.style.cssText = 'color:#faa61a; font-size: 12px; font-style: italic; text-align: center; margin: 0 0 8px 0;';
                note.textContent = 'Could not load remote list \u2014 showing fallback message(s).';
                listContainer.appendChild(note);
            }
            DEFAULT_MESSAGES.forEach((msg, idx) => {
                const item = document.createElement('div');
                item.className = 'default-message-item';
                item.innerHTML = `<span class="default-message-num">${idx + 1}.</span>${escapeHTML(msg)}`;
                listContainer.appendChild(item);
            });
        };

        if (remoteMessagesLoaded) {
            render();
        } else {
            loadRemoteMessages().then(render).catch(render);
        }
    }

    function addAppealUI(injectionPoint) {
        if (document.getElementById('mass-appeal-container')) return;
        const container = document.createElement('div');
        container.id = 'mass-appeal-container';
        container.innerHTML = `
            <div class="mass-appeal-header">
                <h2>AnnaRoblox's Mass Appeal Tool v2.3</h2>
                <button id="mass-appeal-settings-btn" type="button">\u2699\uFE0F Settings</button>
            </div>
            ${buildStatsPanel()}
            <p>Enter message and click the button. Re-appeals denied items, skips accepted/maxed appeals.</p>
            <textarea id="mass-appeal-message" placeholder="Enter your appeal message here...">${APPEAL_MESSAGE_PLACEHOLDER}</textarea>
            <div class="mass-appeal-controls">
                <label class="toggle-container">
                    <input type="checkbox" id="mass-appeal-randomize">
                    Randomize appeal message
                </label>
                <button id="mass-appeal-button">Appeal All Valid Items</button>
            </div>
            <div id="mass-appeal-settings-panel" style="display: none;">
                <h3>Custom Random Appeal Messages</h3>
                <div id="mass-appeal-custom-list"></div>
                <div class="add-message-container">
                    <textarea id="mass-appeal-new-message" placeholder="Type a new appeal message to add to pool..."></textarea>
                    <button id="mass-appeal-add-btn" type="button">Add Message</button>
                </div>
                <hr class="mass-appeal-divider">
                <h3>Default Messages (from remote list)</h3>
                <button id="mass-appeal-list-defaults-btn" type="button">List current default messages</button>
                <div id="mass-appeal-defaults-list" style="display: none;"></div>
                <hr class="mass-appeal-divider">
                <h3>Display</h3>
                <div class="display-settings-row">
                    <label class="toggle-container">
                        <input type="checkbox" id="mass-appeal-float-toggle">
                        Show floating stats badge
                    </label>
                    <button id="mass-appeal-reset-float-pos" type="button">Reset badge position</button>
                </div>
                <p class="settings-hint">The badge is draggable \u2014 grab it anywhere and drop it where you like. Its position is remembered.</p>
                <hr class="mass-appeal-divider">
                <button id="mass-appeal-settings-close" type="button">Close Settings</button>
            </div>
            <div id="mass-appeal-status"></div>
        `;
        injectionPoint.prepend(container);
        buildFloatingBadge();

        GM_addStyle(`
            #mass-appeal-container { background:#2c2f33; color:#fff; padding:20px; margin:15px 0; border:1px solid #444; border-radius:8px; z-index:9999; position: relative; }
            #mass-appeal-container.mass-appeal-flash { box-shadow: 0 0 0 3px #7289da; }
            .mass-appeal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            .mass-appeal-header h2 { margin: 0; font-size: 20px; }
            #mass-appeal-settings-btn { background: #4f545c; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 14px; transition: background 0.2s; }
            #mass-appeal-settings-btn:hover { background: #686d73; }
            #mass-appeal-message { width:98%; height:110px; padding:10px; background:#23272a; color:#fff; border:1px solid #555; border-radius:4px; box-sizing: border-box; }
            .mass-appeal-controls { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; flex-wrap: wrap; gap: 10px; }
            .toggle-container { display: flex; align-items: center; gap: 8px; user-select: none; cursor: pointer; color: #b9bbbe; font-size: 14px; }
            #mass-appeal-button { background:#7289da; color:white; padding:12px 20px; border:none; border-radius:5px; cursor:pointer; font-size:16px; }
            #mass-appeal-button:hover { background:#677bc4; }
            #mass-appeal-button:disabled { background:#555; cursor:not-allowed; }
            #mass-appeal-status { margin-top:15px; padding:12px; background:#23272a; border-radius:4px; max-height:350px; overflow-y:auto; font-family:monospace; }
            #mass-appeal-settings-panel { background: #23272a; border: 1px solid #555; border-radius: 6px; padding: 15px; margin-top: 15px; text-align: left; }
            #mass-appeal-settings-panel h3 { margin-top: 0; margin-bottom: 10px; font-size: 15px; color: #fff; }
            #mass-appeal-custom-list { margin-bottom: 15px; max-height: 150px; overflow-y: auto; border: 1px solid #444; border-radius: 4px; padding: 5px; background: #1e2124; }
            .custom-message-item { display: flex; justify-content: space-between; align-items: center; padding: 6px; border-bottom: 1px solid #333; gap: 10px; }
            .custom-message-item:last-child { border-bottom: none; }
            .custom-message-text { font-size: 13px; color: #dcddde; word-break: break-word; text-align: left; flex-grow: 1; }
            .custom-message-delete { background: #f04747; color: white; border: none; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 12px; }
            .custom-message-delete:hover { background: #d84040; }
            .add-message-container { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
            #mass-appeal-new-message { width: 100%; height: 60px; padding: 8px; background: #1e2124; color: #fff; border: 1px solid #555; border-radius: 4px; box-sizing: border-box; resize: vertical; }
            #mass-appeal-add-btn { background: #43b581; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 14px; align-self: flex-end; }
            #mass-appeal-add-btn:hover { background: #3ca374; }
            #mass-appeal-settings-close { background: #747f8d; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; }
            #mass-appeal-settings-close:hover { background: #5f6b76; }
            .mass-appeal-divider { border: none; border-top: 1px solid #444; margin: 15px 0; }
            #mass-appeal-list-defaults-btn { background: #5865f2; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 14px; }
            #mass-appeal-list-defaults-btn:hover { background: #4752c4; }
            #mass-appeal-defaults-list { margin-top: 12px; max-height: 200px; overflow-y: auto; border: 1px solid #444; border-radius: 4px; padding: 5px; background: #1e2124; }
            .default-message-item { padding: 6px; border-bottom: 1px solid #333; font-size: 13px; color: #dcddde; word-break: break-word; text-align: left; }
            .default-message-item:last-child { border-bottom: none; }
            .default-message-num { color: #7289da; font-weight: bold; margin-right: 6px; }
            .display-settings-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 6px; }
            #mass-appeal-reset-float-pos { background: #4f545c; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; }
            #mass-appeal-reset-float-pos:hover { background: #686d73; }
            .settings-hint { margin: 0 0 4px 0; font-size: 12px; color: #8a8f98; font-style: italic; }

            /* --- Live appeal counter (in-panel) --- */
            .mass-appeal-stats { background:#23272a; border:1px solid #444; border-radius:6px; padding:12px; margin-bottom:14px; }
            .stats-grid { display:flex; flex-wrap:wrap; gap:8px; }
            .stat-box { flex:1 1 0; min-width:88px; background:#1e2124; border:1px solid #3a3f45; border-radius:5px; padding:8px 6px; text-align:center; }
            .stat-box.stat-total { border-color:#5b6472; background:#232830; }
            .stat-value { display:block; font-size:20px; font-weight:700; line-height:1.2; font-family:monospace; }
            .stat-label { display:block; font-size:11px; color:#b9bbbe; text-transform:uppercase; letter-spacing:.4px; margin-top:2px; }
            .stats-meta { margin-top:8px; font-size:11px; color:#8a8f98; text-align:center; font-family:monospace; }

            /* --- Live appeal counter (floating badge) --- */
            #mass-appeal-stats-float { position:fixed; top:70px; left:16px; right:auto; z-index:2147483000; background:rgba(35,39,42,.96); border:1px solid #4f545c; border-radius:8px; padding:10px 12px; min-width:170px; color:#fff; font-family:monospace; font-size:12px; box-shadow:0 6px 18px rgba(0,0,0,.45); cursor:grab; user-select:none; touch-action:none; }
            #mass-appeal-stats-float:hover { border-color:#7289da; }
            #mass-appeal-stats-float.dragging { cursor:grabbing; border-color:#7289da; opacity:.92; }
            .stats-float-title { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; font-weight:700; color:#dcddde; margin-bottom:6px; letter-spacing:.3px; }
            .stats-float-title-actions { display:flex; align-items:center; gap:6px; }
            .stats-float-grip { color:#747f8d; font-size:10px; letter-spacing:.5px; cursor:grab; }
            .stats-float-hide { background:#4f545c; color:#fff; border:none; border-radius:3px; padding:0 5px; font-size:11px; line-height:16px; cursor:pointer; }
            .stats-float-hide:hover { background:#f04747; }
            .stats-float-row { display:flex; justify-content:space-between; gap:12px; padding:2px 0; color:#b9bbbe; }
            .stats-float-row b { color:#fff; }
            .stats-float-total { margin-top:5px; padding-top:5px; border-top:1px solid #3a3f45; color:#dcddde; }
        `);

        const randomizeCheckbox = document.getElementById('mass-appeal-randomize');
        randomizeCheckbox.checked = localStorage.getItem('mass-appeal-randomize-enabled') === 'true';
        randomizeCheckbox.addEventListener('change', (e) => {
            localStorage.setItem('mass-appeal-randomize-enabled', e.target.checked);
        });

        document.getElementById('mass-appeal-button').addEventListener('click', handleAppealAll);

        document.getElementById('mass-appeal-settings-btn').addEventListener('click', () => {
            const panel = document.getElementById('mass-appeal-settings-panel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            renderCustomMessages();
        });

        document.getElementById('mass-appeal-settings-close').addEventListener('click', () => {
            document.getElementById('mass-appeal-settings-panel').style.display = 'none';
        });

        document.getElementById('mass-appeal-list-defaults-btn').addEventListener('click', () => {
            const list = document.getElementById('mass-appeal-defaults-list');
            const btn = document.getElementById('mass-appeal-list-defaults-btn');
            if (list.style.display === 'none') {
                list.style.display = 'block';
                btn.textContent = 'Hide default messages';
                renderDefaultMessages();
            } else {
                list.style.display = 'none';
                btn.textContent = 'List current default messages';
            }
        });

        document.getElementById('mass-appeal-add-btn').addEventListener('click', () => {
            const textInput = document.getElementById('mass-appeal-new-message');
            const val = textInput.value.trim();
            if (val) {
                const current = getCustomMessages();
                current.push(val);
                saveCustomMessages(current);
                textInput.value = '';
                renderCustomMessages();
            }
        });

        const floatToggle = document.getElementById('mass-appeal-float-toggle');
        floatToggle.checked = isFloatEnabled();
        floatToggle.addEventListener('change', (e) => setFloatEnabled(e.target.checked));

        document.getElementById('mass-appeal-reset-float-pos').addEventListener('click', () => {
            localStorage.removeItem('mass-appeal-float-pos');
            const badge = document.getElementById('mass-appeal-stats-float');
            if (badge) {
                badge.style.left = '';
                badge.style.top = '';
                badge.style.right = 'auto';
            }
        });

        // Kick off the live counter for this page.
        startStatsWatching();
    }

    function logStatus(statusDiv, text, isError = false) {
        const p = document.createElement('p');
        p.textContent = text;
        p.style.color = isError ? '#f04747' : '#43b581';
        statusDiv.appendChild(p);
        statusDiv.scrollTop = statusDiv.scrollHeight;
    }

    async function sendAppealRequest(userId, violationId, message, csrfToken) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: `https://apis.roblox.com/moderation-appeal-service/v2/users/${userId}/appeals`,
                headers: {
                    "Content-Type": "application/json;charset=UTF-8",
                    "X-CSRF-TOKEN": csrfToken,
                    "Referer": "https://www.roblox.com/"
                },
                data: JSON.stringify({
                    appeal: {
                        violation: `users/${userId}/violations/${violationId}`,
                        message: message
                    }
                }),
                withCredentials: true,
                onload: function (r) {
                    if (r.status >= 200 && r.status < 300) {
                        resolve("Success");
                    } else if (r.status === 403) {
                        const newToken = r.responseHeaders.match(/x-csrf-token:\s*([^\r\n]+)/i)?.[1];
                        if (newToken) currentCsrfToken = newToken.trim();
                        reject({ status: 403, body: r.responseText, newToken });
                    } else {
                        reject({ status: r.status, body: r.responseText || r.statusText });
                    }
                },
                onerror: () => reject({ status: 0, body: "Network error" })
            });
        });
    }

    async function handleAppealAll() {
        const button = document.getElementById('mass-appeal-button');
        const statusDiv = document.getElementById('mass-appeal-status');
        const message = document.getElementById('mass-appeal-message').value.trim();
        const randomize = document.getElementById('mass-appeal-randomize').checked;

        button.disabled = true;
        button.textContent = 'Processing...';
        statusDiv.innerHTML = '';
        const log = (text, isError = false) => logStatus(statusDiv, text, isError);

        // Snapshot of the counters at the moment the run starts.
        const startStats = scanAppealStats();
        log(`\u{1F4CA} Before run \u2014 ${statsSummaryLine(startStats)}`);

        if (!randomize && !message) {
            log("Message cannot be empty!", true);
            resetButton(); return;
        }

        if (randomize && !remoteMessagesLoaded) {
            log("\u{1F4E5} Loading default appeal messages from remote list...");
            await loadRemoteMessages();
            if (remoteMessagesLoaded) {
                log(`\u2705 Loaded ${DEFAULT_MESSAGES.length} default messages.`);
            } else {
                log("\u26A0\uFE0F Could not load remote messages, using fallback.", true);
            }
        }

        const userId = getUserId();
        if (!userId) {
            log("Could not find User ID. Are you logged in?", true);
            resetButton(); return;
        }

        const allViolationItems = getViolationLinks();

        // --- Clear stored history if the user changed or too many violations are present ---
        let appealHistory = getAppealHistory();
        const lastUserId = localStorage.getItem('mass-appeal-last-userid');

        if (lastUserId && lastUserId !== String(userId)) {
            // Different account - the old records are meaningless, drop them all.
            appealHistory = {};
            log(`\u{1F501} User ID changed (${lastUserId} \u2192 ${userId}). Cleared stored violations.`);
        } else if (allViolationItems.length >= MAX_VIOLATIONS_BEFORE_CLEAR) {
            // Prune to the violations actually on this page instead of wiping
            // everything, so "reached max appeals" knowledge is kept (it cannot
            // be recovered from the page text) while storage stays bounded.
            const onPage = new Set(allViolationItems.map(l => getViolationId(l)).filter(Boolean));
            const kept = {};
            for (const [id, val] of Object.entries(appealHistory)) {
                if (onPage.has(id)) kept[id] = val;
            }
            const dropped = Object.keys(appealHistory).length - Object.keys(kept).length;
            appealHistory = kept;
            log(`\u{1F501} ${allViolationItems.length} violations found (\u2265 ${MAX_VIOLATIONS_BEFORE_CLEAR}). Pruned ${dropped} stale record(s); kept ${Object.keys(kept).length} for this page.`);
        }
        localStorage.setItem('mass-appeal-last-userid', String(userId));
        saveAppealHistory(appealHistory);

        let csrfToken;
        try {
            csrfToken = await getValidToken();
        } catch (e) {
            log("\u274C Failed to get CSRF token", true);
            resetButton(); return;
        }

        const validViolationLinks = allViolationItems.filter(link => {
            const text = getStatusText(link);
            const id = getViolationId(link);
            if (!id) return false;

            // "appeal accepted" -> final. Record the precise reason
            if (text.includes("appeal accepted")) {
                appealHistory[id] = 'accepted';
                return false;
            }

            // Already known to be finished (maxed out or accepted) -> skip forever.
            if (isFinalAppealStatus(appealHistory[id])) return false;

            // A submitted appeal still pending review -> skip until it resolves.
            if (text.includes("appeal received") || text.includes("appeal recieved")) {
                return false;
            }

            // Everything else ("appeal denied", "see details", fresh items, etc.) -> appeal it.
            return true;
        });

        const tasks = [...new Set(validViolationLinks.map(link => getViolationId(link)).filter(Boolean))];

        if (tasks.length === 0) {
            log("No new valid/appealable violations found.", true);
            log(statsSummaryLine(scanAppealStats()));
            saveAppealHistory(appealHistory);
            resetButton(); return;
        }

        log(`\u{1F3AF} ${tasks.length} appealable violation(s) queued.`);

        const messagePool = getAllMessages();
        let succeeded = 0;
        let failed = 0;
        let maxedOut = 0;

        for (let i = 0; i < tasks.length; i++) {
            const id = tasks[i];
            let attempts = 0;
            const maxAttempts = 2;
            let messageToSend = randomize ? messagePool[Math.floor(Math.random() * messagePool.length)] : message;

            while (attempts < maxAttempts) {
                try {
                    await sendAppealRequest(userId, id, messageToSend, csrfToken);
                    succeeded++;
                    locallySubmitted.add(id); // reflect in the live counter now
                    log(`[${i + 1}/${tasks.length}] \u2705 SUCCESS: ${id}`);
                    scanAppealStats();
                    break;
                } catch (err) {
                    attempts++;
                    if (err.status === 403 && attempts < maxAttempts) {
                        if (err.newToken) csrfToken = err.newToken;
                        else csrfToken = await getValidToken();
                        continue;
                    }
                    if (typeof err.body === 'string' && err.body.includes('failed precondition: no further appeal is allowed for violation')) {
                        maxedOut++;
                        // Record the precise reason so the live counter can tell
                        // this apart from an ordinary denial (same page text).
                        appealHistory[id] = 'maxed';
                        saveAppealHistory(appealHistory);
                        log(`[${i + 1}/${tasks.length}] \u2139\uFE0F Violation ${id} reached max appeals. Marked unappealable; won't retry.`, false);
                        scanAppealStats(); // tick the counter immediately
                    } else {
                        failed++;
                        log(`[${i + 1}/${tasks.length}] \u274C FAILED: ${id} \u2192 ${err.body || err.status}`, true);
                    }
                    break;
                }
            }

            // Show progress on the button; the counters themselves refresh
            // automatically via the interval + MutationObserver.
            button.textContent = `Processing... ${i + 1}/${tasks.length} (\u2705 ${succeeded} / \u274C ${failed})`;
        }

        saveAppealHistory(appealHistory);
        scanAppealStats();

        log(`\u{1F3C1} Run summary \u2014 Submitted: ${succeeded} | Failed: ${failed} | Maxed out: ${maxedOut}`);
        log(`\u{1F4CA} ${statsSummaryLine(lastStats)}`);
        log("\u2705 All done! Reloading...");
        button.textContent = 'Finished!';
        setTimeout(() => location.reload(), 3000);
    }

    function getUserId() {
        const match = document.querySelector('a[href*="/users/"]')?.href.match(/\/users\/(\d+)/);
        return match ? match[1] : document.querySelector('meta[name="user-id"]')?.content || null;
    }

    function resetButton() {
        const btn = document.getElementById('mass-appeal-button');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Appeal All Valid Items';
        }
    }

    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        const selectors = ['#report-appeals-app', 'div[role="main"]', '#container-main', '#content', 'body'];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && !document.getElementById('mass-appeal-container')) {
                addAppealUI(el);
                loadRemoteMessages(); // preload default messages in the background
                clearInterval(interval);
                return;
            }
        }
        if (attempts > 30) clearInterval(interval);
    }, 600);
})();
