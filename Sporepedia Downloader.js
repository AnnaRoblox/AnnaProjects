// ==UserScript==
// @name         Sporepedia Downloader
// @namespace    https://github.com/AnnaRoblox
// @version      2.5
// @description  download creations from sporepedia includes automatic category sorting
// @author       AnnaRoblox
// @match        https://www.spore.com/sporepedia*
// @match        https://www.spore.com/*sast-*
// @match        https://www.spore.com/*ssc-*
// @match        https://www.spore.com/*advasrch-*
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

/* ========== CONFIG ========== */
const maxSingle = 3;          // ≤ this many → individual downloads
const zipName   = 'Sporepedia-Pack.zip';
/* ============================ */

/* ---------- state ---------- */
const queue = new Map(); // Stores { id => categoryFolderName }

/* ---------- helpers ---------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);

function downloadURL(url, fname) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function fetchBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error ${response.status} for ${url}`);
  return response.blob();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error ${response.status} for ${url}`);
  return response.text();
}

function mapCategoryToFolderName(rawCategory) {
    const cat = rawCategory.toLowerCase();
    // category mappings
    if (cat.includes('creature') || cat === 'adv_unset') return 'Creatures';
    if (cat === 'house' || cat === 'building' || cat === 'entertainment' || cat === 'city_hall') return 'Buildings';
    if (cat === 'ufo') return 'UFOs';
    if (cat.includes('_land') || cat.includes('_air') || cat.includes('_water') || cat.startsWith('veh')) return 'Vehicles';
    return rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1).toLowerCase();
}

/* ---------- single creation (individual download) ---------- */
async function downloadCreation(id) {
  try {
    const metaUrl = `https://www.spore.com/static/model/${id.slice(0,3)}/${id.slice(3,6)}/${id.slice(6,9)}/${id}.xml`;
    const xmltxt = await fetchText(metaUrl);
    const xml = new DOMParser().parseFromString(xmltxt, 'application/xml');
    const pngUrl = `https://www.spore.com/static/thumb/${id.slice(0,3)}/${id.slice(3,6)}/${id.slice(6,9)}/${id}.png`;
    downloadURL(pngUrl, `${id}.png`);
    for (const n of xml.querySelectorAll('asset')) {
        const subId = n.textContent.trim();
        const subPng = `https://www.spore.com/static/thumb/${subId.slice(0,3)}/${subId.slice(3,6)}/${subId.slice(6,9)}/${subId}.png`;
        downloadURL(subPng, `${subId}.png`);
    }
  } catch (error) {
    console.error(`Failed to download single creation ${id}:`, error);
    alert(`Could not download creation ${id}. It might have been deleted. Check console for details.`);
  }
}

/* ---------- ZIP downloader with category folders ---------- */
async function downloadQueueAsZip() {
  if (queue.size === 0) return alert('Queue is empty.');
  if (typeof JSZip === 'undefined') await loadJSZip();

  const dlBtn = $('#spdl-dl-all');
  if (dlBtn) dlBtn.disabled = true;

  const zip = new JSZip();


  const idsToProcess = [...queue];
  const total = idsToProcess.length;
  let processed = 0;
  let failures = 0;

  for (const [id, categoryFolder] of idsToProcess) {
    processed++;
    const statusMsg = `Processing ${processed}/${total}...`;
    console.log(statusMsg, `(ID: ${id}, Folder: ${categoryFolder})`);
    if(dlBtn) dlBtn.textContent = statusMsg;

    try {
      const metaUrl = `https://www.spore.com/static/model/${id.slice(0,3)}/${id.slice(3,6)}/${id.slice(6,9)}/${id}.xml`;
      const xmltxt  = await fetchText(metaUrl);
      const xml     = new DOMParser().parseFromString(xmltxt, 'application/xml');

      //  Create folders directly on the main zip object.
      const catFolder = zip.folder(categoryFolder);

      const pngUrl = `https://www.spore.com/static/thumb/${id.slice(0,3)}/${id.slice(3,6)}/${id.slice(6,9)}/${id}.png`;
      const pngBlob = await fetchBlob(pngUrl);
      catFolder.file(`${id}.png`, pngBlob);

      const assetPromises = [...xml.querySelectorAll('asset')].map(async n => {
        const subId   = n.textContent.trim();
        const subPngUrl  = `https://www.spore.com/static/thumb/${subId.slice(0,3)}/${subId.slice(3,6)}/${subId.slice(6,9)}/${subId}.png`;
        const subBlob = await fetchBlob(subPngUrl);
        catFolder.file(`${subId}.png`, subBlob);
      });
      await Promise.all(assetPromises);
    } catch (error) {
      failures++;
      console.error(`Failed to process creation ID ${id}:`, error);
    }
  }

  if (failures > 0) {
    alert(`Finished, but ${failures} of ${total} creations failed to download. Check console for details.`);
  }

  if(dlBtn) dlBtn.textContent = 'Zipping...';
  console.log('Generating ZIP file...');

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadURL(URL.createObjectURL(zipBlob), zipName);
}

function loadJSZip() {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* ---------- UI ---------- */
// styles for a sticky top banner.
GM_addStyle(`
#spdl-float {
  position: sticky;
  top: 0;
  z-index: 9999;
  background: #222;
  color: #fff;
  padding: 10px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,.6);
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
}
#spdl-float span {
  margin-right: 15px;
}
#spdl-float button {
  margin: 0 8px;
  padding: 4px 10px;
  cursor: pointer;
}
#spdl-float button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
.spdl-plus {
  margin-left: 6px; padding: 2px 6px; font-size: 12px; cursor: pointer;
  background: #444; color: #fff; border: none; border-radius: 3px;
}
.spdl-plus:hover { background: #666; }
.spdl-plus:disabled { background: #2a7532; cursor: default; }
`);

const float = document.createElement('div');
float.id = 'spdl-float';
// Prepend to body for sticky positioning to work best.
document.body.prepend(float);

function renderFloat() {
  const cnt = queue.size;
  float.innerHTML = `
    <span>Queue: <b>${cnt}</b></span>
    <button id="spdl-dl-all">Download all</button>
    <button id="spdl-queue-all">Queue all</button>
    <button id="spdl-clear">Clear</button>
  `;
  $('#spdl-dl-all').onclick = () => {
    if (queue.size === 0) return alert('Queue is empty.');
    if (queue.size <= maxSingle) {
      queue.forEach((_cat, id) => downloadCreation(id));
      queue.clear();
      renderFloat();
    } else {
      downloadQueueAsZip().finally(() => {
        queue.clear();
        renderFloat();
      });
    }
  };
  $('#spdl-queue-all').onclick = () => {
    const items = getVisibleCreations();
    let added = 0;
    items.forEach(item => { if (!queue.has(item.id)) { queue.set(item.id, item.category); added++; } });
    renderFloat();
    if (added) alert(`Added ${added} new creation(s) to queue.`);
    else alert('All visible creations are already in the queue.');
  };
  $('#spdl-clear').onclick = () => { queue.clear(); renderFloat(); };
}

/* ---------- thumbs helpers ---------- */
function getVisibleCreations() {
  const creations = [];
  const imgs = document.querySelectorAll('img.js-asset-thumbnail[src*="/static/thumb/"]');
  imgs.forEach(img => {
    const idMatch = img.src.match(/\/([0-9]{9,})\.png/);
    if (!idMatch) return;
    const id = idMatch[1];
    const assetContainer = img.closest('.js-asset-view');
    const typeIconDiv = assetContainer?.querySelector('.typeIcon > div');
    const rawCategory = typeIconDiv ? typeIconDiv.className : 'Other';
    const category = mapCategoryToFolderName(rawCategory);
    creations.push({ id, category });
  });
  return Array.from(new Map(creations.map(c => [c.id, c])).values());
}

function addPlusButtons() {
  const imgs = document.querySelectorAll('img.js-asset-thumbnail[src*="/static/thumb/"]');
  imgs.forEach(img => {
    if (img.dataset.spdl) return;
    img.dataset.spdl = '1';
    const idMatch = img.src.match(/\/([0-9]{9,})\.png/);
    if (!idMatch) return;
    const id = idMatch[1];
    const assetContainer = img.closest('.js-asset-view');
    const typeIconDiv = assetContainer?.querySelector('.typeIcon > div');
    const rawCategory = typeIconDiv ? typeIconDiv.className : 'Other';
    const categoryFolder = mapCategoryToFolderName(rawCategory);
    const btn = document.createElement('button');
    btn.className = 'spdl-plus';
    btn.textContent = '+ Queue';
    btn.title = 'Add to download queue';
    btn.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      queue.set(id, categoryFolder);
      renderFloat();
      btn.textContent = '✓ Queued';
      btn.disabled = true;
    };
    if (getComputedStyle(img.parentElement).position === 'static') {
        img.parentElement.style.position = 'relative';
    }
    img.parentElement.appendChild(btn);
  });
}

/* ---------- boot ---------- */
renderFloat();
addPlusButtons();
const mo = new MutationObserver(() => addPlusButtons());
mo.observe(document.body, { childList: true, subtree: true });
