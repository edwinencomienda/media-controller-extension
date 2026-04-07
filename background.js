// Update badge when speed changes
chrome.runtime.onMessage.addListener(function (message, sender) {
  if (message.type === "UPDATE_BADGE" && sender.tab) {
    var speed = message.speed;
    var text = speed === 1 ? "" : speed.toFixed(2) + "x";
    chrome.action.setBadgeText({ text: text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#6c63ff", tabId: sender.tab.id });
  }
});

// Update badge when switching tabs (show the speed for that tab's site)
chrome.tabs.onActivated.addListener(function (activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function (tab) {
    if (!tab || !tab.url) return;
    try {
      var origin = new URL(tab.url).origin;
      var key = origin + ":speed";
      chrome.storage.local.get(key, function (result) {
        var speed = (result[key] ?? 100) / 100;
        var text = speed === 1 ? "" : speed.toFixed(2) + "x";
        chrome.action.setBadgeText({ text: text, tabId: activeInfo.tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#6c63ff", tabId: activeInfo.tabId });
      });
    } catch (e) {}
  });
});
