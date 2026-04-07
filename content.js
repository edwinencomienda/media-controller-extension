// Content script (isolated world) — handles storage + messaging.
// The actual volume override happens in inject.js (main world).

function sendVolumeToPage(volume) {
  window.dispatchEvent(
    new CustomEvent("__vc_set_volume", { detail: { volume } })
  );
}

// Listen for volume changes from popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SET_VOLUME") {
    sendVolumeToPage(message.volume);
  }
});

// YouTube SPA navigation — re-enforce
document.addEventListener("yt-navigate-finish", () => {
  loadAndApply();
});

async function loadAndApply() {
  const origin = window.location.origin;
  const result = await chrome.storage.local.get(origin);
  if (result[origin] !== undefined) {
    sendVolumeToPage(result[origin] / 100);
  }
}

loadAndApply();
