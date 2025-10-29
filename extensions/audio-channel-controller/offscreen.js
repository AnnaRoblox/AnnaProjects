// offscreen.js (FINAL, CORRECTED VERSION)

const tabAudioContexts = new Map();

// The onMessage listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target !== 'offscreen') return;

  switch (request.type) {
    case 'START_CAPTURE':
      // This can be a "fire and forget" operation
      startCapture(request.tabId, request.streamId, request.channel);
      break;
    case 'CHANGE_CHANNEL':
      changeChannel(request.tabId, request.channel);
      break;
    case 'SET_VOLUME':
      setVolume(request.tabId, request.volume);
      break;
    case 'RESET_AUDIO':
      // --- THE CRITICAL FIX ---
      // 1. Immediately send the reply to un-stick the background script.
      sendResponse({ done: true });

      // 2. NOW, perform the cleanup asynchronously.
      (async () => {
        await stopCapture(request.tabId);
        // 3. After cleanup, check if we need to close.
        if (tabAudioContexts.size === 0) {
          self.close();
        }
      })();

      // 4. Return true because we are doing async work *after* sending the response.
      return true;
    default:
      console.warn(`Unexpected message type received: '${request.type}'.`);
  }
});


// This function is now simplified and only does cleanup.
async function stopCapture(tabId) {
    const tabData = tabAudioContexts.get(tabId);
    if (tabData) {
        console.log(`[Offscreen] Cleaning up resources for tab ${tabId}`);
        tabData.stream.getTracks().forEach(track => track.stop());
        await tabData.audioContext.close();
        tabAudioContexts.delete(tabId);
    }
}

// --- Paste your other working functions here ---
async function startCapture(tabId, streamId, channelType) {
  if (tabAudioContexts.has(tabId)) { return; }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }
  });
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const panner = audioContext.createStereoPanner();
  const gainNode = audioContext.createGain();
  source.connect(panner);
  panner.connect(gainNode);
  gainNode.connect(audioContext.destination);
  tabAudioContexts.set(tabId, { audioContext, source, stream, panner, gainNode });
  changeChannel(tabId, channelType); 
  stream.getAudioTracks()[0].onended = () => { stopCapture(tabId); };
}

function changeChannel(tabId, channelType) {
  const tabData = tabAudioContexts.get(tabId);
  if (!tabData) return;
  const { panner } = tabData;
  if (channelType === 'FORCE_LEFT') panner.pan.value = -1;
  else if (channelType === 'FORCE_RIGHT') panner.pan.value = 1;
}

function setVolume(tabId, volume) {
  const tabData = tabAudioContexts.get(tabId);
  if (!tabData) return;
  tabData.gainNode.gain.value = volume;
}