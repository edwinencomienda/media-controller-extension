// Content script — handles storage + messaging.
// Communicates with inject.js (main world) via CustomEvent.

function sendVolume(volume) {
  window.dispatchEvent(new CustomEvent("__vc_set_volume", { detail: { volume: volume } }));
}

function sendSpeed(speed) {
  window.dispatchEvent(new CustomEvent("__vc_set_speed", { detail: { speed: speed } }));
}

chrome.runtime.onMessage.addListener(function (message) {
  if (message.type === "SET_VOLUME") {
    sendVolume(message.volume);
  }
  if (message.type === "SET_SPEED") {
    sendSpeed(message.speed);
  }
});

// Persist speed from keyboard shortcuts
window.addEventListener("__vc_speed_changed", function (e) {
  var origin = window.location.origin;
  var speed = Math.round(e.detail.speed * 100);
  chrome.storage.local.set({ [origin + ":speed"]: speed });
});

document.addEventListener("yt-navigate-finish", function () {
  loadAndApply();
});

function loadAndApply() {
  var origin = window.location.origin;
  chrome.storage.local.get([origin + ":volume", origin + ":speed"], function (result) {
    var volume = result[origin + ":volume"];
    if (volume === undefined) volume = 100;
    sendVolume(volume / 100);

    var speed = result[origin + ":speed"];
    if (speed === undefined) speed = 100;
    sendSpeed(speed / 100);
  });
}

loadAndApply();
