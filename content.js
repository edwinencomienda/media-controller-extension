// Content script — handles storage + messaging.
// Communicates with inject.js (main world) via CustomEvent.

function sendVolume(volume) {
  window.dispatchEvent(new CustomEvent("__vc_set_volume", { detail: { volume: volume } }));
}

function sendSpeed(speed) {
  window.dispatchEvent(new CustomEvent("__vc_set_speed", { detail: { speed: speed } }));
  chrome.runtime.sendMessage({ type: "UPDATE_BADGE", speed: speed });
}

function sendSpeedMode(applyAll) {
  window.dispatchEvent(new CustomEvent("__vc_set_speed_mode", { detail: { applyAll: applyAll } }));
}

chrome.runtime.onMessage.addListener(function (message) {
  if (message.type === "SET_VOLUME") {
    sendVolume(message.volume);
  }
  if (message.type === "SET_SPEED") {
    sendSpeed(message.speed);
  }
  if (message.type === "SET_SPEED_MODE") {
    sendSpeedMode(message.applyAll);
  }
});

// Persist speed from keyboard shortcuts
window.addEventListener("__vc_speed_changed", function (e) {
  var origin = window.location.origin;
  var speed = Math.round(e.detail.speed * 100);
  chrome.storage.local.set({ [origin + ":speed"]: speed });
  chrome.runtime.sendMessage({ type: "UPDATE_BADGE", speed: e.detail.speed });
});

document.addEventListener("yt-navigate-finish", function () {
  loadAndApply();
});

function loadAndApply() {
  var origin = window.location.origin;
  chrome.storage.local.get([origin + ":volume", origin + ":speed", "speedApplyAll"], function (result) {
    var volume = result[origin + ":volume"];
    if (volume === undefined) volume = 100;
    sendVolume(volume / 100);

    var applyAll = result.speedApplyAll !== false;
    sendSpeedMode(applyAll);

    if (applyAll) {
      var speed = result[origin + ":speed"];
      if (speed === undefined) speed = 100;
      sendSpeed(speed / 100);
    } else {
      // Reset speed override so monkey-patch doesn't interfere
      sendSpeed(1);
    }
  });
}

loadAndApply();
