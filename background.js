// background.js

// Listen for the extension being installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("Doc Tracker extension installed or updated.");
  // Here you could set up any initial storage values if needed
  // For example, setting default preferences.
});

// Example: Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "some_action") {
    console.log("Background script received a message:", request);
    // Process the request and optionally send a response
    // sendResponse({ status: "Action received by background" });
  }
  // Return true if you intend to send a response asynchronously
  // return true;
});

// You might not need much in the background script for the initial features,
// as most logic will be in content.js (page interaction) and popup.js (UI).
// However, it's here if you need to coordinate across different parts of the
// extension or handle events that aren't tied to a specific page or popup view.

// Create a context menu item (optional example)
// chrome.contextMenus.create({
//   id: "trackDocPage",
//   title: "Track this Documentation Page",
//   contexts: ["page"]
// });

// chrome.contextMenus.onClicked.addListener((info, tab) => {
//   if (info.menuItemId === "trackDocPage") {
//     // Logic to handle tracking the page
//     console.log("Context menu item clicked for page:", info.pageUrl);
//     // You could send a message to a content script or open the popup here
//   }
// });
