var volumeSlider = document.getElementById("volume-slider");
var volumeDisplay = document.getElementById("volume-value");
var speedSlider = document.getElementById("speed-slider");
var speedDisplay = document.getElementById("speed-value");
var speedApplyAll = document.getElementById("speed-apply-all");
var suppressSiteShortcuts = document.getElementById("suppress-site-shortcuts");

function getTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    callback(tabs[0]);
  });
}

// --- Volume ---

function loadVolume() {
  getTab(function (tab) {
    if (!tab || !tab.url) return;
    var key = new URL(tab.url).origin + ":volume";
    chrome.storage.local.get(key, function (result) {
      var volume = result[key] ?? 100;
      volumeSlider.value = volume;
      volumeDisplay.textContent = volume + "%";
    });
  });
}

function setVolume(volume) {
  getTab(function (tab) {
    if (!tab || !tab.id) return;
    var key = new URL(tab.url).origin + ":volume";
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

function loadSpeed() {
  getTab(function (tab) {
    if (!tab || !tab.url) return;
    var key = new URL(tab.url).origin + ":speed";
    chrome.storage.local.get([key, "speedApplyAll"], function (result) {
      var applyAll = result.speedApplyAll !== false;
      var speed = applyAll ? (result[key] ?? 100) : 100;
      speedSlider.value = speed;
      speedDisplay.textContent = (speed / 100).toFixed(2) + "x";
    });
  });
}

function setSpeed(speed) {
  getTab(function (tab) {
    if (!tab || !tab.id) return;
    var key = new URL(tab.url).origin + ":speed";
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

function loadApplyAll() {
  chrome.storage.local.get("speedApplyAll", function (result) {
    var enabled = result.speedApplyAll !== false; // default true
    speedApplyAll.checked = enabled;
  });
}

speedApplyAll.addEventListener("change", function () {
  var enabled = speedApplyAll.checked;
  chrome.storage.local.set({ speedApplyAll: enabled });
  getTab(function (tab) {
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "SET_SPEED_MODE", applyAll: enabled }).catch(function () {});
  });
});

// Sync sliders when storage changes (e.g. keyboard shortcuts update speed)
chrome.storage.onChanged.addListener(function (changes) {
  getTab(function (tab) {
    if (!tab || !tab.url) return;
    var origin = new URL(tab.url).origin;

    if (changes[origin + ":speed"]) {
      var speed = changes[origin + ":speed"].newValue ?? 100;
      speedSlider.value = speed;
      speedDisplay.textContent = (speed / 100).toFixed(2) + "x";
    }

    if (changes[origin + ":volume"]) {
      var volume = changes[origin + ":volume"].newValue ?? 100;
      volumeSlider.value = volume;
      volumeDisplay.textContent = volume + "%";
    }
  });
});

function loadSuppressSiteShortcuts() {
  chrome.storage.local.get("suppressSiteShortcuts", function (result) {
    var enabled = result.suppressSiteShortcuts !== false; // default true
    suppressSiteShortcuts.checked = enabled;
  });
}

suppressSiteShortcuts.addEventListener("change", function () {
  var enabled = suppressSiteShortcuts.checked;
  chrome.storage.local.set({ suppressSiteShortcuts: enabled });
  getTab(function (tab) {
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "SET_SUPPRESS_SITE_SHORTCUTS", enabled: enabled }).catch(function () {});
  });
});

loadVolume();
loadSpeed();
loadApplyAll();
loadSuppressSiteShortcuts();
