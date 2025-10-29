document.addEventListener('DOMContentLoaded', () => {
  const buttons = {
    left: document.getElementById('force-left'),
    right: document.getElementById('force-right'),
    reset: document.getElementById('reset')
  };
  const volumeControl = document.getElementById('volume-control');
  const volumeSlider = document.getElementById('volume-slider');

  let activeTabId = null;

  // --- Main Initialization ---
  // When the popup opens, get the active tab and check its state.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    activeTabId = tabs[0].id;

    // Ask the background script for the state of this tab
    chrome.runtime.sendMessage({ type: 'GET_TAB_STATE', tabId: activeTabId }, (response) => {
      if (response.isCaptured) {
        // If captured, show the volume control and set its value
        volumeControl.style.display = 'block';
        volumeSlider.value = response.volume;
      } else {
        // If not captured, hide the volume control
        volumeControl.style.display = 'none';
      }
    });
  });

  // --- Event Listeners ---

  // Generic function to send a command to the background script
  function sendCommand(type) {
    if (activeTabId) {
      chrome.runtime.sendMessage({ type: type, tabId: activeTabId });
      // If the command is a capture, immediately show the volume control
      if (type === 'FORCE_LEFT' || type === 'FORCE_RIGHT') {
        volumeControl.style.display = 'block';
      }
    }
  }

  // Listener for the volume slider
  volumeSlider.addEventListener('input', (e) => {
    if (activeTabId) {
      const volume = parseFloat(e.target.value);
      chrome.runtime.sendMessage({
        type: 'SET_VOLUME',
        tabId: activeTabId,
        volume: volume
      });
    }
  });

  buttons.left.addEventListener('click', () => sendCommand('FORCE_LEFT'));
  buttons.right.addEventListener('click', () => sendCommand('FORCE_RIGHT'));
  buttons.reset.addEventListener('click', () => {
    sendCommand('RESET_AUDIO');
    // Hide volume control on reset
    volumeControl.style.display = 'none';
    volumeSlider.value = 1; // Reset slider for next time
  });
});