// ==UserScript==
// @name         Roblox Mass Appeal
// @namespace    github.com/annaroblox
// @version      2.1
// @description  Adds a button to appeal all appealable items with concurrent requests. Improved X-CSRF handling.
// @author       AnnaRoblox
// @match        *://*.roblox.com/report-appeals*
// @match        *://*.roblox.com/*/report-appeals*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      apis.roblox.com
// @connect      auth.roblox.com
// @run-at       document-start
// @downloadURL https://update.greasyfork.org/scripts/554845/Roblox%20Mass%20Appeal.user.js
// @updateURL https://update.greasyfork.org/scripts/554845/Roblox%20Mass%20Appeal.meta.js
// ==/UserScript==

(function () {
    'use strict';

    console.log("Roblox Mass Appeal [v2.1]: Script active.");

    const APPEAL_MESSAGE_PLACEHOLDER = "I believe this moderation was a mistake. I respectfully request a review. Thank you";

    const DEFAULT_MESSAGES = [
        APPEAL_MESSAGE_PLACEHOLDER,
        "This asset was falsely flagged for this moderation category.",
        "Please review it manually, as I believe it does not violate Roblox's policies.",
        "This asset appears to have been incorrectly flagged and does not violate Roblox's policies.",
        "I believe this moderation action was applied in error and request a manual review of the asset.",
        "This asset does not match the moderation category it was flagged under and should be reviewed manually."
    ];

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
            console.log("✅ Got fresh CSRF token");
            return token;
        } catch (e) {
            console.error("Failed to get token:", e);
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
                <button class="custom-message-delete" data-index="${idx}" type="button">❌</button>
            `;
            listContainer.appendChild(item);
        });

        listContainer.querySelectorAll('.custom-message-delete').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-index'), 10);
                const current = getCustomMessages();
                current.splice(index, 1);
                saveCustomMessages(current);
                renderCustomMessages();
            });
        });
    }

    function addAppealUI(injectionPoint) {
        if (document.getElementById('mass-appeal-container')) return;

        const container = document.createElement('div');
        container.id = 'mass-appeal-container';
        container.innerHTML = `
            <div class="mass-appeal-header">
                <h2>Mass Appeal Tool v2.1</h2>
                <button id="mass-appeal-settings-btn" type="button">⚙️ Settings</button>
            </div>
            <p>Enter message and click the button. Now with auto token retry on 403.</p>
            <textarea id="mass-appeal-message" placeholder="Enter your appeal message here...">${APPEAL_MESSAGE_PLACEHOLDER}</textarea>

            <div class="mass-appeal-controls">
                <label class="toggle-container">
                    <input type="checkbox" id="mass-appeal-randomize">
                    Randomize appeal message
                </label>
                <button id="mass-appeal-button">Appeal All Found Items</button>
            </div>

            <div id="mass-appeal-settings-panel" style="display: none;">
                <h3>Custom Random Appeal Messages</h3>
                <div id="mass-appeal-custom-list"></div>
                <div class="add-message-container">
                    <textarea id="mass-appeal-new-message" placeholder="Type a new appeal message to add to pool..."></textarea>
                    <button id="mass-appeal-add-btn" type="button">Add Message</button>
                </div>
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
        `);

        // Checkbox persistence loading
        const randomizeCheckbox = document.getElementById('mass-appeal-randomize');
        randomizeCheckbox.checked = localStorage.getItem('mass-appeal-randomize-enabled') === 'true';
        randomizeCheckbox.addEventListener('change', (e) => {
            localStorage.setItem('mass-appeal-randomize-enabled', e.target.checked);
        });

        // Register action events
        document.getElementById('mass-appeal-button').addEventListener('click', handleAppealAll);

        // Settings panel open/close actions
        document.getElementById('mass-appeal-settings-btn').addEventListener('click', () => {
            const panel = document.getElementById('mass-appeal-settings-panel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            renderCustomMessages();
        });

        document.getElementById('mass-appeal-settings-close').addEventListener('click', () => {
            document.getElementById('mass-appeal-settings-panel').style.display = 'none';
        });

        // Add custom message action
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
                        reject({status: 403, body: r.responseText, newToken});
                    } else {
                        reject({status: r.status, body: r.responseText || r.statusText});
                    }
                },
                onerror: () => reject({status: 0, body: "Network error"})
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

        const userId = getUserId();
        if (!userId) {
            log("Could not find User ID. Are you logged in?", true);
            resetButton(); return;
        }

        log(`User ID: ${userId}`);

        let csrfToken;
        try {
            csrfToken = await getValidToken();
            log("✅ CSRF token ready");
        } catch (e) {
            log("❌ Failed to get CSRF token", true);
            resetButton(); return;
        }

        const violationLinks = Array.from(document.querySelectorAll('a[href^="#/v/"]'));
        const violationIds = [...new Set(violationLinks.map(link => link.href.split('#/v/')[1]).filter(Boolean))];

        if (violationIds.length === 0) {
            log("No violations found on this page.", true);
            resetButton(); return;
        }

        log(`Found ${violationIds.length} violations. Sending...`);

        const messagePool = getAllMessages();

        for (let i = 0; i < violationIds.length; i++) {
            const id = violationIds[i];
            let attempts = 0;
            const maxAttempts = 2;

            let messageToSend = message;
            if (randomize) {
                if (messagePool.length > 0) {
                    messageToSend = messagePool[Math.floor(Math.random() * messagePool.length)];
                } else {
                    messageToSend = APPEAL_MESSAGE_PLACEHOLDER;
                }
            }

            while (attempts < maxAttempts) {
                try {
                    await sendAppealRequest(userId, id, messageToSend, csrfToken);
                    log(`[${i+1}/${violationIds.length}] ✅ SUCCESS: ${id} ("${messageToSend.substring(0, 45)}...")`);
                    break;
                } catch (err) {
                    attempts++;
                    if (err.status === 403 && attempts < maxAttempts) {
                        log(`[${i+1}/${violationIds.length}] 403 - Refreshing token and retrying...`, false);
                        if (err.newToken) csrfToken = err.newToken;
                        else csrfToken = await getValidToken();
                        continue;
                    }
                    log(`[${i+1}/${violationIds.length}] ❌ FAILED: ${id} → ${err.body || err.status}`, true);
                    break;
                }
            }
        }

        log("✅ All done! Reloading in 5 seconds...");
        button.textContent = 'Finished!';
        setTimeout(() => location.reload(), 5000);
    }

    function getUserId() {
        const match = document.querySelector('a[href*="/users/"]')?.href.match(/\/users\/(\d+)/);
        return match ? match[1] : document.querySelector('meta[name="user-id"]')?.content || null;
    }

    function resetButton() {
        const btn = document.getElementById('mass-appeal-button');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Appeal All Found Items';
        }
    }

    // UI Injection
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        const selectors = ['#report-appeals-app', 'div[role="main"]', '#container-main', '#content', 'body'];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && !document.getElementById('mass-appeal-container')) {
                addAppealUI(el);
                clearInterval(interval);
                return;
            }
        }
        if (attempts > 30) {
            clearInterval(interval);
            addAppealUI(document.body);
        }
    }, 600);
})();
