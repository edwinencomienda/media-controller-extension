// Content script — handles storage + messaging.
// Communicates with inject.js (main world) via CustomEvent.
// Runs in all frames; top frame bridges to child iframes via postMessage.

var IS_TOP_FRAME = window.top === window;

function sendVolume(volume) {
  window.dispatchEvent(new CustomEvent("__vc_set_volume", { detail: { volume: volume } }));
}

function sendSpeed(speed) {
  window.dispatchEvent(new CustomEvent("__vc_set_speed", { detail: { speed: speed } }));
  if (IS_TOP_FRAME) {
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", speed: speed });
  }
}

function sendSpeedMode(applyAll) {
  window.dispatchEvent(new CustomEvent("__vc_set_speed_mode", { detail: { applyAll: applyAll } }));
}

function sendSuppressSiteShortcuts(enabled) {
  window.dispatchEvent(new CustomEvent("__vc_set_suppress_site_shortcuts", { detail: { enabled: enabled } }));
}

function sendSiteEnabled(enabled) {
  window.dispatchEvent(new CustomEvent("__vc_set_site_enabled", { detail: { enabled: enabled } }));
}

// Broadcast settings to all child iframes (cross-origin safe via postMessage).
function broadcastToFrames(payload) {
  var iframes = document.querySelectorAll("iframe");
  for (var i = 0; i < iframes.length; i++) {
    try {
      iframes[i].contentWindow.postMessage({ __vc: true, payload: payload }, "*");
    } catch (e) {}
  }
}

function applyPayload(payload) {
  if (payload.enabled !== undefined) sendSiteEnabled(payload.enabled);
  if (payload.volume !== undefined) sendVolume(payload.volume);
  if (payload.applyAll !== undefined) sendSpeedMode(payload.applyAll);
  if (payload.speed !== undefined) sendSpeed(payload.speed);
  if (payload.suppressSiteShortcuts !== undefined) sendSuppressSiteShortcuts(payload.suppressSiteShortcuts);
}

chrome.runtime.onMessage.addListener(function (message) {
  var payload = {};
  if (message.type === "SET_SITE_ENABLED") {
    sendSiteEnabled(message.enabled);
    payload.enabled = message.enabled;
    // Save the setting
    var origin = window.location.origin;
    chrome.storage.local.set({ [origin + ":enabled"]: message.enabled });
  }
  if (message.type === "SET_VOLUME") {
    sendVolume(message.volume);
    payload.volume = message.volume;
  }
  if (message.type === "SET_SPEED") {
    sendSpeed(message.speed);
    payload.speed = message.speed;
  }
  if (message.type === "SET_SPEED_MODE") {
    sendSpeedMode(message.applyAll);
    payload.applyAll = message.applyAll;
  }
  if (message.type === "SET_SUPPRESS_SITE_SHORTCUTS") {
    sendSuppressSiteShortcuts(message.enabled);
    payload.suppressSiteShortcuts = message.enabled;
  }
  // Propagate to iframes so embedded players (YouTube, Vimeo, etc.) update too.
  if (IS_TOP_FRAME) broadcastToFrames(payload);
});

// Cross-frame bridge.
window.addEventListener("message", function (e) {
  if (!e.data || e.data.__vc !== true) return;

  if (IS_TOP_FRAME) {
    // Child frame forwarding a keyboard-shortcut change — persist + re-apply locally + rebroadcast.
    if (e.data.persist) {
      var p = e.data.persist;
      if (p.volume !== undefined) {
        sendVolume(p.volume);
        var origin1 = window.location.origin;
        chrome.storage.local.set({ [origin1 + ":volume"]: Math.round(p.volume * 100) });
        broadcastToFrames({ volume: p.volume });
      }
      if (p.speed !== undefined) {
        sendSpeed(p.speed);
        var origin2 = window.location.origin;
        chrome.storage.local.set({ [origin2 + ":speed"]: Math.round(p.speed * 100) });
        broadcastToFrames({ speed: p.speed });
      }
      return;
    }
    // Child frame is asking for the top-frame's current settings.
    if (e.data.request === "settings") {
      var origin = window.location.origin;
      chrome.storage.local.get([origin + ":enabled", origin + ":volume", origin + ":speed", "speedApplyAll", "suppressSiteShortcuts"], function (result) {
        var enabled = result[origin + ":enabled"];
        if (enabled === undefined) enabled = true; // default enabled
        
        var volume = result[origin + ":volume"];
        if (volume === undefined) volume = 100;
        
        var applyAll = result.speedApplyAll !== false;
        
        var speed = result[origin + ":speed"];
        if (speed === undefined) speed = 100;
        
        var payload = {
          enabled: enabled,
          volume: volume / 100,
          applyAll: applyAll,
          speed: applyAll ? speed / 100 : 1,
          suppressSiteShortcuts: result.suppressSiteShortcuts !== false,
        };
        try {
          e.source.postMessage({ __vc: true, payload: payload }, "*");
        } catch (err) {}
      });
    }
  } else {
    // Child frame receiving settings from top frame.
    if (e.data.payload) applyPayload(e.data.payload);
  }
});

// Persist speed from keyboard shortcuts
window.addEventListener("__vc_speed_changed", function (e) {
  if (!IS_TOP_FRAME) {
    // Child frame can't persist against the top-level origin directly;
    // forward to the top frame instead.
    try {
      window.parent.postMessage({ __vc: true, persist: { speed: e.detail.speed } }, "*");
    } catch (err) {}
    return;
  }
  var origin = window.location.origin;
  var speed = Math.round(e.detail.speed * 100);
  chrome.storage.local.set({ [origin + ":speed"]: speed });
  chrome.runtime.sendMessage({ type: "UPDATE_BADGE", speed: e.detail.speed });
  broadcastToFrames({ speed: e.detail.speed });
});

// Persist volume from keyboard shortcuts
window.addEventListener("__vc_volume_changed", function (e) {
  if (!IS_TOP_FRAME) {
    try {
      window.parent.postMessage({ __vc: true, persist: { volume: e.detail.volume } }, "*");
    } catch (err) {}
    return;
  }
  var origin = window.location.origin;
  var volume = Math.round(e.detail.volume * 100);
  chrome.storage.local.set({ [origin + ":volume"]: volume });
  broadcastToFrames({ volume: e.detail.volume });
});

document.addEventListener("yt-navigate-finish", function () {
  loadAndApply();
});

function loadAndApply() {
  if (!IS_TOP_FRAME) {
    // Child frames (e.g. YouTube iframe) inherit from the top frame,
    // because the popup stores settings by the top-level origin.
    try {
      window.parent.postMessage({ __vc: true, request: "settings" }, "*");
    } catch (e) {}
    return;
  }

  var origin = window.location.origin;
  chrome.storage.local.get([origin + ":enabled", origin + ":volume", origin + ":speed", "speedApplyAll", "suppressSiteShortcuts"], function (result) {
    // Check if site is enabled (default to true)
    var enabled = result[origin + ":enabled"];
    if (enabled === undefined) enabled = true;
    
    // Send enabled state first
    sendSiteEnabled(enabled);
    
    if (!enabled) {
      // Site is disabled, don't apply any overrides
      // Clear the badge
      chrome.runtime.sendMessage({ type: "CLEAR_BADGE" }).catch(function(){});
      return;
    }

    var volume = result[origin + ":volume"];
    if (volume === undefined) volume = 100;
    sendVolume(volume / 100);

    var applyAll = result.speedApplyAll !== false;
    sendSpeedMode(applyAll);

    var suppress = result.suppressSiteShortcuts !== false;
    sendSuppressSiteShortcuts(suppress);

    var speed;
    if (applyAll) {
      speed = result[origin + ":speed"];
      if (speed === undefined) speed = 100;
      sendSpeed(speed / 100);
    } else {
      // Reset speed override so monkey-patch doesn't interfere
      speed = 100;
      sendSpeed(1);
    }

    // Push the initial state down to any iframes that already exist.
    broadcastToFrames({
      enabled: enabled,
      volume: volume / 100,
      applyAll: applyAll,
      speed: applyAll ? speed / 100 : 1,
      suppressSiteShortcuts: suppress,
    });
  });
}

loadAndApply();
