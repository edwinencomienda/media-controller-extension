const slider = document.getElementById("volume-slider");
const valueDisplay = document.getElementById("volume-value");

// Load saved volume for the current tab's origin
async function loadVolume() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  const origin = new URL(tab.url).origin;
  const result = await chrome.storage.local.get(origin);
  const volume = result[origin] ?? 100;

  slider.value = volume;
  valueDisplay.textContent = `${volume}%`;
}

// Send volume to content script and also inject directly as a fallback
async function setVolume(volume) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const origin = new URL(tab.url).origin;
  await chrome.storage.local.set({ [origin]: volume });

  // Try message first
  chrome.tabs.sendMessage(tab.id, { type: "SET_VOLUME", volume: volume / 100 }).catch(() => {});

  // Also inject directly as a fallback in case content script isn't connected
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (vol) => {
      document.querySelectorAll("video, audio").forEach((el) => {
        el.volume = vol;
      });
    },
    args: [volume / 100],
  }).catch(() => {});
}

slider.addEventListener("input", () => {
  const volume = parseInt(slider.value, 10);
  valueDisplay.textContent = `${volume}%`;
  setVolume(volume);
});

document.getElementById("reset-btn").addEventListener("click", () => {
  slider.value = 100;
  valueDisplay.textContent = "100%";
  setVolume(100);
});

loadVolume();
