// ==UserScript==
// @name         Roblox Mass Appeal
// @namespace    github.com/annaroblox
// @version      2.2
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
    console.log("Roblox Mass Appeal [v2.2]: Script active.");

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
                console.log(`Roblox Mass Appeal [v2.2]: Loaded ${lines.length} default messages from remote list.`);
            }
        } catch (e) {
            console.warn("Roblox Mass Appeal [v2.2]: Failed to load remote messages -", e);
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
                <h2>Mass Appeal Tool v2.2</h2>
                <button id="mass-appeal-settings-btn" type="button">\u2699\uFE0F Settings</button>
            </div>
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
                <button id="mass-appeal-settings-close" type="button">Close Settings</button>
            </div>
            <div id="mass-appeal-status"></div>
        `;
        injectionPoint.prepend(container);

        GM_addStyle(`
            #mass-appeal-container { background:#2c2f33; color:#fff; padding:20px; margin:15px 0; border:1px solid #444; border-radius:8px; z-index:9999; }
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

        const allViolationItems = Array.from(document.querySelectorAll('a[href^="#/v/"]'));

        // --- Clear stored history if the user changed or too many violations are present ---
        let appealHistory = getAppealHistory();
        const lastUserId = localStorage.getItem('mass-appeal-last-userid');

        if (lastUserId && lastUserId !== String(userId)) {
            appealHistory = {};
            log(`\u{1F501} User ID changed (${lastUserId} \u2192 ${userId}). Cleared stored violations.`);
        }
        if (allViolationItems.length >= MAX_VIOLATIONS_BEFORE_CLEAR) {
            appealHistory = {};
            log(`\u{1F501} ${allViolationItems.length} violations found (\u2265 ${MAX_VIOLATIONS_BEFORE_CLEAR}). Cleared stored violations.`);
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
            const text = link.textContent.toLowerCase();
            const id = link.href.split('#/v/')[1];
            if (!id) return false;

            // Permanently completed (accepted, or server said no further appeals allowed) -> skip forever.
            if (appealHistory[id] === 'completed') return false;

            // "appeal accepted" -> mark complete and never appeal again.
            if (text.includes("appeal accepted")) {
                appealHistory[id] = 'completed';
                return false;
            }

            // A submitted appeal still pending review -> skip until it resolves.
            if (text.includes("appeal received") || text.includes("appeal recieved")) {
                return false;
            }

            // Everything else ("appeal denied", "see details", fresh items, etc.) -> appeal it.
            return true;
        });

        const tasks = [...new Set(validViolationLinks.map(link => link.href.split('#/v/')[1]).filter(Boolean))];

        if (tasks.length === 0) {
            log("No new valid/appealable violations found.", true);
            saveAppealHistory(appealHistory);
            resetButton(); return;
        }

        const messagePool = getAllMessages();

        for (let i = 0; i < tasks.length; i++) {
            const id = tasks[i];
            let attempts = 0;
            const maxAttempts = 2;
            let messageToSend = randomize ? messagePool[Math.floor(Math.random() * messagePool.length)] : message;

            while (attempts < maxAttempts) {
                try {
                    await sendAppealRequest(userId, id, messageToSend, csrfToken);
                    log(`[${i + 1}/${tasks.length}] \u2705 SUCCESS: ${id}`);
                    break;
                } catch (err) {
                    attempts++;
                    if (err.status === 403 && attempts < maxAttempts) {
                        if (err.newToken) csrfToken = err.newToken;
                        else csrfToken = await getValidToken();
                        continue;
                    }
                    if (typeof err.body === 'string' && err.body.includes('failed precondition: no further appeal is allowed for violation')) {
                        appealHistory[id] = 'completed';
                        log(`[${i + 1}/${tasks.length}] \u2139\uFE0F Violation ${id} reached max appeals. Marked complete; won't retry.`, false);
                    } else {
                        log(`[${i + 1}/${tasks.length}] \u274C FAILED: ${id} \u2192 ${err.body || err.status}`, true);
                    }
                    break;
                }
            }
        }

        saveAppealHistory(appealHistory);
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
