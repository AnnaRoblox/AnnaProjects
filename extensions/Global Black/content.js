// Global Black //

(() => {
  "use strict";

  /* ----------  1.  Minimal dark-scheme injection  ---------- */
  (() => {
    if (document.getElementById("global-black-pre-style")) return;
    const s = document.createElement("style");
    s.id = "global-black-pre-style";
    s.textContent = ":root { color-scheme: dark !important; }";
    document.documentElement.appendChild(s);
  })();

  /* ----------  2.  Main extension logic  ---------- */
  function initGlobalBlack() {
    if (window.globalBlackInitialized) return;
    window.globalBlackInitialized = true;

    // Use adoptedStyleSheets for maximum performance. This is key.
    const userRulesStyleSheet = new CSSStyleSheet();
    const dynamicRulesStyleSheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [
      ...document.adoptedStyleSheets,
      userRulesStyleSheet,
      dynamicRulesStyleSheet,
    ];

    const pickerStyle = document.head.appendChild(
      document.createElement("style"),
    );
    pickerStyle.id = "global-black-picker-style";

    const HOST = location.hostname;

    /* ----------  3.  Scalpel constants / helpers  ---------- */
    const LIGHT_BG = 400;
    const DARK_GREY_BG = 500;
    const DARK_TEXT = 128;
    const IGNORED = new Set([
      "IMG",
      "PICTURE",
      "VIDEO",
      "CANVAS",
      "SVG",
      "SCRIPT",
      "STYLE",
      "LINK",
    ]);
/* ---------- 3b.  Userscript-compatible tag list (whitelist) ---------- */
const USERSCRIPT_TAGS = new Set([
  'html','body','header','footer','nav','main','aside','section','article',
  'ul','ol','li','dl','table','thead','tbody','tfoot','tr','th','td',
  'form','fieldset','button','label','overlay','iframe','#text','#content',
  'mt-sm','.theme-auto','.container-wrapper','.style-scope'
]);
    const tmp = document.createElement("div");
    tmp.style.display = "none";
    document.body.appendChild(tmp);
    const cache = new Map();
    const lightness = (c) => {
      if (
        !c ||
        c === "none" ||
        c.includes("inherit") ||
        c.includes("initial") ||
        c.includes("unset")
      )
        return -1;
      if (cache.has(c)) return cache.get(c);
      tmp.style.color = c;
      const rgb = getComputedStyle(tmp).color;
      if (rgb === "rgba(0, 0, 0, 0)" || !rgb) {
        cache.set(c, -1);
        return -1;
      }
      const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      const v = m ? (parseInt(m[1]) + parseInt(m[2]) + parseInt(m[3])) / 3 : -1;
      cache.set(c, v);
      return v;
    };

    /* ----------  4.  Selector helper  ---------- */
    const getSelector = (el) => {
      if (!(el instanceof Element)) return "";
      const path = [];
      while (
        el &&
        el.nodeType === Node.ELEMENT_NODE &&
        el.tagName.toLowerCase() !== "html"
      ) {
        let selector = el.nodeName.toLowerCase();
        if (el.id) {
          // *** THE TYPO FIX IS HERE: It's el.id, not id ***
          selector = "#" + CSS.escape(el.id);
          path.unshift(selector);
          break;
        } else {
          const cls = Array.from(el.classList)
            .map((c) => "." + CSS.escape(c))
            .join("");
          if (cls) selector += cls;
          let sib = el,
            nth = 1;
          while ((sib = sib.previousElementSibling))
            if (sib.nodeName.toLowerCase() === el.nodeName.toLowerCase()) nth++;
          if (nth > 1) selector += `:nth-of-type(${nth})`;
        }
        path.unshift(selector);
        el = el.parentNode;
      }
      return path.join(" > ");
    };

    /* ----------  5.  User-rule application  ---------- */
    async function fetchUserRules() {
      try {
        const rsp = await chrome.runtime.sendMessage({
          action: "getRulesForHost",
          hostname: HOST,
        });
        if (!rsp) return { excluded: new Set() };

        while (userRulesStyleSheet.cssRules.length > 0) {
          userRulesStyleSheet.deleteRule(0);
        }

        const excluded = new Set();
        for (const r of rsp) {
          try {
            if (r.action === "exclude") {
              document.querySelectorAll(r.selector).forEach((e) => {
                excluded.add(e);
                e.querySelectorAll("*").forEach((c) => excluded.add(c));
              });
            } else if (r.action === "force-black") {
              userRulesStyleSheet.insertRule(
                `${r.selector}{background:#000!important;color:#fff!important}`,
                userRulesStyleSheet.cssRules.length,
              );
            } else if (r.action === "invert") {
              userRulesStyleSheet.insertRule(
                `${r.selector}{filter:invert(1) hue-rotate(180deg)!important;background-color:#fff!important}`,
                userRulesStyleSheet.cssRules.length,
              );
            } else if (r.action === "custom") {
              userRulesStyleSheet.insertRule(
                `:root ${r.selector}{${r.css}}`,
                userRulesStyleSheet.cssRules.length,
              );
            }
          } catch (_) {}
        }
        return { excluded };
      } catch (e) {
        return { excluded: new Set() };
      }
    }

    /* ----------  6.  dynamic styling  ---------- */
    const ruleIndexMap = new WeakMap();
function processElement(el, excluded) {
  /* 1.  same hard skips as userscript -------------------------------- */
  if (
    ruleIndexMap.has(el) ||
    excluded.has(el) ||
    !el.tagName ||
    IGNORED.has(el.tagName.toUpperCase())
  ) return;

  const st = getComputedStyle(el);

  /* 7.  gate ---------------------------------------------- */
  const bg = lightness(st.backgroundColor);
  if (bg === -1) return;                                  // transparent
  const isLight   = bg > LIGHT_BG;                        // ~> 400
  const isDarkGrey= bg > 0   && bg < DARK_GREY_BG;        // ~> 0…500
  if (!(isLight || isDarkGrey)) return;                   // mid-tone

  /* 3.  apply styles exactly like userscript ------------------------- */
  if (st.backgroundImage === 'none')
    el.style.setProperty('background', '#000', 'important');
  else
    el.style.setProperty('background-color', '#000', 'important');

  const txt = lightness(st.color);
  if (txt !== -1 && txt < DARK_TEXT)                      // ~> 128
    el.style.setProperty('color', '#fff', 'important');

  ['border-color','border-top-color','border-right-color',
   'border-bottom-color','border-left-color'].forEach(prop => {
     const b = lightness(st[prop]);
     if (b > DARK_GREY_BG)                                // ~> 500
       el.style.setProperty(prop, '#000', 'important');
  });

  ruleIndexMap.set(el, true);
}
    /* ----------  8.  Mutation observer (lightweight)  ---------- */
    // The MutationObserver is responsible for detecting dynamically added nodes.
    // It now also re-fetches rules to ensure they are applied to new elements.
    const observer = new MutationObserver(async (mutations) => {
      const { excluded } = await fetchUserRules();
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && !excluded.has(node)) {
              processElement(node, excluded);
              node
                .querySelectorAll("*")
                .forEach((c) => processElement(c, excluded));
            }
          }
        } else if (mutation.type === "attributes") {
          if (!excluded.has(mutation.target)) {
            processElement(mutation.target, excluded);
          }
        }
      }
    });

    function startObserver() {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      });
    }

    /* ----------  9.  Full run (user rules + dynamic)  ---------- */
    async function fullRun() {
      observer.disconnect();
      const { excluded } = await fetchUserRules();

      // Clear existing dynamic rules before re-applying them.
      while (dynamicRulesStyleSheet.cssRules.length > 0) {
        dynamicRulesStyleSheet.deleteRule(0);
      }

      // Traverse the DOM and apply dynamic styling.
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        null,
        false,
      );
      let el;
      while ((el = walker.nextNode())) processElement(el, excluded);
      startObserver();
    }

    /* ----------  10.  Picker UI   ---------- */
    let isSelectionMode = false,
      pickerPanel = null,
      previewElement = null,
      elementPath = [];
    async function saveRule(selector, action, customCss, scope) {
      if (!selector) {
        alert("Selector cannot be empty.");
        return;
      }
      const response = await chrome.runtime.sendMessage({
        action: "saveRule",
        payload: {
          selector,
          action,
          css: customCss,
          scope: scope === "global" ? "global" : HOST,
        },
      });
      if (response && response.success) {
        await fullRun();
      }
    }
    function clearPreview() {
      if (previewElement) {
        previewElement.style.outline = "";
        delete previewElement.dataset.gbPreview;
      }
      previewElement = null;
    }
    function applyPreview(element, previewType) {
      clearPreview();
      if (element) {
        previewElement = element;
        previewElement.style.outline = "2px solid #FF00FF";
        if (previewType) {
          previewElement.dataset.gbPreview = previewType;
        }
      }
    }
    function createPickerPanel() {
      if (document.getElementById("global-black-picker-panel")) return;
      pickerStyle.textContent = ` #global-black-picker-panel { position: fixed; z-index: 2147483647; background: #2a2a2e; color: #eee; border: 1px solid #555; border-radius: 5px; padding: 10px; font-family: sans-serif; font-size: 14px; width: 350px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); display: none; } .gb-panel-selector { width: calc(100% - 8px); background: #111; color: #ddd; border: 1px solid #444; border-radius: 3px; resize: vertical; min-height: 40px; font-family: monospace; font-size: 13px; margin-bottom: 8px; padding: 2px; } .gb-panel-scope { text-align: center; margin-bottom: 8px; } .gb-panel-scope label { margin: 0 10px; } .gb-panel-actions button { width: 48%; margin: 1%; padding: 8px; border: 1px solid #777; background: #444; color: #fff; cursor: pointer; border-radius: 3px; } .gb-panel-actions button:hover { background: #555; } .gb-slider-container { display: none; padding: 5px 0; } .gb-slider-container label { font-size: 12px; color: #aaa; display: flex; justify-content: space-between; margin-bottom: 4px; } #gb-level-slider { width: 100%; margin: 0; } [data-gb-preview="force-black"] { background: #000 !important; color: #FFF !important; } [data-gb-preview="exclude"] { opacity: 0.5 !important; } [data-gb-preview="invert"] { filter: invert(1) hue-rotate(180deg) !important; background-color: #fff !important; }`;
      pickerPanel = document.createElement("div");
      pickerPanel.id = "global-black-picker-panel";
      pickerPanel.innerHTML = `<div class="gb-slider-container"><label><span>Move to select a broader element</span><span id="gb-slider-value">1</span></label><input type="range" id="gb-level-slider" min="0" value="0"></div><textarea class="gb-panel-selector"></textarea><div class="gb-panel-scope"><label><input type="radio" name="scope" value="site" checked> Site Only</label><label><input type="radio" name="scope" value="global"> Global</label></div><div class="gb-panel-actions"><button data-action="force-black">Force Black</button><button data-action="exclude">Exclude</button><button data-action="invert">Invert</button><button data-action="custom">Custom CSS</button></div>`;
      document.body.appendChild(pickerPanel);
      const selectorTextarea = pickerPanel.querySelector(".gb-panel-selector");
      const slider = pickerPanel.querySelector("#gb-level-slider");
      const sliderValueLabel = pickerPanel.querySelector("#gb-slider-value");
      let currentPreviewAction = "";
      selectorTextarea.addEventListener("input", () => {
        const newSelector = selectorTextarea.value.trim();
        try {
          const newTarget = newSelector
            ? document.querySelector(newSelector)
            : null;
          applyPreview(newTarget, currentPreviewAction);
        } catch (e) {
          clearPreview();
        }
      });
      slider.addEventListener("input", () => {
        const level = parseInt(slider.value, 10);
        sliderValueLabel.textContent = level + 1;
        if (elementPath[level]) {
          const targetElement = elementPath[level];
          applyPreview(targetElement, currentPreviewAction);
          selectorTextarea.value = getSelector(targetElement);
        }
      });
      pickerPanel.addEventListener("click", async (e) => {
        if (e.target.tagName === "BUTTON") {
          const selector = selectorTextarea.value.trim();
          const action = e.target.dataset.action;
          const scope = pickerPanel.querySelector(
            'input[name="scope"]:checked',
          ).value;
          let customCss = "";
          if (action === "custom") {
            customCss = prompt(`Enter custom CSS for:\n${selector}`);
            if (customCss === null) return;
          }
          exitSelectionMode();
          await saveRule(selector, action, customCss, scope);
        }
      });
      pickerPanel.addEventListener("mouseover", (e) => {
        if (e.target.tagName === "BUTTON") {
          currentPreviewAction = e.target.dataset.action;
          if (previewElement) {
            previewElement.dataset.gbPreview = currentPreviewAction;
          }
        }
      });
      pickerPanel.addEventListener("mouseout", (e) => {
        if (e.target.tagName === "BUTTON") {
          currentPreviewAction = "";
          if (previewElement) {
            delete previewElement.dataset.gbPreview;
          }
        }
      });
    }
    function enterSelectionMode() {
      isSelectionMode = true;
      createPickerPanel();
      pickerPanel.style.display = "block";
      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("click", onElementClick, true);
      document.addEventListener("keydown", onEscapeKey, true);
    }
    function exitSelectionMode() {
      isSelectionMode = false;
      clearPreview();
      elementPath = [];
      if (pickerPanel) {
        pickerPanel.style.display = "none";
        pickerPanel.querySelector(".gb-slider-container").style.display =
          "none";
      }
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onElementClick, true);
      document.removeEventListener("keydown", onEscapeKey, true);
    }
    function onMouseMove(e) {
      const target = e.target;
      if (pickerPanel && pickerPanel.contains(target)) {
        clearPreview();
        return;
      }
      applyPreview(target, "");
      if (pickerPanel) {
        pickerPanel.querySelector(".gb-panel-selector").value =
          getSelector(target);
        const panelHeight = pickerPanel.offsetHeight;
        const panelWidth = pickerPanel.offsetWidth;
        const cursorPadding = 15;
        let x = e.clientX + cursorPadding;
        if (x + panelWidth > window.innerWidth) {
          x = e.clientX - panelWidth - cursorPadding;
        }
        let y = e.clientY + cursorPadding;
        if (y + panelHeight > window.innerHeight) {
          y = e.clientY - panelHeight - cursorPadding;
        }
        pickerPanel.style.left = `${Math.max(5, x)}px`;
        pickerPanel.style.top = `${Math.max(5, y)}px`;
      }
    }
    function onElementClick(e) {
      const target = e.target;
      if (pickerPanel && pickerPanel.contains(target)) return;
      e.preventDefault();
      e.stopPropagation();
      document.removeEventListener("mousemove", onMouseMove, true);
      elementPath = [];
      let el = target;
      while (el && el.tagName !== "BODY") {
        elementPath.push(el);
        el = el.parentNode;
      }
      elementPath.push(document.body);
      if (pickerPanel) {
        const slider = pickerPanel.querySelector("#gb-level-slider");
        const sliderContainer = pickerPanel.querySelector(
          ".gb-slider-container",
        );
        const sliderValueLabel = pickerPanel.querySelector("#gb-slider-value");
        slider.max = elementPath.length - 1;
        slider.value = 0;
        sliderValueLabel.textContent = 1;
        sliderContainer.style.display = "block";
      }
    }
    function onEscapeKey(e) {
      if (e.key === "Escape") exitSelectionMode();
    }

    /* ---------- 11.  Boot  ---------- */
    chrome.runtime.onMessage.addListener((req) => {
      if (req.action === "start-selection") enterSelectionMode();
      // When rules are updated, we need to re-run the full process
      // to ensure all elements, including dynamically loaded ones, are styled correctly.
      if (req.action === "rulesUpdated") fullRun();
    });
    // Initial run of styling.
    fullRun();
    fullRun();
    window.addEventListener("beforeunload", () => observer.disconnect());
  }

  /* ---------- 12.  Kick-off  ---------- */
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initGlobalBlack);
  else initGlobalBlack();
})();
