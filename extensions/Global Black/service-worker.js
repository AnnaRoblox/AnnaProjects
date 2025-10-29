// service-worker.js - Version 8.0 (Scalable Storage)

// --- Command Listener (Unchanged) ---
chrome.commands.onCommand.addListener(async (command, tab) => { /* ... Unchanged ... */ });
chrome.commands.onCommand.addListener(async (command, tab) => { if (command === "toggle-picker") { if (tab && tab.id) { try { await chrome.tabs.sendMessage(tab.id, { action: "start-selection" }); } catch (e) { console.warn(`Global Black: Could not open picker on this page.`); } } } });

// --- Message Listener (Heavily Updated) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    switch (request.action) {
      
      case 'getRulesForHost': {
        const globalKey = 'rules_global';
        const siteKey = 'rules_' + request.hostname.replace(/\./g, '_');
        
        const data = await chrome.storage.sync.get([globalKey, siteKey]);
        const globalRules = data[globalKey] || [];
        const siteRules = data[siteKey] || [];
        
        sendResponse([...globalRules, ...siteRules]);
        break;
      }

      case 'saveRule': {
        const { selector, action, css, scope } = request.payload;
        const key = 'rules_' + scope.replace(/\./g, '_');

        const data = await chrome.storage.sync.get(key);
        const rulesInScope = data[key] || [];

        const existingIndex = rulesInScope.findIndex(r => r.selector === selector);
        if (existingIndex > -1) rulesInScope.splice(existingIndex, 1);
        
        rulesInScope.push({ selector, action, css });
        
        await chrome.storage.sync.set({ [key]: rulesInScope });
        sendResponse({ success: true });
        break;
      }

      case 'getAllRules': {
        const allData = await chrome.storage.sync.get(null);
        const allRules = {};
        for (const key in allData) {
            if (key.startsWith('rules_')) {
                const scope = key.substring('rules_'.length).replace(/_/g, '.');
                allRules[scope] = allData[key];
            }
        }
        sendResponse(allRules);
        break;
      }
    
      case 'setAllRules': {
        // This is for import/delete. It's more complex now.
        // 1. Clear all existing rules.
        const allData = await chrome.storage.sync.get(null);
        const keysToRemove = Object.keys(allData).filter(k => k.startsWith('rules_'));
        if (keysToRemove.length > 0) {
            await chrome.storage.sync.remove(keysToRemove);
        }

        // 2. Set new rules, one key per scope.
        const newRules = request.payload;
        const newStorageObject = {};
        for (const scope in newRules) {
            const key = 'rules_' + scope.replace(/\./g, '_');
            newStorageObject[key] = newRules[scope];
        }
        await chrome.storage.sync.set(newStorageObject);

        // 3. Notify tabs and respond.
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          try { chrome.tabs.sendMessage(tab.id, { action: 'rulesUpdated' }); } 
          catch (e) { /* Ignore tabs */ }
        }
        sendResponse({ success: true });
        break;
      }
    }
  })();

  return true;
});