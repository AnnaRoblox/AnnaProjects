// ==UserScript==
// @name         Global Black
// @namespace    github.com/annaroblox
// @version      1.5
// @description  A global black dark mode
// @author       annaroblox
// @match        */*
// @grant        none
// @run-at       document-idle
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/553805/Global%20Black.user.js
// @updateURL https://update.greasyfork.org/scripts/553805/Global%20Black.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION ---
    const LIGHT_BACKGROUND_THRESHOLD = 400;
    const DARK_GREY_BG_THRESHOLD = 500;
    const DARK_TEXT_THRESHOLD = 128;

    const TARGET_BACKGROUND_COLOR = '#000000';
    const TARGET_TEXT_COLOR = '#FFFFFF';
    const TARGET_BORDER_COLOR = '#000000'; // change this if you want borders to be distinct

    const IGNORED_TAGS = ['IMG', 'PICTURE', 'VIDEO', 'CANVAS', 'SVG'];

    // *** NEW: Timer Configuration ***
    const ENABLE_PERIODIC_RERUN = true; // Set to false to disable periodic re-runs
    const RERUN_INTERVAL = 100000; // - adjust as needed (recomended to be more then 5 seconds)

    // --- IMMEDIATE STYLE INJECTION (RUNS BEFORE DOM IS READY) ---
    // This is the most important part for an instant effect and preventing a "flash of white".
    const style = document.createElement('style');
    style.id = 'pure-black-mode-global-style';
    style.textContent = `
        /* Force dark scrollbars and form controls for a consistent experience */
        :root {
            color-scheme: dark !important;
        }
        /* Instantly apply to the base elements to prevent flash of white */
        html, span, #text,  body, section, article, header, footer, nav, main, aside,
        ul, ol, li, dl, table, tr, td, th, thead, tbody, tfoot,
        form, fieldset, button {
            background-color: ${TARGET_BACKGROUND_COLOR} !important;
            background: ${TARGET_BACKGROUND_COLOR} !important;
            color: ${TARGET_TEXT_COLOR} !important;
        }
        /* Handle syntax highlighting blocks gracefully */
        pre, code {
           background-color: #000000 !important; /* A very dark grey is often better than pure black for code */
           color: #D4D4D4 !important;
        }
    `;
    // Using document.documentElement ensures this runs as early as possible.
    document.documentElement.appendChild(style);


    // --- SCRIPT LOGIC (RUNS ONCE DOM IS INTERACTIVE) ---

    // A single, temporary div is used for all color computations to avoid DOM thrashing.
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    document.documentElement.appendChild(tempDiv);

    /**
     * Calculates the "lightness" of a CSS color string.
     * @param {string} colorString - The CSS color (e.g., "rgb(255, 255, 255)", "#FFF", "white").
     * @returns {number} A lightness value from 0 (black) to 255 (white), or -1 if invalid/transparent.
     */
    function getColorLightness(colorString) {
        if (!colorString || colorString === 'none' || colorString.includes('inherit') || colorString.includes('initial') || colorString.includes('unset')) {
            return -1;
        }

        // Use the temporary div to resolve the color to a consistent rgb() format.
        tempDiv.style.color = colorString;
        const computedColor = window.getComputedStyle(tempDiv).color;

        if (computedColor === 'rgba(0, 0, 0, 0)' || !computedColor) {
            return -1; // Transparent
        }

        const match = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            const [r, g, b] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
            // Using a weighted average for more accurate perceived lightness could be an option,
            // but a simple average is fast and sufficient here.
            return (r + g + b) / 3;
        }
        return -1;
    }

    /**
     * The core function that processes a single element.
     * @param {HTMLElement} element - The DOM element to process.
     */
    function processElement(element) {
        // Basic checks to quickly exit for invalid or already-processed elements.
        if (!element || element.nodeType !== 1 || IGNORED_TAGS.includes(element.tagName)) {
            return;
        }

        const style = window.getComputedStyle(element);

        // Ignore elements that are not visible.
        if (style.display === 'none' || style.visibility === 'hidden') {
            return;
        }

        const bgLightness = getColorLightness(style.backgroundColor);

        if (bgLightness === -1) return; // Skip transparent backgrounds, they'll inherit the parent's black.

        const isLight = bgLightness > LIGHT_BACKGROUND_THRESHOLD;
        const isDarkGrey = bgLightness > 0 && bgLightness < DARK_GREY_BG_THRESHOLD;

        if (isLight || isDarkGrey) {
            // If the element has no background image, we can safely use the 'background' shorthand property.
            // This is more powerful and overrides combined properties like `background: linear-gradient(...) #FFF;`.
            if (style.backgroundImage === 'none') {
                element.style.setProperty('background', TARGET_BACKGROUND_COLOR, 'important');
            } else {
                // If it has a background image, only change the color to avoid removing the image.
                element.style.setProperty('background-color', TARGET_BACKGROUND_COLOR, 'important');
            }

            // Adjust text color for readability if it's dark.
            const textLightness = getColorLightness(style.color);
            if (textLightness !== -1 && textLightness < DARK_TEXT_THRESHOLD) {
                element.style.setProperty('color', TARGET_TEXT_COLOR, 'important');
            }

            // Adjust border colors.
            // We check both a general border color and specific ones.
            const borderTargets = ['border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];
            for (const prop of borderTargets) {
                 const borderLightness = getColorLightness(style[prop]);
                 if (borderLightness > 0 && borderLightness > DARK_GREY_BG_THRESHOLD) { // Check if it's not already dark
                     element.style.setProperty(prop, TARGET_BORDER_COLOR, 'important');
                 }
            }
        }
    }

    /**
     * Traverses a node and its children (including inside Shadow DOMs) to apply the black mode.
     * @param {Node} rootNode - The starting node (usually document.body or a new element).
     */
    function applyBlackModeToTree(rootNode) {
        if (!rootNode || typeof rootNode.querySelectorAll !== 'function') {
            return;
        }

        // Process the root node itself first (important for single added nodes and shadow roots).
        if (rootNode.nodeType === 1) {
            processElement(rootNode);
        }

        const elements = rootNode.querySelectorAll('*');
        elements.forEach(el => {
            processElement(el);
            // If an element has a shadow root, we need to recursively process its contents too.
            if (el.shadowRoot) {
                applyBlackModeToTree(el.shadowRoot);
            }
        });
    }

    function runFullConversion() {
        console.log("Pure Black Mode: Running full page conversion...");
        applyBlackModeToTree(document.documentElement);
    }

    // --- OBSERVER FOR DYNAMIC CONTENT ---
    // This is the key to handling modern, dynamic websites.
    const observer = new MutationObserver(mutations => {
        // *** THIS IS THE CRITICAL FIX ***
        // Use requestAnimationFrame to batch all mutations that happen in a single frame.
        // This prevents performance issues and ensures the script doesn't miss anything
        // on pages that add many elements at once.
        window.requestAnimationFrame(() => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    // When new nodes are added, process them and all their children.
                    mutation.addedNodes.forEach(node => {
                        applyBlackModeToTree(node);
                    });
                } else if (mutation.type === 'attributes') {
                    // If an element's class or style changes, its color might have changed.
                    // Re-run the process on that single element.
                    if (mutation.target) {
                       processElement(mutation.target);
                    }
                }
            }
        });
    });

    // --- PERIODIC RE-RUN TIMER ---
    let periodicTimer = null;
    if (ENABLE_PERIODIC_RERUN) {
        periodicTimer = setInterval(() => {
            console.log("Pure Black Mode: Periodic re-run triggered...");
            runFullConversion();
        }, RERUN_INTERVAL);
    }

    // --- INITIALIZATION ---
    // The main styles are already injected. Now we wait for the DOM to be ready for deep traversal.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runFullConversion, { once: true });
    } else {
        // If the script is injected after the page is loaded (e.g., via console).
        runFullConversion();
    }

    // Start observing for changes after the initial conversion.
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'] // Only watch for attributes that are likely to affect appearance.
    });

    // Clean up when the user navigates away or closes the tab.
    window.addEventListener('unload', () => {
        if (observer) {
            observer.disconnect();
        }
        if (periodicTimer) {
            clearInterval(periodicTimer);
        }
        if (tempDiv && tempDiv.parentNode) {
            tempDiv.parentNode.removeChild(tempDiv);
        }
        if (style && style.parentNode) {
            style.parentNode.removeChild(style);
        }
        console.log("Pure Black Mode: Cleaned up and disconnected.");
    });

})();
