document.addEventListener('DOMContentLoaded', () => {
    const pickElementBtn = document.getElementById('pickElementBtn');
    const openOptionsBtn = document.createElement('button');
    openOptionsBtn.textContent = 'Manage Rules (Options)';
    
    // Replace the rules list with the new button
    const rulesList = document.getElementById('rulesList');
    rulesList.parentNode.replaceChild(openOptionsBtn, rulesList);
    
    // Function to send a message to the content script
    function sendMessageToContentScript(message) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, message).catch(() => console.log("Could not contact content script."));
            }
        });
    }

    pickElementBtn.addEventListener('click', () => {
        sendMessageToContentScript({ action: 'start-selection' });
        window.close();
    });

    openOptionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
        window.close();
    });
});