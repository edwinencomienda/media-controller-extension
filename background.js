// Update badge when speed changes
chrome.runtime.onMessage.addListener(function (message, sender) {
  if (message.type === "UPDATE_BADGE" && sender.tab) {
    var speed = message.speed;
    var text = speed === 1 ? "" : speed.toFixed(2) + "x";
    chrome.action.setBadgeText({ text: text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#7c7cff", tabId: sender.tab.id });
  }
  if (message.type === "CLEAR_BADGE" && sender.tab) {
    chrome.action.setBadgeText({ text: "", tabId: sender.tab.id });
  }
});

// Update badge when switching tabs (show the speed for that tab's site)
chrome.tabs.onActivated.addListener(function (activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function (tab) {
    if (!tab || !tab.url) return;
    try {
      var origin = new URL(tab.url).origin;
      var enabledKey = origin + ":enabled";
      var speedKey = origin + ":speed";
      
      chrome.storage.local.get([enabledKey, speedKey], function (result) {
        // Check if site is enabled (default true)
        var enabled = result[enabledKey];
        if (enabled === false) {
          // Site is disabled, clear the badge
          chrome.action.setBadgeText({ text: "", tabId: activeInfo.tabId });
          return;
        }
        
        var speed = (result[speedKey] ?? 100) / 100;
        var text = speed === 1 ? "" : speed.toFixed(2) + "x";
        chrome.action.setBadgeText({ text: text, tabId: activeInfo.tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#7c7cff", tabId: activeInfo.tabId });
      });
    } catch (e) {}
  });
});
