// background.js (FINAL, CLEAN VERSION)

const capturedTabs = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.type === 'GET_TAB_STATE') {
      const state = capturedTabs.has(request.tabId) 
          ? { isCaptured: true, volume: capturedTabs.get(request.tabId).currentVolume }
          : { isCaptured: false, volume: 1.0 };
      sendResponse(state);
      return;
    }

    if (!request.tabId) return;
    await setupOffscreenDocument('offscreen.html');

    const tabId = request.tabId;
    switch (request.type) {
      case 'SET_VOLUME':
        if (capturedTabs.has(tabId)) {
          capturedTabs.get(tabId).currentVolume = request.volume;
          await chrome.runtime.sendMessage({ ...request, target: 'offscreen' });
        }
        break;
      case 'RESET_AUDIO':
        await stopCapturingTab(tabId);
        break;
      case 'FORCE_LEFT':
      case 'FORCE_RIGHT':
        if (capturedTabs.has(tabId)) {
          await stopCapturingTab(tabId); 
        }
        await startCapturingTab(tabId, request.type);
        break;
    }
  })();
  return true;
});

async function startCapturingTab(tabId, channel) {
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    const lastVolume = capturedTabs.get(tabId)?.currentVolume || 1.0;
    
    // We no longer need to read the initial mute state.
    capturedTabs.set(tabId, { streamId, currentVolume: lastVolume });

    await chrome.tabs.update(tabId, { muted: true }); // Mute the tab for capture.
    
    await chrome.runtime.sendMessage({ type: 'START_CAPTURE', streamId, channel, tabId, target: 'offscreen' });
    await chrome.runtime.sendMessage({ type: 'SET_VOLUME', volume: lastVolume, tabId, target: 'offscreen' });
  } catch (error) {
    console.error(`[Background] Failed to start capture for tab ${tabId}:`, error.message);
    await chrome.tabs.update(tabId, { muted: false }).catch(() => {}); // Unmute on failure.
    capturedTabs.delete(tabId);
  }
}

async function stopCapturingTab(tabId) {
    if (capturedTabs.has(tabId)) {
        // --- THE FIX ---
        // Instead of restoring the old state, just unmute the tab.
        // This gives control back to the user in a predictable way.
        await chrome.tabs.update(tabId, { muted: false }).catch(() => {});
        
        try {
            await chrome.runtime.sendMessage({ type: 'RESET_AUDIO', tabId: tabId, target: 'offscreen' });
        } catch (error) {
            // Ignore "Receiving end does not exist" error if offscreen is already closed.
            if (!error.message.includes('Receiving end does not exist')) {
                console.error('[Background] Error during stopCapture message:', error);
            }
        }
        capturedTabs.delete(tabId);
    }
}

// Event listener for tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
    // When a tab is closed, we don't need to unmute it, just clean up state.
    if (capturedTabs.has(tabId)) {
        capturedTabs.delete(tabId);
        try {
            await chrome.runtime.sendMessage({ type: 'RESET_AUDIO', tabId, target: 'offscreen' });
        } catch(e) { /* Offscreen might already be gone, that's okay */ }
    }
});

// Offscreen document setup
let creating; 
async function setupOffscreenDocument(path) {
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [offscreenUrl] });
  if (existingContexts.length > 0) return;
  if (creating) { await creating; } 
  else {
    creating = chrome.offscreen.createDocument({ url: path, reasons: ['AUDIO_PLAYBACK'], justification: 'Process audio from a tab capture stream.' });
    await creating;
    creating = null;
  }
}