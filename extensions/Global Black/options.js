// options.js //s

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENT SELECTION ---
    const globalRulesTable = document.querySelector('#globalRulesTable tbody');
    const siteRulesTable = document.querySelector('#siteRulesTable tbody');
    const exportBtn = document.getElementById('exportRulesBtn');
    const importInput = document.getElementById('importRulesInput');
    const textImportArea = document.getElementById('textImportArea');
    const applyTextImportBtn = document.getElementById('applyTextImportBtn');
    const siteSelector = document.getElementById('siteSelector');
    const tabs = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    
    let allRules = {};

    // --- UI & RENDER LOGIC ---
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabContents.forEach(c => c.classList.remove('active'));
            document.getElementById(e.target.dataset.tab).classList.add('active');
        });
    });
    
    function escapeHTML(str) {
        if (str === null || typeof str === 'undefined') return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function populateSiteSelector() {
        const currentSelection = siteSelector.value;
        siteSelector.innerHTML = '';
        const siteKeys = Object.keys(allRules).filter(key => key !== 'global');
        
        if (siteKeys.length === 0) {
            const option = document.createElement('option');
            option.textContent = 'No sites with specific rules';
            option.disabled = true;
            siteSelector.appendChild(option);
        } else {
            siteKeys.sort().forEach(site => {
                const option = document.createElement('option');
                option.value = site;
                option.textContent = site;
                siteSelector.appendChild(option);
            });
        }
        if (siteKeys.includes(currentSelection)) { siteSelector.value = currentSelection; }
    }
    
    // ** FUNCTION RESTORED **
    function renderGlobalRules() {
        globalRulesTable.innerHTML = '';
        const rules = allRules.global || [];
        rules.forEach((rule, index) => renderRow(globalRulesTable, rule, index, 'global'));
    }

    // ** FUNCTION RESTORED **
    function renderSiteRules() {
        siteRulesTable.innerHTML = '';
        const selectedSite = siteSelector.value;
        if (!selectedSite || !allRules[selectedSite]) {
            siteRulesTable.innerHTML = '<tr><td colspan="4">Select a site to view its rules.</td></tr>';
            return;
        }
        const rules = allRules[selectedSite] || [];
        if (rules.length === 0) {
            siteRulesTable.innerHTML = `<tr><td colspan="4">No rules for ${selectedSite}.</td></tr>`;
        } else {
            rules.forEach((rule, index) => renderRow(siteRulesTable, rule, index, selectedSite));
        }
    }
    
    function renderAllTables() {
        populateSiteSelector();
        renderGlobalRules();
        renderSiteRules();
    }
    
    function renderRow(table, rule, index, scope) {
        if (!rule) { console.error(`Attempted to render an undefined rule.`); return; }
        const row = table.insertRow();
        row.dataset.index = index;
        row.dataset.scope = scope;
        row.innerHTML = `
            <td data-field="selector"><code>${escapeHTML(rule.selector)}</code></td>
            <td data-field="action">${escapeHTML(rule.action)}</td>
            <td data-field="css"><code>${escapeHTML(rule.css || '')}</code></td>
            <td class="actions">
                <button class="edit-btn">Edit</button>
                <button class="delete-btn">Delete</button>
            </td>
        `;
    }

    function parseCss(cssText = '') {
        const bgMatch = cssText.match(/background(?:-color)?\s*:\s*([^;!]+)/);
        const colorMatch = cssText.match(/color\s*:\s*([^;!]+)/);
        return {
            background: bgMatch ? bgMatch[1].trim() : '#000000',
            color: colorMatch ? colorMatch[1].trim() : '#ffffff',
        };
    }

    function turnRowToEditMode(row) {
        const rule = allRules[row.dataset.scope][row.dataset.index];
        const selectorCell = row.querySelector('[data-field="selector"]');
        const actionCell = row.querySelector('[data-field="action"]');
        const cssCell = row.querySelector('[data-field="css"]');
        
        selectorCell.innerHTML = `<input type="text" value="${escapeHTML(rule.selector)}">`;
        actionCell.innerHTML = `<select><option value="exclude" ${rule.action === 'exclude' ? 'selected' : ''}>exclude</option><option value="force-black" ${rule.action === 'force-black' ? 'selected' : ''}>force-black</option><option value="invert" ${rule.action === 'invert' ? 'selected' : ''}>invert</option><option value="custom" ${rule.action === 'custom' ? 'selected' : ''}>custom</option></select>`;
        
        if (rule.action === 'custom') {
            const colors = parseCss(rule.css);
            cssCell.innerHTML = `
                <div class="color-picker-wrapper">
                    <div class="color-input-group">
                        <label>Background</label>
                        <input type="color" value="${colors.background}">
                        <input type="text" class="color-hex" value="${colors.background}">
                    </div>
                    <div class="color-input-group">
                        <label>Text</label>
                        <input type="color" value="${colors.color}">
                        <input type="text" class="color-hex" value="${colors.color}">
                    </div>
                </div>
            `;
            cssCell.querySelectorAll('input[type="color"]').forEach(picker => {
                picker.addEventListener('input', (e) => { e.target.nextElementSibling.value = e.target.value; });
            });
            cssCell.querySelectorAll('input.color-hex').forEach(textInput => {
                textInput.addEventListener('input', (e) => { e.target.previousElementSibling.value = e.target.value; });
            });
        } else {
            cssCell.innerHTML = `<input type="text" value="${escapeHTML(rule.css || '')}" placeholder="Only used for 'custom' action" disabled>`;
        }
        
        row.querySelector('.actions').innerHTML = `<button class="save-btn">Save</button><button class="cancel-btn">Cancel</button>`;
    }
    
    // --- DATA HANDLING & EVENT LISTENERS ---
    async function loadAndRenderAll() {
        allRules = await chrome.runtime.sendMessage({ action: 'getAllRules' });
        renderAllTables();
    }
    
    async function updateAllRules(newRules) {
        await chrome.runtime.sendMessage({ action: 'setAllRules', payload: newRules });
        await loadAndRenderAll();
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: 'rulesUpdated' }).catch(() => {}));
        });
    }
    
    document.body.addEventListener('click', async (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        const row = e.target.closest('tr');
        if (!row || !row.dataset.scope) return;
        const scope = row.dataset.scope;
        const index = parseInt(row.dataset.index);

        if (e.target.matches('.delete-btn')) {
            if (confirm('Are you sure you want to delete this rule?')) {
                allRules[scope].splice(index, 1);
                if (scope !== 'global' && allRules[scope].length === 0) delete allRules[scope];
                await updateAllRules(allRules);
            }
        } else if (e.target.matches('.edit-btn')) {
            turnRowToEditMode(row);
        } else if (e.target.matches('.cancel-btn')) {
            renderAllTables();
        } else if (e.target.matches('.save-btn')) {
            const newSelector = row.querySelector('[data-field="selector"] input').value.trim();
            const newAction = row.querySelector('[data-field="action"] select').value;
            let newCss = '';

            if (newAction === 'custom') {
                const colorPickers = row.querySelectorAll('.color-picker-wrapper input.color-hex');
                if (colorPickers.length === 2) {
                    const bgColor = colorPickers[0].value;
                    const textColor = colorPickers[1].value;
                    newCss = `background-color: ${bgColor} !important; color: ${textColor} !important;`;
                } else {
                    newCss = row.querySelector('[data-field="css"] input').value.trim();
                }
            } else {
                 newCss = row.querySelector('[data-field="css"] input')?.value.trim() || '';
            }

            if (!newSelector) { alert("Selector cannot be empty."); return; }
            allRules[scope][index] = { selector: newSelector, action: newAction, css: newCss };
            await updateAllRules(allRules);
        }
    });

    siteSelector.addEventListener('change', renderSiteRules);

    applyTextImportBtn.addEventListener('click', async () => {
        const text = textImportArea.value.trim();
        if (!text) return;
        const lines = text.split('\n').filter(line => line.trim() && !line.startsWith('!'));
        if (!lines.length) return;
        const newRules = []; let errorCount = 0;
        lines.forEach(line => {
            const parts = line.split('##');
            let hostname = 'global', ruleText = '';
            if (parts.length === 2) { hostname = parts[0].trim() || 'global'; ruleText = parts[1].trim(); }
            else if (parts.length === 1) { ruleText = parts[0].trim(); }
            else { errorCount++; return; }
            const ruleParts = ruleText.split(/\s+/);
            const selector = ruleParts.shift();
            const action = ruleParts.shift() || 'exclude';
            const css = ruleParts.join(' ');
            if (!selector) { errorCount++; return; }
            newRules.push({ hostname, rule: { selector, action, css } });
        });
        if (errorCount > 0) { alert(`Could not parse ${errorCount} rule(s).`); }
        if (newRules.length > 0) {
            if (confirm(`You are about to add ${newRules.length} new rule(s). Continue?`)) {
                newRules.forEach(({ hostname, rule }) => {
                    if (!allRules[hostname]) { allRules[hostname] = []; }
                    const exists = allRules[hostname].some(r => r.selector === rule.selector);
                    if (!exists) { allRules[hostname].push(rule); }
                });
                await updateAllRules(allRules);
                textImportArea.value = '';
                alert(`${newRules.length} rule(s) processed and added.`);
            }
        }
    });

    exportBtn.addEventListener('click', () => {
        if (!allRules || Object.keys(allRules).length === 0) { alert("No rules to export."); return; }
        const blob = new Blob([JSON.stringify(allRules, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url: url, filename: `global-black-rules-backup.json`, saveAs: true });
    });
    
    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedRules = JSON.parse(event.target.result);
                if (confirm('This will overwrite all your existing rules. Are you sure?')) {
                    await updateAllRules(importedRules);
                    alert('Rules imported successfully!');
                }
            } catch (err) {
                alert('Error parsing file.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    // --- INITIALIZATION ---
    loadAndRenderAll();
});