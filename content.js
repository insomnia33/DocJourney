// content.js

/**
 * Parses a navigation item (section, chapter, lesson) from a list item element.
 * @param {HTMLElement} listItemElement - The <li> element to parse.
 * @param {number} level - The current nesting level (1 for toctree-l1, etc.).
 * @param {string} baseUrl - The base URL of the current page.
 * @returns {object|null} Parsed item object or null if invalid.
 */
function parseNavItem(listItemElement, level, baseUrl) {
    // Query for the direct anchor child, not nested ones
    const anchor = listItemElement.querySelector(`:scope > a.reference.internal`);
    if (!anchor) {
        // Sometimes the anchor is inside a <p> tag within the li
        const pAnchor = listItemElement.querySelector(`:scope > p > a.reference.internal`);
        if (!pAnchor) return null;
        return parseNavItemWithAnchor(pAnchor, listItemElement, level, baseUrl);
    }
    return parseNavItemWithAnchor(anchor, listItemElement, level, baseUrl);
}

/**
 * Helper function to continue parsing once an anchor is found.
 * @param {HTMLAnchorElement} anchor - The <a> element.
 * @param {HTMLElement} listItemElement - The <li> element.
 * @param {number} level - The current nesting level.
 * @param {string} baseUrl - The base URL.
 * @returns {object|null} Parsed item object.
 */
function parseNavItemWithAnchor(anchor, listItemElement, level, baseUrl) {
    const title = anchor.innerText.trim();
    let href = anchor.getAttribute('href');

    // Ensure href is absolute
    if (href && !href.startsWith('http') && !href.startsWith('#')) {
        // Create a URL object to resolve relative paths correctly
        try {
            const url = new URL(href, baseUrl);
            href = url.pathname + url.search + url.hash; // Get path relative to domain root
        } catch (e) {
            console.error("Error creating URL:", e, href, baseUrl);
            href = `#error-creating-url-${Date.now()}`; // Fallback
        }
    } else if (href && href.startsWith('#') && baseUrl.includes('#')) {
        // If it's a hash link and base URL also has a hash, replace base hash
        href = baseUrl.substring(0, baseUrl.indexOf('#')) + href;
         try {
            const url = new URL(href, window.location.origin); // Use window.location.origin as base for hash links
            href = url.pathname + url.search + url.hash;
        } catch (e) {
            console.error("Error creating URL for hash link:", e, href, window.location.origin);
            href = `#error-creating-url-hash-${Date.now()}`;
        }
    }


    // Use a simplified ID for now, just the href. Consider a more robust hashing/slugify function if needed.
    // Ensure ID is unique and suitable for use as a key/DOM ID.
    const id = 'item-' + href.replace(/[^a-zA-Z0-9-_]/g, '_');

    const item = {
        id: id,
        title: title,
        href: href, // Store the potentially modified href
        originalHref: anchor.getAttribute('href'), // Keep original for debugging
        level: level,
        children: [],
        completed: false, // This will be populated by popup.js from storage
        notes: ""         // This will be populated by popup.js from storage
    };

    // Recursively parse children
    // Children are in a 'ul' that is a direct child of the 'li'
    const nestedUl = listItemElement.querySelector(`:scope > ul`);
    if (nestedUl) {
        // Children are 'li' elements that are direct children of this 'ul'
        const childLiElements = nestedUl.querySelectorAll(`:scope > li.toctree-l${level + 1}, :scope > li.toctree-l${level + 2}, :scope > li.toctree-l${level + 3}`); // Be more flexible with child levels
        childLiElements.forEach(childEl => {
            // Determine the child's level based on its class name
            let childLevel = level + 1;
            if (childEl.classList.contains(`toctree-l${level + 1}`)) {
                childLevel = level + 1;
            } else if (childEl.classList.contains(`toctree-l${level + 2}`)) {
                childLevel = level + 2;
            } else if (childEl.classList.contains(`toctree-l${level + 3}`)) {
                childLevel = level + 3;
            }
            // Add more conditions if deeper nesting is common and consistent

            const childItem = parseNavItem(childEl, childLevel, baseUrl);
            if (childItem) item.children.push(childItem);
        });
    }

    return item;
}


/**
 * Parses the entire documentation structure from the sidebar.
 * @returns {Array} Array of top-level section objects.
 */
function parseDocumentationStructure() {
    const sidebar = document.querySelector('aside.sidebar-drawer div.sidebar-sticky div.sidebar-scroll div.sidebar-tree');
    if (!sidebar) {
        console.log("Sidebar not found.");
        return [];
    }

    const documentation = [];
    const captions = sidebar.querySelectorAll('p.caption');
    let sectionsCaptionFound = false;
    let currentBaseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    if (window.location.href.endsWith('/')) { // if current page is an index.html
        currentBaseUrl = window.location.href;
    }


    captions.forEach(caption => {
        const captionText = caption.querySelector('span.caption-text');
        if (captionText && captionText.innerText.trim() === "Sections") {
            sectionsCaptionFound = true;
            let nextElement = caption.nextElementSibling;
            // Find the UL that directly follows the "Sections" caption
            while (nextElement && nextElement.tagName !== 'UL') {
                nextElement = nextElement.nextElementSibling;
            }
            if (nextElement && nextElement.tagName === 'UL') {
                const sectionListItems = nextElement.querySelectorAll(':scope > li.toctree-l1');
                sectionListItems.forEach(li => {
                    const sectionItem = parseNavItem(li, 1, currentBaseUrl);
                    if (sectionItem) {
                        documentation.push(sectionItem);
                    }
                });
            }
        } else if (captionText && captionText.innerText.trim() === "Getting Started") { // Also parse "Getting Started"
             let nextElement = caption.nextElementSibling;
            while (nextElement && nextElement.tagName !== 'UL') {
                nextElement = nextElement.nextElementSibling;
            }
            if (nextElement && nextElement.tagName === 'UL') {
                const sectionListItems = nextElement.querySelectorAll(':scope > li.toctree-l1');
                sectionListItems.forEach(li => {
                    const sectionItem = parseNavItem(li, 1, currentBaseUrl);
                    if (sectionItem) {
                        documentation.push(sectionItem);
                    }
                });
            }
        }
    });

    if (!sectionsCaptionFound && documentation.length === 0) {
        // Fallback if "Sections" caption is not found, try to parse all toctree-l1 from the sidebar
        console.log("Attempting fallback parsing for all top-level lists in sidebar.");
        const topLevelUls = sidebar.querySelectorAll(':scope > ul');
        topLevelUls.forEach(ul => {
            const sectionListItems = ul.querySelectorAll(':scope > li.toctree-l1');
            sectionListItems.forEach(li => {
                const sectionItem = parseNavItem(li, 1, currentBaseUrl);
                if (sectionItem) {
                    documentation.push(sectionItem);
                }
            });
        });
    }
     console.log("Parsed Structure:", documentation);
    return documentation;
}

// Listen for a message from the popup asking for the structure
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "getDocStructure") {
        console.log("content.js received getDocStructure request");
        const structure = parseDocumentationStructure();
        sendResponse({ type: "docStructure", payload: structure });
    }
    return true; // Indicates that the response is sent asynchronously
});

// Initial parse and log when the content script loads, for debugging.
// However, the main trigger will be the popup asking for it.
console.log("Doc Tracker content script loaded.");
// const initialStructure = parseDocumentationStructure();
// console.log("Initial parsed structure on load:", initialStructure);

// === OVERLAY CHECKBOX SYSTEM ===
(function() {
    // Avoid injecting multiple times
    if (window.__docTrackerOverlayInjected) return;
    window.__docTrackerOverlayInjected = true;

    // Helper: get sidebar tree
    function getSidebarTree() {
        return document.querySelector('aside.sidebar-drawer div.sidebar-sticky div.sidebar-scroll div.sidebar-tree');
    }

    // Helper: get all nav items (li.toctree-l*)
    function getAllNavItems() {
        const sidebar = getSidebarTree();
        if (!sidebar) return [];
        return Array.from(sidebar.querySelectorAll('li[class*="toctree-l"]'));
    }

    // Helper: get unique ID for a nav item (same logic as parseNavItem)
    function getNavItemId(li) {
        const anchor = li.querySelector(':scope > a.reference.internal, :scope > p > a.reference.internal');
        if (!anchor) return null;
        let href = anchor.getAttribute('href');
        if (!href) return null;
        // Normalize as in parseNavItem
        if (href && !href.startsWith('http') && !href.startsWith('#')) {
            try {
                const url = new URL(href, window.location.href);
                href = url.pathname + url.search + url.hash;
            } catch (e) {
                href = `#error-creating-url-${Date.now()}`;
            }
        }
        return 'item-' + href.replace(/[^a-zA-Z0-9-_]/g, '_');
    }

    // Create overlay button
    const overlayBtn = document.createElement('button');
    overlayBtn.textContent = '📋 Track';
    overlayBtn.title = 'Exibir/ocultar checkboxes de tracking';
    overlayBtn.style.position = 'fixed';
    overlayBtn.style.top = '20px';
    overlayBtn.style.right = '20px';
    overlayBtn.style.zIndex = '99999';
    overlayBtn.style.background = '#007bff';
    overlayBtn.style.color = 'white';
    overlayBtn.style.border = 'none';
    overlayBtn.style.borderRadius = '5px';
    overlayBtn.style.padding = '10px 16px';
    overlayBtn.style.fontSize = '1.1em';
    overlayBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    overlayBtn.style.cursor = 'pointer';
    overlayBtn.style.opacity = '0.85';
    overlayBtn.style.transition = 'opacity 0.2s';
    overlayBtn.onmouseenter = () => overlayBtn.style.opacity = '1';
    overlayBtn.onmouseleave = () => overlayBtn.style.opacity = '0.85';
    document.body.appendChild(overlayBtn);

    let overlayActive = false;
    let checkboxMap = new Map();

    // Load states from chrome.storage
    function loadStates(callback) {
        const navItems = getAllNavItems();
        const ids = navItems.map(getNavItemId).filter(Boolean);
        chrome.storage.local.get(ids, (data) => {
            callback(data);
        });
    }

    // Save state for an item and optionally for children
    function saveState(id, completed, cascadeIds = []) {
        const updates = {};
        updates[id] = { completed };
        cascadeIds.forEach(cid => { updates[cid] = { completed }; });
        chrome.storage.local.get([id, ...cascadeIds], (existing) => {
            Object.keys(updates).forEach(k => {
                updates[k] = { ...existing[k], ...updates[k] };
            });
            chrome.storage.local.set(updates, () => {
                // Optionally, send a message to popup to refresh
            });
        });
    }

    // Recursively get all children IDs for a given li
    function getAllChildrenIds(li) {
        let ids = [];
        const nestedUl = li.querySelector(':scope > ul');
        if (nestedUl) {
            nestedUl.querySelectorAll(':scope > li[class*="toctree-l"]').forEach(childLi => {
                const cid = getNavItemId(childLi);
                if (cid) {
                    ids.push(cid);
                    ids = ids.concat(getAllChildrenIds(childLi));
                }
            });
        }
        return ids;
    }

    // Toggle overlay
    function toggleOverlay() {
        overlayActive = !overlayActive;
        if (overlayActive) {
            // Show checkboxes
            loadStates((data) => {
                getAllNavItems().forEach(li => {
                    const id = getNavItemId(li);
                    if (!id) return;
                    // Avoid duplicate
                    if (li.querySelector('.doc-tracker-checkbox')) return;
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.className = 'doc-tracker-checkbox';
                    cb.style.marginRight = '6px';
                    cb.style.transform = 'scale(1.2)';
                    cb.checked = data[id]?.completed || false;
                    // On change, update storage and cascade to children
                    cb.addEventListener('change', (e) => {
                        const checked = cb.checked;
                        // Cascade to children
                        const childrenIds = getAllChildrenIds(li);
                        // Update all checkboxes in overlay
                        [id, ...childrenIds].forEach(cid => {
                            const otherCb = document.querySelector(`li[data-doctrackerid="${cid}"] .doc-tracker-checkbox`);
                            if (otherCb) otherCb.checked = checked;
                        });
                        saveState(id, checked, childrenIds);
                    });
                    // Insert before anchor
                    const anchor = li.querySelector(':scope > a.reference.internal, :scope > p > a.reference.internal');
                    if (anchor) {
                        anchor.parentNode.insertBefore(cb, anchor);
                        li.setAttribute('data-doctrackerid', id);
                    }
                });
            });
        } else {
            // Remove checkboxes
            document.querySelectorAll('.doc-tracker-checkbox').forEach(cb => cb.remove());
            document.querySelectorAll('li[data-doctrackerid]').forEach(li => li.removeAttribute('data-doctrackerid'));
        }
    }

    overlayBtn.onclick = toggleOverlay;
})();

// === UNIVERSAL TITLE TRACKING SYSTEM ===
(function() {
    if (window.__docTrackerUniversalInjected) return;
    window.__docTrackerUniversalInjected = true;

    // Helper: get a unique key for the current page (by URL, ignoring hash)
    function getPageKey() {
        return window.location.origin + window.location.pathname;
    }

    // Helper: get all candidate headings (h1, h2, h3, h4, h5, h6)
    function getAllHeadings() {
        return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    }

    // Helper: get a unique id for a heading (by page + tag + text + index)
    function getHeadingId(heading) {
        const pageKey = getPageKey();
        const tag = heading.tagName;
        const text = heading.innerText.trim().replace(/\s+/g, ' ').substring(0, 80);
        // Index among siblings with same tag and text
        const siblings = Array.from(document.querySelectorAll(tag));
        let idx = 0;
        for (let i = 0; i < siblings.length; i++) {
            if (siblings[i] === heading) { idx = i; break; }
        }
        return `${pageKey}::${tag}::${text}::${idx}`;
    }

    // --- Mode toggle ---
    let mode = localStorage.getItem('docTrackerMode') || 'auto'; // 'auto' or 'manual'
    const modeBtn = document.createElement('button');
    modeBtn.textContent = mode === 'auto' ? 'Modo: AutoSelect' : 'Modo: Manual';
    modeBtn.title = 'Alternar entre seleção automática (AutoSelect) e manual de títulos';
    modeBtn.style.position = 'fixed';
    modeBtn.style.top = '60px';
    modeBtn.style.right = '20px';
    modeBtn.style.zIndex = '99999';
    modeBtn.style.background = '#ffc107';
    modeBtn.style.color = '#222';
    modeBtn.style.border = 'none';
    modeBtn.style.borderRadius = '5px';
    modeBtn.style.padding = '8px 14px';
    modeBtn.style.fontSize = '1em';
    modeBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    modeBtn.style.cursor = 'pointer';
    modeBtn.style.opacity = '0.85';
    modeBtn.style.transition = 'opacity 0.2s';
    modeBtn.onmouseenter = () => modeBtn.style.opacity = '1';
    modeBtn.onmouseleave = () => modeBtn.style.opacity = '0.85';
    document.body.appendChild(modeBtn);

    // Overlay button to enable selection mode
    const selectBtn = document.createElement('button');
    selectBtn.textContent = 'Selecionar Títulos';
    selectBtn.title = 'Clique para escolher quais títulos do conteúdo deseja trackear';
    selectBtn.style.position = 'fixed';
    selectBtn.style.top = '100px';
    selectBtn.style.right = '20px';
    selectBtn.style.zIndex = '99999';
    selectBtn.style.background = '#28a745';
    selectBtn.style.color = 'white';
    selectBtn.style.border = 'none';
    selectBtn.style.borderRadius = '5px';
    selectBtn.style.padding = '10px 16px';
    selectBtn.style.fontSize = '1.1em';
    selectBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    selectBtn.style.cursor = 'pointer';
    selectBtn.style.opacity = '0.85';
    selectBtn.style.transition = 'opacity 0.2s';
    selectBtn.onmouseenter = () => selectBtn.style.opacity = '1';
    selectBtn.onmouseleave = () => selectBtn.style.opacity = '0.85';
    document.body.appendChild(selectBtn);

    // --- GLOBAL TRACKING STORAGE ---
    // Instead of per-page, store all tracked headings in a single global object
    const GLOBAL_KEY = 'docTrackerGlobal';
    let trackedHeadings = {};

    // Load all tracked headings (global)
    function loadTrackedHeadings(callback) {
        chrome.storage.local.get([GLOBAL_KEY], (data) => {
            trackedHeadings = data[GLOBAL_KEY] || {};
            callback();
        });
    }

    // Save all tracked headings (global)
    function saveTrackedHeadings() {
        chrome.storage.local.set({ [GLOBAL_KEY]: trackedHeadings });
    }

    // --- AutoSelect logic ---
    function autoSelectHeadings() {
        // Track all h1, h2, h3 by default
        const headings = getAllHeadings().filter(h => ['H1','H2','H3'].includes(h.tagName));
        let changed = false;
        headings.forEach(heading => {
            const id = getHeadingId(heading);
            if (!trackedHeadings[id]) {
                trackedHeadings[id] = { completed: false };
                changed = true;
            }
        });
        // Optionally, remove headings that are no longer present on any page
        // (optional: keep for global progress, or clean up if desired)
        if (changed) saveTrackedHeadings();
    }

    // Render checkboxes next to tracked headings (only for current page)
    function renderCheckboxes() {
        document.querySelectorAll('.doc-tracker-title-checkbox').forEach(cb => cb.remove());
        getAllHeadings().forEach(heading => {
            const id = getHeadingId(heading);
            if (trackedHeadings[id]) {
                let cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'doc-tracker-title-checkbox';
                cb.style.marginRight = '8px';
                cb.style.transform = 'scale(1.2)';
                cb.checked = trackedHeadings[id].completed || false;
                cb.title = 'Marcar como concluído';
                cb.addEventListener('change', () => {
                    trackedHeadings[id].completed = cb.checked;
                    saveTrackedHeadings();
                    updateProgressOverlay();
                });
                if (heading.firstChild && heading.firstChild.classList && heading.firstChild.classList.contains('doc-tracker-title-checkbox')) {
                    heading.removeChild(heading.firstChild);
                }
                heading.insertBefore(cb, heading.firstChild);
            } else {
                if (heading.firstChild && heading.firstChild.classList && heading.firstChild.classList.contains('doc-tracker-title-checkbox')) {
                    heading.removeChild(heading.firstChild);
                }
            }
        });
    }

    // Overlay to show global progress
    const progressDiv = document.createElement('div');
    progressDiv.style.position = 'fixed';
    progressDiv.style.top = '140px';
    progressDiv.style.right = '20px';
    progressDiv.style.zIndex = '99999';
    progressDiv.style.background = '#222';
    progressDiv.style.color = '#fff';
    progressDiv.style.padding = '8px 16px';
    progressDiv.style.borderRadius = '5px';
    progressDiv.style.fontSize = '1em';
    progressDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    progressDiv.style.display = 'none';
    document.body.appendChild(progressDiv);

    function updateProgressOverlay() {
        const allIds = Object.keys(trackedHeadings);
        const total = allIds.length;
        const completed = allIds.filter(id => trackedHeadings[id].completed).length;
        if (total > 0) {
            const percent = Math.round((completed / total) * 100);
            progressDiv.textContent = `Progresso global: ${completed}/${total} (${percent}%)`;
            progressDiv.style.display = 'block';
        } else {
            progressDiv.style.display = 'none';
        }
    }

    // --- Selection mode ---
    let selectionMode = false;

    function enableSelectionMode() {
        selectionMode = true;
        selectBtn.textContent = 'Concluir Seleção';
        getAllHeadings().forEach(heading => {
            heading.style.outline = '2px dashed #28a745';
            heading.style.cursor = 'pointer';
            heading.addEventListener('mouseenter', highlightHeading);
            heading.addEventListener('mouseleave', unhighlightHeading);
            heading.addEventListener('click', toggleTrackHeading, true);
        });
    }
    function disableSelectionMode() {
        selectionMode = false;
        selectBtn.textContent = 'Selecionar Títulos';
        getAllHeadings().forEach(heading => {
            heading.style.outline = '';
            heading.style.cursor = '';
            heading.removeEventListener('mouseenter', highlightHeading);
            heading.removeEventListener('mouseleave', unhighlightHeading);
            heading.removeEventListener('click', toggleTrackHeading, true);
        });
        renderCheckboxes();
    }
    function highlightHeading(e) {
        e.target.style.background = '#eaffea';
    }
    function unhighlightHeading(e) {
        e.target.style.background = '';
    }
    function toggleTrackHeading(e) {
        e.preventDefault();
        e.stopPropagation();
        const heading = e.currentTarget;
        const id = getHeadingId(heading);
        if (trackedHeadings[id]) {
            delete trackedHeadings[id];
        } else {
            trackedHeadings[id] = { completed: false };
        }
        saveTrackedHeadings();
        renderCheckboxes();
        updateProgressOverlay();
    }

    // Button click toggles selection mode
    selectBtn.onclick = () => {
        if (!selectionMode) {
            disableAutoSelect();
            enableSelectionMode();
        } else {
            disableSelectionMode();
        }
    };

    // Mode button toggles between auto/manual
    modeBtn.onclick = () => {
        mode = mode === 'auto' ? 'manual' : 'auto';
        localStorage.setItem('docTrackerMode', mode);
        modeBtn.textContent = mode === 'auto' ? 'Modo: AutoSelect' : 'Modo: Manual';
        if (mode === 'auto') {
            disableSelectionMode();
            autoSelectHeadings();
            renderCheckboxes();
            updateProgressOverlay();
        } else {
            disableSelectionMode();
            renderCheckboxes();
            updateProgressOverlay();
        }
    };

    // Helper to disable auto select (for manual mode)
    function disableAutoSelect() {
        // Do nothing for now, but could clear trackedHeadings if desired
    }

    // On load, render checkboxes and progress
    loadTrackedHeadings(() => {
        if (mode === 'auto') {
            autoSelectHeadings();
        }
        renderCheckboxes();
        updateProgressOverlay();
    });

    // Also update on navigation (for SPA docs)
    window.addEventListener('popstate', () => {
        loadTrackedHeadings(() => {
            if (mode === 'auto') {
                autoSelectHeadings();
            }
            renderCheckboxes();
            updateProgressOverlay();
        });
    });
})();

