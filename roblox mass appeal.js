// ==UserScript==
// @name         Roblox Mass Appeal
// @namespace    github.com/annaroblox
// @version      2.0
// @description  Adds a button to appeal all appealable items with concurrent requests. Improved X-CSRF handling.
// @author       AnnaRoblox
// @match        *://*.roblox.com/report-appeals*
// @match        *://*.roblox.com/*/report-appeals*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      apis.roblox.com
// @connect      auth.roblox.com
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    console.log("Roblox Mass Appeal [v2.0]: Script active.");

    const APPEAL_MESSAGE_PLACEHOLDER = "I believe this moderation was a mistake. I respectfully request a review. Thank you";

    let currentCsrfToken = null;

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

    function addAppealUI(injectionPoint) {
        if (document.getElementById('mass-appeal-container')) return;

        const container = document.createElement('div');
        container.id = 'mass-appeal-container';
        container.innerHTML = `
            <h2>Mass Appeal Tool v2.0</h2>
            <p>Enter message and click the button. Now with auto token retry on 403.</p>
            <textarea id="mass-appeal-message" placeholder="Enter your appeal message here...">${APPEAL_MESSAGE_PLACEHOLDER}</textarea>
            <button id="mass-appeal-button">Appeal All Found Items</button>
            <div id="mass-appeal-status"></div>
        `;
        injectionPoint.prepend(container);

        GM_addStyle(`
            #mass-appeal-container { background:#2c2f33; color:#fff; padding:20px; margin:15px 0; border:1px solid #444; border-radius:8px; z-index:9999; }
            #mass-appeal-message { width:98%; height:110px; padding:10px; background:#23272a; color:#fff; border:1px solid #555; border-radius:4px; }
            #mass-appeal-button { background:#7289da; color:white; padding:12px 20px; border:none; border-radius:5px; cursor:pointer; font-size:16px; }
            #mass-appeal-button:hover { background:#677bc4; }
            #mass-appeal-button:disabled { background:#555; cursor:not-allowed; }
            #mass-appeal-status { margin-top:15px; padding:12px; background:#23272a; border-radius:4px; max-height:350px; overflow-y:auto; font-family:monospace; }
        `);

        document.getElementById('mass-appeal-button').addEventListener('click', handleAppealAll);
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
                        // Try to extract new token
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

        button.disabled = true;
        button.textContent = 'Processing...';
        statusDiv.innerHTML = '';

        const log = (text, isError = false) => logStatus(statusDiv, text, isError);

        if (!message) {
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

        for (let i = 0; i < violationIds.length; i++) {
            const id = violationIds[i];
            let attempts = 0;
            const maxAttempts = 2;

            while (attempts < maxAttempts) {
                try {
                    await sendAppealRequest(userId, id, message, csrfToken);
                    log(`[${i+1}/${violationIds.length}] ✅ SUCCESS: ${id}`);
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
