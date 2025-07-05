// ==UserScript==
// @name         
// @namespace    github.com/annaprojects
// @version      1.3
// @description  Adds context menu options to view an image in a new tab with dynamic background controls, and to change the background directly behind the image on the current page (white, black, transparent, reset).
// @author       annaroblox
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
     * When a user right-clicks, this function checks if the target is an image.
     * If it is, both the image's source URL and the image DOM element are stored.
     * Otherwise, both are reset to null.
     */
    document.addEventListener('contextmenu', function(e) {
        if (e.target.tagName === 'IMG') {
            imageUrl = e.target.src;
            currentImageElement = e.target; // Store the actual image element
        } else {
            imageUrl = null;
            currentImageElement = null; // Clear both if a non-image element is right-clicked
        }
    }, true); // Use capture phase to ensure this runs before other context menu handlers

    /**
     * Registers a context menu command for "View Image in New Tab".
     * When this command is selected, if an image URL is available, it opens the image
     * viewer in a new tab with an initial white background. The new tab will have its
     * own controls to change the background.
     */
    GM_registerMenuCommand("View Image in New Tab", function() {
        if (imageUrl) {
            // Open the image viewer in a new tab, defaulting to a white background.
            // The new tab will contain controls to change its background dynamically.
            openImageViewer(imageUrl, 'white');
        }
    });

    /**
     * Registers a context menu command for "Set Image BG (White)".
     * When selected, this applies a white background directly behind the clicked image
     * on the current page.
     */
    GM_registerMenuCommand("Set Image BG (White)", function() {
        if (currentImageElement) {
            setImageBackground(currentImageElement, 'white');
        }
    });

    /**
     * Registers a context menu command for "Set Image BG (Black)".
     * When selected, this applies a black background directly behind the clicked image
     * on the current page.
     */
    GM_registerMenuCommand("Set Image BG (Black)", function() {
        if (currentImageElement) {
            setImageBackground(currentImageElement, 'black');
        }
    });

    /**
     * Registers a context menu command for "Set Image BG (Transparent)".
     * When selected, this applies a checkerboard background directly behind the clicked image
     * on the current page, simulating transparency.
     */
    GM_registerMenuCommand("Set Image BG (Transparent)", function() {
        if (currentImageElement) {
            setImageBackground(currentImageElement, 'transparent');
        }
    });

    /**
     * Registers a context menu command for "Reset Image BG".
     * When selected, this removes any custom background wrapper applied to the clicked image,
     * returning it to its original state on the page.
     */
    GM_registerMenuCommand("Reset Image BG", function() {
        if (currentImageElement) {
            resetImageBackground(currentImageElement);
        }
    });

    /**
     * Applies a background color or pattern behind the given image element on the current page.
     * It either creates a new wrapper div or updates an existing one.
     *
     * @param {HTMLElement} imageElement - The <img> element to apply the background to.
     * @param {string} bgColor - The desired background color ('white', 'black', or 'transparent').
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
            wrapper.classList.add(WRAPPER_CLASS); // Mark it with our custom class
            wrapper.style.display = 'inline-flex'; // Use inline-flex to wrap content and allow centering
            wrapper.style.alignItems = 'center';
            wrapper.style.justifyContent = 'center';
            wrapper.style.padding = '10px'; // Padding to show the background
            wrapper.style.borderRadius = '8px'; // Rounded corners for the background
            wrapper.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)'; // Subtle shadow
            wrapper.style.transition = 'background-color 0.3s ease, background-image 0.3s ease'; // Smooth transitions
            wrapper.style.lineHeight = '0'; // Prevent extra space below image due to line-height

            // Insert the wrapper before the image, then append the image to the wrapper
            parent.insertBefore(wrapper, imageElement);
            wrapper.appendChild(imageElement);
        }

        // Apply the chosen background style to the wrapper
        if (bgColor === 'transparent') {
            wrapper.style.backgroundImage = 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)';
            wrapper.style.backgroundSize = '20px 20px';
            wrapper.style.backgroundPosition = '0 0, 0 10px, 10px -10px, -10px 0px';
            wrapper.style.backgroundColor = ''; // Clear solid color if any
        } else {
            wrapper.style.backgroundImage = 'none';
            wrapper.style.backgroundSize = 'auto';
            wrapper.style.backgroundPosition = 'auto';
            wrapper.style.backgroundColor = bgColor;
        }
    }

    /**
     * Resets the background of an image by removing the custom wrapper.
     *
     * @param {HTMLElement} imageElement - The <img> element whose background wrapper should be removed.
     */
    function resetImageBackground(imageElement) {
        const parent = imageElement.parentNode;

        // Check if the parent is our custom wrapper
        if (parent && parent.classList && parent.classList.contains(WRAPPER_CLASS)) {
            const grandParent = parent.parentNode;
            if (grandParent) {
                // Move the image back to its original parent's position
                grandParent.insertBefore(imageElement, parent);
                // Remove the wrapper div
                grandParent.removeChild(parent);
            }
        }
    }

    /**
     * Opens a new tab with the image viewer HTML content.
     * The HTML includes the image and controls to change the background color dynamically.
     *
     * @param {string} url - The URL of the image to display.
     * @param {string} initialBgColor - The initial background color ('white', 'black', or 'transparent').
     */
    function openImageViewer(url, initialBgColor) {
        // Construct the HTML content for the new image viewer tab.
        // It includes basic styling, the image, and JavaScript functions for changing the background.
        const imageViewerHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Image Viewer</title>
                <!-- Link to Google Fonts for Inter font -->
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
                <style>
                    /* Basic body styling for centering content and smooth background transitions */
                    body {
                        background-color: ${initialBgColor}; /* Set the initial background color */
                        margin: 0;
                        display: flex;
                        flex-direction: column; /* Stack controls and image vertically */
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh; /* Full viewport height */
                        transition: background-color 0.3s ease; /* Smooth transition for background changes */
                        font-family: 'Inter', sans-serif; /* Apply Inter font */
                        color: #333; /* Default text color */
                        overflow: hidden; /* Prevent scrollbars if image is slightly larger */
                    }

                    /* Styling for the control buttons container */
                    .controls {
                        position: fixed; /* Keep controls visible even when scrolling (though this page won't scroll much) */
                        top: 20px; /* Position from the top */
                        left: 50%; /* Center horizontally */
                        transform: translateX(-50%); /* Adjust for true centering */
                        background-color: rgba(255, 255, 255, 0.9); /* Semi-transparent white background for controls */
                        padding: 10px 20px;
                        border-radius: 10px; /* Rounded corners for the control panel */
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); /* Subtle shadow for depth */
                        display: flex; /* Use flexbox for button layout */
                        gap: 10px; /* Space between buttons */
                        z-index: 1000; /* Ensure controls are on top of other content */
                    }

                    /* Styling for the individual background change buttons */
                    .controls button {
                        padding: 8px 15px;
                        border: none; /* No default border */
                        border-radius: 5px; /* Rounded corners for buttons */
                        cursor: pointer; /* Indicate interactivity */
                        font-size: 14px;
                        font-weight: 500;
                        transition: background-color 0.2s ease, transform 0.1s ease; /* Smooth hover and click effects */
                        background-color: #007bff; /* Primary blue color for buttons */
                        color: white; /* White text on buttons */
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); /* Small shadow for buttons */
                    }

                    /* Hover effect for buttons */
                    .controls button:hover {
                        background-color: #0056b3; /* Darker blue on hover */
                        transform: translateY(-1px); /* Slight lift effect */
                    }

                    /* Active (clicked) effect for buttons */
                    .controls button:active {
                        transform: translateY(1px); /* Slight press effect */
                    }

                    /* Styling for the image itself */
                    img {
                        max-width: 95%; /* Image takes up to 95% of the viewport width */
                        max-height: 95vh; /* Image takes up to 95% of the viewport height */
                        object-fit: contain; /* Ensures the entire image is visible within its bounds */
                        border-radius: 8px; /* Rounded corners for the image */
                        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25); /* More prominent shadow for the image */
                        margin-top: 80px; /* Push image down to clear controls */
                    }

                    /* Responsive adjustments for smaller screens */
                    @media (max-width: 600px) {
                        .controls {
                            flex-direction: column; /* Stack buttons vertically on small screens */
                            width: 80%; /* Wider control panel */
                            top: 10px;
                        }
                        .controls button {
                            width: 100%; /* Full width buttons */
                        }
                        img {
                            margin-top: 150px; /* Adjust margin for stacked controls */
                        }
                    }
                </style>
            </head>
            <body>
                <!-- Control panel for changing background colors -->
                <div class="controls">
                    <button onclick="changeBg('white')">White Background</button>
                    <button onclick="changeBg('black')">Black Background</button>
                    <button onclick="changeBg('transparent')">Transparent Background</button>
                </div>

                <!-- The image display area -->
                <img src="${url}" alt="Image Viewer">

                <script>
                    /**
                     * JavaScript function to dynamically change the body's background.
                     * This function is called by the buttons in the control panel within the new tab.
                     * @param {string} color - The desired background color ('white', 'black', or 'transparent').
                     */
                    function changeBg(color) {
                        const body = document.body;
                        if (color === 'transparent') {
                            // For a 'transparent' background, apply a checkerboard pattern
                            // This simulates transparency on a webpage that doesn't have a true transparent layer beneath it.
                            body.style.backgroundImage = 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)';
                            body.style.backgroundSize = '20px 20px'; // Size of each checkerboard square
                            body.style.backgroundPosition = '0 0, 0 10px, 10px -10px, -10px 0px'; // Offset for checkerboard pattern
                            body.style.backgroundColor = ''; // Clear any solid background color
                            body.style.color = '#333'; // Default text color for checkerboard
                        } else {
                            // For solid colors, clear the checkerboard and set the solid color
                            body.style.backgroundImage = 'none'; // Remove checkerboard pattern
                            body.style.backgroundSize = 'auto';
                            body.style.backgroundPosition = 'auto';
                            body.style.backgroundColor = color; // Set the solid background color
                            // Adjust text color for readability
                            body.style.color = (color === 'black') ? '#eee' : '#333';
                        }
                    }
                </script>
            </body>
            </html>
        `;

        // Create a Blob from the HTML string. This allows us to create a URL for the HTML content.
        const blob = new Blob([imageViewerHTML], { type: 'text/html' });
        // Create a URL for the Blob. This URL can be opened in a new tab.
        const blobURL = URL.createObjectURL(blob);

        // Open the new tab using Tampermonkey's GM_openInTab function.
        GM_openInTab(blobURL, { active: true, insert: false });

        // Optional: Revoke the Blob URL after a short delay.
        // This frees up memory, as the browser will have already loaded the content from the URL.
        setTimeout(() => {
            URL.revokeObjectURL(blobURL);
        }, 1000);
    }

})();
