const volumeSlider = document.getElementById("volume-slider");
const volumeDisplay = document.getElementById("volume-value");
const speedSlider = document.getElementById("speed-slider");
const speedDisplay = document.getElementById("speed-value");

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// --- Volume ---

async function loadVolume() {
  const tab = await getTab();
  if (!tab?.url) return;

  const key = new URL(tab.url).origin + ":volume";
  const result = await chrome.storage.local.get(key);
  const volume = result[key] ?? 100;

  volumeSlider.value = volume;
  volumeDisplay.textContent = `${volume}%`;
}

async function setVolume(volume) {
  const tab = await getTab();
  if (!tab?.id) return;

  const key = new URL(tab.url).origin + ":volume";
  await chrome.storage.local.set({ [key]: volume });

  chrome.tabs.sendMessage(tab.id, { type: "SET_VOLUME", volume: volume / 100 }).catch(() => {});
}

volumeSlider.addEventListener("input", () => {
  const volume = parseInt(volumeSlider.value, 10);
  volumeDisplay.textContent = `${volume}%`;
  setVolume(volume);
});

document.getElementById("reset-volume-btn").addEventListener("click", () => {
  volumeSlider.value = 100;
  volumeDisplay.textContent = "100%";
  setVolume(100);
});

// --- Speed ---

async function loadSpeed() {
  const tab = await getTab();
  if (!tab?.url) return;

  const key = new URL(tab.url).origin + ":speed";
  const result = await chrome.storage.local.get(key);
  const speed = result[key] ?? 100;

  speedSlider.value = speed;
  speedDisplay.textContent = `${(speed / 100).toFixed(2)}x`;
}

async function setSpeed(speed) {
  const tab = await getTab();
  if (!tab?.id) return;

  const key = new URL(tab.url).origin + ":speed";
  await chrome.storage.local.set({ [key]: speed });

  chrome.tabs.sendMessage(tab.id, { type: "SET_SPEED", speed: speed / 100 }).catch(() => {});
}

speedSlider.addEventListener("input", () => {
  const speed = parseInt(speedSlider.value, 10);
  speedDisplay.textContent = `${(speed / 100).toFixed(2)}x`;
  setSpeed(speed);
});

document.getElementById("reset-speed-btn").addEventListener("click", () => {
  speedSlider.value = 100;
  speedDisplay.textContent = "1.00x";
  setSpeed(100);
});

loadVolume();
loadSpeed();
