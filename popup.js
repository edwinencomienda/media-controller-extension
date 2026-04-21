var volumeSlider = document.getElementById("volume-slider");
var volumeDisplay = document.getElementById("volume-value");
var speedSlider = document.getElementById("speed-slider");
var speedDisplay = document.getElementById("speed-value");
var speedApplyAll = document.getElementById("speed-apply-all");
var suppressSiteShortcuts = document.getElementById("suppress-site-shortcuts");
var siteEnabledToggle = document.getElementById("site-enabled");
var currentSiteSpan = document.getElementById("current-site");
var volumeSection = document.getElementById("volume-section");
var speedSection = document.getElementById("speed-section");

var currentOrigin = null;
var isPopupOpen = true;

function getTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    callback(tabs[0]);
  });
}

// --- Site Enable/Disable ---

function loadSiteEnabled(callback) {
  getTab(function (tab) {
    if (!tab || !tab.url) {
      if (callback) callback(false);
      return;
    }
    var url = new URL(tab.url);
    currentOrigin = url.origin;
    
    // Display hostname without www
    var hostname = url.hostname.replace(/^www\./, '');
    currentSiteSpan.textContent = hostname || 'this site';
    
    var key = currentOrigin + ":enabled";
    chrome.storage.local.get(key, function (result) {
      // Default to true (enabled) if not set
      var enabled = result[key] !== false;
      siteEnabledToggle.checked = enabled;
      updateControlsEnabled(enabled);
      
      if (callback) callback(enabled);
    });
  });
}

function updateControlsEnabled(enabled) {
  if (enabled) {
    volumeSection.classList.remove("disabled");
    speedSection.classList.remove("disabled");
  } else {
    volumeSection.classList.add("disabled");
    speedSection.classList.add("disabled");
  }
}

function setSiteEnabled(enabled) {
  if (!currentOrigin) return;
  
  var key = currentOrigin + ":enabled";
  chrome.storage.local.set({ [key]: enabled });
  
  updateControlsEnabled(enabled);
  
  getTab(function (tab) {
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "SET_SITE_ENABLED", enabled: enabled }).catch(function () {});
  });
  
  // If re-enabling, reload settings
  if (enabled) {
    loadAllSettings();
  }
}

siteEnabledToggle.addEventListener("change", function () {
  setSiteEnabled(siteEnabledToggle.checked);
});

// --- Load All Settings ---

function loadAllSettings() {
  if (!currentOrigin) return;
  
  // Load volume
  var volumeKey = currentOrigin + ":volume";
  chrome.storage.local.get(volumeKey, function (result) {
    var volume = result[volumeKey] ?? 100;
    volumeSlider.value = volume;
    volumeDisplay.textContent = volume + "%";
  });
  
  // Load speed and applyAll together. The popup should always reflect the
  // stored speed value even when "apply to all videos" is off.
  var speedKey = currentOrigin + ":speed";
  chrome.storage.local.get([speedKey, "speedApplyAll"], function (result) {
    var applyAll = result.speedApplyAll !== false;
    var speed = result[speedKey] ?? 100;
    speedApplyAll.checked = applyAll;
    speedSlider.value = speed;
    speedDisplay.textContent = (speed / 100).toFixed(2) + "x";
  });
  
  // Load suppress site shortcuts
  chrome.storage.local.get("suppressSiteShortcuts", function (result) {
    var enabled = result.suppressSiteShortcuts !== false;
    suppressSiteShortcuts.checked = enabled;
  });
}

// --- Volume ---

function setVolume(volume) {
  if (!currentOrigin) return;
  getTab(function (tab) {
    if (!tab || !tab.id) return;
    var key = currentOrigin + ":volume";
    chrome.storage.local.set({ [key]: volume });
    chrome.tabs.sendMessage(tab.id, { type: "SET_VOLUME", volume: volume / 100 }).catch(function () {});
  });
}

volumeSlider.addEventListener("input", function () {
  var volume = parseInt(volumeSlider.value, 10);
  volumeDisplay.textContent = volume + "%";
  setVolume(volume);
});

document.getElementById("reset-volume-btn").addEventListener("click", function () {
  volumeSlider.value = 100;
  volumeDisplay.textContent = "100%";
  setVolume(100);
});

// --- Speed ---

function setSpeed(speed) {
  if (!currentOrigin) return;
  getTab(function (tab) {
    if (!tab || !tab.id) return;
    var key = currentOrigin + ":speed";
    chrome.storage.local.set({ [key]: speed });
    chrome.tabs.sendMessage(tab.id, { type: "SET_SPEED", speed: speed / 100 }).catch(function () {});
  });
}

speedSlider.addEventListener("input", function () {
  var speed = parseInt(speedSlider.value, 10);
  speedDisplay.textContent = (speed / 100).toFixed(2) + "x";
  setSpeed(speed);
});

document.getElementById("reset-speed-btn").addEventListener("click", function () {
  speedSlider.value = 100;
  speedDisplay.textContent = "1.00x";
  setSpeed(100);
});

// --- Apply to All toggle ---

speedApplyAll.addEventListener("change", function () {
  var enabled = speedApplyAll.checked;
  chrome.storage.local.set({ speedApplyAll: enabled });
  getTab(function (tab) {
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "SET_SPEED_MODE", applyAll: enabled }).catch(function () {});
  });
});

// Sync sliders when storage changes (e.g. keyboard shortcuts update speed/volume)
chrome.storage.onChanged.addListener(function (changes) {
  if (!isPopupOpen) return;
  
  // If currentOrigin isn't set yet, try to get it from the current tab
  if (!currentOrigin) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0] || !tabs[0].url) return;
      var origin = new URL(tabs[0].url).origin;
      syncSliders(changes, origin);
    });
    return;
  }
  
  syncSliders(changes, currentOrigin);
});

function syncSliders(changes, origin) {
  // Only sync if the popup is open and values actually changed
  if (changes[origin + ":speed"] && changes[origin + ":speed"].newValue !== undefined) {
    var speed = changes[origin + ":speed"].newValue;
    speedSlider.value = speed;
    speedDisplay.textContent = (speed / 100).toFixed(2) + "x";
  }

  if (changes[origin + ":volume"] && changes[origin + ":volume"].newValue !== undefined) {
    var volume = changes[origin + ":volume"].newValue;
    volumeSlider.value = volume;
    volumeDisplay.textContent = volume + "%";
  }
}

suppressSiteShortcuts.addEventListener("change", function () {
  var enabled = suppressSiteShortcuts.checked;
  chrome.storage.local.set({ suppressSiteShortcuts: enabled });
  getTab(function (tab) {
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "SET_SUPPRESS_SITE_SHORTCUTS", enabled: enabled }).catch(function () {});
  });
});

// Initialize - load site enabled first, then load all settings
loadSiteEnabled(function(enabled) {
  if (enabled) {
    loadAllSettings();
  }
});

// Mark popup as closed when unloading
window.addEventListener('unload', function() {
  isPopupOpen = false;
});
