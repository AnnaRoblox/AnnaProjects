// ==UserScript==
// @name         image color viewer
// @namespace    github.com/annaprojects
// @version      1.5
// @description  Adds context menu options to view an image in a new tab with dynamic background controls, and to change the background directly behind the image on the current page (white, black, transparent, reset). Exactly matches image dimensions.
// @author       AnnaRoblox
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// ==/UserScript==

(function() {
    'use strict';

    // Variable to store the URL of the image that was right-clicked.
    let imageUrl = null;
    // Variable to store the actual DOM image element that was right-clicked.
    let currentImageElement = null;

    // Define a class name for our custom wrapper elements to easily identify them.
    const WRAPPER_CLASS = 'gm-image-bg-wrapper';

    /**
     * Event listener for the 'contextmenu' event.
     */
    document.addEventListener('contextmenu', function(e) {
        if (e.target.tagName === 'IMG') {
            imageUrl = e.target.src;
            currentImageElement = e.target;
        } else {
            imageUrl = null;
            currentImageElement = null;
        }
    }, true);

    /**
     * Event listener for 'click' events to handle keyboard shortcuts.
     */
    document.addEventListener('click', function(e) {
        if (e.target.tagName === 'IMG') {
            const imageElement = e.target;
            let handled = false;

            // Ctrl + Shift + Click: Set background to White
            if (e.ctrlKey && e.shiftKey) {
                setImageBackground(imageElement, 'white');
                handled = true;
            }
            // Alt + Shift + Click: Set background to Black
            else if (e.altKey && e.shiftKey) {
                setImageBackground(imageElement, 'black');
                handled = true;
            }
            // Alt + Click: Toggle background between White and Black
            else if (e.altKey && !e.shiftKey) {
                const parent = imageElement.parentNode;
                let currentBgColor = '';

                if (parent && parent.classList && parent.classList.contains(WRAPPER_CLASS)) {
                    currentBgColor = parent.style.backgroundColor;
                }

                if (currentBgColor === 'black') {
                    setImageBackground(imageElement, 'white');
                } else {
                    setImageBackground(imageElement, 'black');
                }
                handled = true;
            }

            if (handled) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }
    }, true);

    /**
     * Registers context menu commands.
     */
    GM_registerMenuCommand("View Image in New Tab", function() {
        if (imageUrl) {
            openImageViewer(imageUrl, 'white');
        }
    });

    GM_registerMenuCommand("Set Image BG (White)", function() {
        if (currentImageElement) {
            setImageBackground(currentImageElement, 'white');
        }
    });

    GM_registerMenuCommand("Set Image BG (Black)", function() {
        if (currentImageElement) {
            setImageBackground(currentImageElement, 'black');
        }
    });

    GM_registerMenuCommand("Set Image BG (Transparent)", function() {
        if (currentImageElement) {
            setImageBackground(currentImageElement, 'transparent');
        }
    });

    GM_registerMenuCommand("Reset Image BG", function() {
        if (currentImageElement) {
            resetImageBackground(currentImageElement);
        }
    });

    /**
     * Applies a background color or pattern behind the given image element.
     * Modified to match the image dimensions exactly without resizing or padding.
     */
    function setImageBackground(imageElement, bgColor) {
        const parent = imageElement.parentNode;
        let wrapper = null;

        // Check if the image is already inside one of our wrappers
        if (parent && parent.classList && parent.classList.contains(WRAPPER_CLASS)) {
            wrapper = parent;
        } else {
            // Create a new wrapper div
            wrapper = document.createElement('div');
            wrapper.classList.add(WRAPPER_CLASS);

            // Set display to inline-block so it wraps the image tightly
            wrapper.style.display = 'inline-block';
            wrapper.style.padding = '0'; // Remove padding so it matches image size exactly
            wrapper.style.margin = '0';
            wrapper.style.lineHeight = '0'; // Removes the small gap often found below images
            wrapper.style.verticalAlign = 'middle';
            wrapper.style.transition = 'background-color 0.3s ease, background-image 0.3s ease';

            // Insert the wrapper before the image, then append the image to the wrapper
            parent.insertBefore(wrapper, imageElement);
            wrapper.appendChild(imageElement);
        }

        // Apply the chosen background style to the wrapper
        if (bgColor === 'transparent') {
            wrapper.style.backgroundImage = 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)';
            wrapper.style.backgroundSize = '20px 20px';
            wrapper.style.backgroundPosition = '0 0, 0 10px, 10px -10px, -10px 0px';
            wrapper.style.backgroundColor = '';
        } else {
            wrapper.style.backgroundImage = 'none';
            wrapper.style.backgroundColor = bgColor;
        }

        // Ensure image retains its original display properties
        imageElement.style.maxWidth = 'none';
        imageElement.style.maxHeight = 'none';
    }

    /**
     * Resets the background of an image by removing the custom wrapper.
     */
    function resetImageBackground(imageElement) {
        const parent = imageElement.parentNode;

        if (parent && parent.classList && parent.classList.contains(WRAPPER_CLASS)) {
            const grandParent = parent.parentNode;
            if (grandParent) {
                grandParent.insertBefore(imageElement, parent);
                grandParent.removeChild(parent);
                // Reset any styles we applied to the image directly
                imageElement.style.maxWidth = '';
                imageElement.style.maxHeight = '';
            }
        }
    }

    /**
     * Opens a new tab with the image viewer HTML content.
     */
    function openImageViewer(url, initialBgColor) {
        const imageViewerHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Image Viewer</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
                <style>
                    body {
                        background-color: ${initialBgColor};
                        margin: 0;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        transition: background-color 0.3s ease;
                        font-family: 'Inter', sans-serif;
                        color: #333;
                        overflow: auto; /* Changed to auto to allow scrolling if image is huge */
                    }

                    .controls {
                        position: fixed;
                        top: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        background-color: rgba(255, 255, 255, 0.9);
                        padding: 10px 20px;
                        border-radius: 10px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                        display: flex;
                        gap: 10px;
                        z-index: 1000;
                    }

                    .controls button {
                        padding: 8px 15px;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        transition: background-color 0.2s ease, transform 0.1s ease;
                        background-color: #007bff;
                        color: white;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                    }

                    .controls button:hover {
                        background-color: #0056b3;
                        transform: translateY(-1px);
                    }

                    img {
                        /* In the viewer tab, we keep a max-width to ensure it fits the screen,
                           but you can change these to 'none' if you want full size only */
                        max-width: 100%;
                        display: block;
                        margin-top: 80px;
                    }

                    @media (max-width: 600px) {
                        .controls { flex-direction: column; width: 80%; top: 10px; }
                        .controls button { width: 100%; }
                        img { margin-top: 180px; }
                    }
                </style>
            </head>
            <body>
                <div class="controls">
                    <button onclick="changeBg('white')">White</button>
                    <button onclick="changeBg('black')">Black</button>
                    <button onclick="changeBg('transparent')">Transparent</button>
                </div>

                <img src="${url}" alt="Image Viewer">

                <script>
                    function changeBg(color) {
                        const body = document.body;
                        if (color === 'transparent') {
                            body.style.backgroundImage = 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)';
                            body.style.backgroundSize = '20px 20px';
                            body.style.backgroundPosition = '0 0, 0 10px, 10px -10px, -10px 0px';
                            body.style.backgroundColor = '';
                        } else {
                            body.style.backgroundImage = 'none';
                            body.style.backgroundColor = color;
                        }
                    }
                </script>
            </body>
            </html>
        `;

        const blob = new Blob([imageViewerHTML], { type: 'text/html' });
        const blobURL = URL.createObjectURL(blob);
        GM_openInTab(blobURL, { active: true, insert: false });

        setTimeout(() => {
            URL.revokeObjectURL(blobURL);
        }, 1000);
    }

})();
