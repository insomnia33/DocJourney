// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const lessonsListDiv = document.getElementById('lessonsList');
    const notesModal = document.getElementById('notesModal');
    const closeButton = notesModal.querySelector('.close-button');
    const notesModalTitle = document.getElementById('notesModalTitle');
    const notesTextarea = document.getElementById('notesTextarea');
    const saveNoteButton = document.getElementById('saveNoteButton');
    const refreshButton = document.getElementById('refreshButton');
    const progressDisplay = document.getElementById('progressDisplay'); // Get the progress element

    let currentEditingItemId = null;
    let currentDocStructure = null; // To store the fetched structure

    // Function to generate a unique ID from href for storage (already exists)
    function getItemId(href) {
        if (!href || typeof href !== 'string') return `invalid-href-${Date.now()}`;
        // Replace special characters to make it a valid key and DOM ID part
        return 'item-' + href.replace(/[^a-zA-Z0-9-_./]/g, '_').replace(/\//g, '-').replace(/\./g, '_');
    }

    // Function to render the documentation structure
    function renderStructure(items, parentUlElement) {
        items.forEach(item => {
            // Check if the item is marked as removed in storage
            if (item.removed) {
                return; // Skip rendering this item and its children
            }

            const li = document.createElement('li');
            li.classList.add(`level-${item.level}`);
            li.dataset.id = item.id; // Use the ID generated in content.js

            const itemContent = document.createElement('div');
            itemContent.classList.add('item-content');

            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.itemId = item.id; // Store item id
            checkbox.checked = item.completed || false; // Set from loaded data

            const titleSpan = document.createElement('a');
            titleSpan.classList.add('item-title');
            titleSpan.textContent = item.title;
            if (item.href && item.href !== "#" && !item.href.startsWith('#error')) {
                try {
                    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
                    const fullUrl = new URL(item.originalHref, `https://docs.blender.org/manual/en/latest/${item.originalHref.startsWith('index.html') ? '' : item.originalHref.substring(0, item.originalHref.lastIndexOf('/')+1)}`).href;
                    titleSpan.href = fullUrl;
                    titleSpan.target = "_blank"; // Open in new tab
                } catch (e) {
                    titleSpan.style.pointerEvents = "none";
                }
            } else {
                titleSpan.style.pointerEvents = "none";
            }
            if (checkbox.checked) {
                titleSpan.classList.add('completed');
            }

            label.appendChild(checkbox);
            label.appendChild(titleSpan);
            itemContent.appendChild(label);

            // Notes button
            const noteButton = document.createElement('button');
            noteButton.classList.add('note-button');
            noteButton.textContent = 'Notes';
            noteButton.dataset.itemId = item.id;
            noteButton.dataset.itemTitle = item.title;
            itemContent.appendChild(noteButton);

            // Remove button
            const removeButton = document.createElement('button');
            removeButton.classList.add('remove-button');
            removeButton.textContent = '×';
            removeButton.title = 'Remove this item and its children';
            removeButton.dataset.itemId = item.id;
            itemContent.appendChild(removeButton);

            li.appendChild(itemContent);

            // Handle checkbox change (cascade to children)
            checkbox.addEventListener('change', async (event) => {
                const itemId = event.target.dataset.itemId;
                const isCompleted = event.target.checked;
                // Update the item's completed status in the current structure data
                updateItemInStructure(currentDocStructure, itemId, { completed: isCompleted });
                // Cascade to children
                if (item.children && item.children.length > 0) {
                    setChildrenCompleted(item.children, isCompleted);
                }
                if (isCompleted) {
                    titleSpan.classList.add('completed');
                } else {
                    titleSpan.classList.remove('completed');
                }
                await updateStoredItem(itemId, { completed: isCompleted });
                // Cascade to children in storage
                if (item.children && item.children.length > 0) {
                    await updateChildrenStored(item.children, isCompleted);
                }
                updateProgressDisplay();
                // Re-render to update children checkboxes
                lessonsListDiv.innerHTML = '';
                const ul = document.createElement('ul');
                renderStructure(currentDocStructure, ul);
                lessonsListDiv.appendChild(ul);
            });

            // Handle note button click
            noteButton.addEventListener('click', (event) => {
                currentEditingItemId = event.target.dataset.itemId;
                notesModalTitle.textContent = `Notes for ${event.target.dataset.itemTitle}`;
                chrome.storage.local.get([currentEditingItemId], (result) => {
                    const storedItemData = result[currentEditingItemId];
                    notesTextarea.value = storedItemData && storedItemData.notes ? storedItemData.notes : '';
                    notesModal.style.display = 'block';
                });
            });

             // Handle remove button click
             removeButton.addEventListener('click', async (event) => {
                 const itemIdToRemove = event.target.dataset.itemId;
                 if (confirm(`Are you sure you want to remove "${item.title}" and its children from tracking?`)) {
                     // Mark the item and its children as removed in storage
                     await markItemAsRemoved(itemIdToRemove);
                     // Remove the item from the DOM
                     li.remove();
                     // Update the current structure data (optional but good practice)
                     removeItemFromStructure(currentDocStructure, itemIdToRemove);
                     // Update progress display
                     updateProgressDisplay();
                 }
             });


            parentUlElement.appendChild(li);

            if (item.children && item.children.length > 0) {
                const toggle = document.createElement('span');
                toggle.classList.add('toggle-children');
                toggle.textContent = '▶'; // Collapsed by default
                label.insertBefore(toggle, checkbox); // Insert before checkbox

                const nestedUl = document.createElement('ul');
                nestedUl.style.display = 'none'; // Collapsed by default
                renderStructure(item.children, nestedUl); // Recursively render children
                li.appendChild(nestedUl);

                toggle.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent li click event
                    const isExpanded = nestedUl.style.display === 'block';
                    nestedUl.style.display = isExpanded ? 'none' : 'block';
                    toggle.textContent = isExpanded ? '▶' : '▼';
                });
                 // Make the whole item content clickable to toggle except for the actual link, checkbox, and buttons
                itemContent.addEventListener('click', (e) => {
                    if (e.target !== titleSpan && e.target !== checkbox && e.target !== noteButton && !noteButton.contains(e.target) && e.target !== removeButton && !removeButton.contains(e.target)) {
                         const isExpanded = nestedUl.style.display === 'block';
                         nestedUl.style.display = isExpanded ? 'none' : 'block';
                         toggle.textContent = isExpanded ? '▶' : '▼';
                    }
                });
            }
        });
    }

    // Function to update an item in storage (already exists)
    async function updateStoredItem(itemId, dataToUpdate) {
        return new Promise((resolve) => {
            chrome.storage.local.get([itemId], (result) => {
                const existingData = result[itemId] || { completed: false, notes: '', removed: false }; // Include removed status
                const updatedData = { ...existingData, ...dataToUpdate };
                chrome.storage.local.set({ [itemId]: updatedData }, () => {
                    console.log("Item updated in storage:", itemId, updatedData);
                    resolve();
                });
            });
        });
    }

    // Function to mark an item and its children as removed in storage
    async function markItemAsRemoved(itemId) {
        const item = findItemInStructure(currentDocStructure, itemId);
        if (!item) {
            console.error("Item not found in structure:", itemId);
            return;
        }

        const itemsToMarkRemoved = [item];
        collectDescendants(item, itemsToMarkRemoved); // Collect item and all descendants

        const storageUpdates = {};
        const itemIdsToRemoveFromStorage = [];

        itemsToMarkRemoved.forEach(async (itemToMark) => {
             // Option 1: Mark as removed (keeps data but hides)
             storageUpdates[itemToMark.id] = { ...((await getStoredItem(itemToMark.id)) || { completed: false, notes: '', removed: false }), removed: true };

             // Option 2: Completely remove from storage (cleaner, but loses notes/completion if re-added later)
             // itemIdsToRemoveFromStorage.push(itemToMark.id);
        });

        if (Object.keys(storageUpdates).length > 0) {
             return new Promise((resolve) => {
                 chrome.storage.local.set(storageUpdates, () => {
                     console.log("Items marked as removed in storage:", Object.keys(storageUpdates));
                     resolve();
                 });
             });
        }
        // If using Option 2:
        // if (itemIdsToRemoveFromStorage.length > 0) {
        //      return new Promise((resolve) => {
        //          chrome.storage.local.remove(itemIdsToRemoveFromStorage, () => {
        //              console.log("Items removed from storage:", itemIdsToRemoveFromStorage);
        //              resolve();
        //          });
        //      });
        // }
    }

    // Helper to get a single item from storage
    async function getStoredItem(itemId) {
         return new Promise((resolve) => {
             chrome.storage.local.get([itemId], (result) => {
                 resolve(result[itemId]);
             });
         });
    }


    // Helper to find an item in the structure by ID
    function findItemInStructure(items, itemId) {
        for (const item of items) {
            if (item.id === itemId) {
                return item;
            }
            if (item.children && item.children.length > 0) {
                const found = findItemInStructure(item.children, itemId);
                if (found) return found;
            }
        }
        return null;
    }

     // Helper to update an item's properties in the structure data
     function updateItemInStructure(items, itemId, dataToUpdate) {
         for (const item of items) {
             if (item.id === itemId) {
                 Object.assign(item, dataToUpdate);
                 return true;
             }
             if (item.children && item.children.length > 0) {
                 if (updateItemInStructure(item.children, itemId, dataToUpdate)) {
                     return true;
                 }
             }
         }
         return false;
     }

    // Helper to remove an item from the structure data
    function removeItemFromStructure(items, itemId) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].id === itemId) {
                items.splice(i, 1); // Remove the item
                return true;
            }
            if (items[i].children && items[i].children.length > 0) {
                if (removeItemFromStructure(items[i].children, itemId)) {
                    return true;
                }
            }
        }
        return false;
    }


    // Helper to collect an item and all its descendants
    function collectDescendants(item, collection) {
        if (item.children) {
            item.children.forEach(child => {
                collection.push(child);
                collectDescendants(child, collection);
            });
        }
    }


    // Load and display the documentation structure
    async function loadStructure() {
        lessonsListDiv.innerHTML = '<p>Fetching structure from page...</p>';
        progressDisplay.textContent = 'Loading...'; // Reset progress display
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { type: "getDocStructure" }, async (response) => {
                    if (chrome.runtime.lastError) {
                        lessonsListDiv.innerHTML = `<p>Error: ${chrome.runtime.lastError.message}. Try refreshing the documentation page and then this popup.</p>`;
                        progressDisplay.textContent = 'Error';
                        console.error(chrome.runtime.lastError);
                        return;
                    }
                    if (response && response.type === "docStructure" && response.payload) {
                        currentDocStructure = response.payload; // Store for later use (e.g. refresh notes)
                        if (currentDocStructure.length === 0) {
                            lessonsListDiv.innerHTML = '<p>No documentation structure found on this page. Ensure you are on a Blender Manual page with a sidebar.</p>';
                            progressDisplay.textContent = 'N/A';
                            return;
                        }
                        lessonsListDiv.innerHTML = ''; // Clear loading message
                        const ul = document.createElement('ul');

                        // Fetch all stored data to populate completion, notes, and removed status
                        const itemIds = getAllItemIds(currentDocStructure);
                        chrome.storage.local.get(itemIds, (storedData) => {
                            applyStoredDataToStructure(currentDocStructure, storedData);
                            renderStructure(currentDocStructure, ul); // Render based on updated structure
                            lessonsListDiv.appendChild(ul);
                            updateProgressDisplay(); // Update progress after rendering
                        });

                    } else {
                        lessonsListDiv.innerHTML = '<p>Could not retrieve structure. Ensure you are on a Blender Manual page and the content script is active.</p>';
                         progressDisplay.textContent = 'N/A';
                    }
                });
            } else {
                lessonsListDiv.innerHTML = '<p>Could not get active tab ID.</p>';
                 progressDisplay.textContent = 'N/A';
            }
        });
    }

    // Helper to get all item IDs from the structure (already exists)
    function getAllItemIds(items) {
        let ids = [];
        items.forEach(item => {
            ids.push(item.id);
            if (item.children && item.children.length > 0) {
                ids = ids.concat(getAllItemIds(item.children));
            }
        });
        return ids;
    }

    // Helper to apply stored data (completion, notes, removed) to the structure
    function applyStoredDataToStructure(items, storedData) {
        items.forEach(item => {
            if (storedData[item.id]) {
                item.completed = storedData[item.id].completed || false;
                item.notes = storedData[item.id].notes || "";
                item.removed = storedData[item.id].removed || false; // Apply removed status
            } else {
                 // Ensure default values if no stored data exists
                 item.completed = false;
                 item.notes = "";
                 item.removed = false;
            }
            if (item.children && item.children.length > 0) {
                applyStoredDataToStructure(item.children, storedData);
            }
        });
    }

    // Function to count total trackable items (excluding removed)
    function countTotalTrackableItems(items) {
        let count = 0;
        items.forEach(item => {
            if (!item.removed) { // Only count if not removed
                count++;
                if (item.children && item.children.length > 0) {
                    count += countTotalTrackableItems(item.children);
                }
            }
        });
        return count;
    }

    // Function to count completed items (excluding removed)
    function countCompletedTrackableItems(items) {
        let count = 0;
        items.forEach(item => {
             if (!item.removed) { // Only count if not removed
                if (item.completed) {
                    count++;
                }
                if (item.children && item.children.length > 0) {
                    count += countCompletedTrackableItems(item.children);
                }
             }
        });
        return count;
    }

    // Function to update the progress display
    function updateProgressDisplay() {
        if (!currentDocStructure) {
            progressDisplay.textContent = 'N/A';
            return;
        }
        const total = countTotalTrackableItems(currentDocStructure);
        const completed = countCompletedTrackableItems(currentDocStructure);

        if (total === 0) {
            progressDisplay.textContent = '0/0 (0%)';
        } else {
            const percentage = Math.round((completed / total) * 100);
            progressDisplay.textContent = `${completed}/${total} (${percentage}%)`;
        }
    }


    // Modal close logic (already exists)
    closeButton.onclick = () => {
        notesModal.style.display = 'none';
    }
    window.onclick = (event) => {
        if (event.target == notesModal) {
            notesModal.style.display = 'none';
        }
    }

    // Save note button logic (already exists, but ensure it updates progress if needed - not directly related)
    saveNoteButton.addEventListener('click', async () => {
        if (currentEditingItemId) {
            const notes = notesTextarea.value;
            await updateStoredItem(currentEditingItemId, { notes: notes });
            notesModal.style.display = 'none';
            // Optionally, update the UI to indicate a note exists (e.g., change note button color)
            // This would require finding the item in the DOM by currentEditingItemId
        }
    });

    // Refresh button logic (already exists)
    refreshButton.addEventListener('click', loadStructure);

    // Initial load
    loadStructure();
});
