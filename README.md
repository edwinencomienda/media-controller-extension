# Volume Controller Extension

A Chrome extension that controls the volume and playback speed of all videos/audio on any page, with special support for YouTube and other SPAs.

## Features

- **Volume Slider** — Set volume from 0% to 100% via the popup
- **Speed Slider** — Set playback speed from 0.25x to 4x via the popup
- **Keyboard Shortcuts** — Quick adjustments without opening the popup:
  - **Speed**: Press `S` to slow down, `D` to speed up (0.25x increments)
  - **Volume**: Press `W` to decrease, `E` to increase (5% increments)
- **Visual Overlays** — Translucent overlay appears in the center of the page showing current speed or volume when changed via keyboard
- **Per-Site Persistence** — Volume and speed settings are saved per-origin and restored on page load
- **SPA Support** — Works across YouTube video navigation without needing a page refresh
- **Reset Buttons** — Quickly reset volume to 100% or speed to 1x

## Installation

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. The extension icon appears in the toolbar

## File Structure

```
├── manifest.json    # Extension config (Manifest V3)
├── popup.html       # Popup UI with sliders, reset buttons, shortcut hints
├── popup.js         # Popup logic: reads/writes storage, sends messages to content script
├── content.js       # Content script (isolated world): bridges popup ↔ inject.js, handles storage
├── inject.js        # Main world script: monkey-patches HTMLMediaElement, keyboard shortcuts, overlay
└── icons/           # Extension icons (16, 48, 128px)
```

## Architecture

### Two-World Design

Chrome content scripts run in an **isolated world** — they share the DOM with the page but not the JavaScript context. This means setting `video.volume` from a content script works, but sites like YouTube can immediately override it from their own JS.

To prevent this, `inject.js` runs in the **main world** (same JS context as the page) via `"world": "MAIN"` in `manifest.json`. It monkey-patches `HTMLMediaElement.prototype.volume` and `HTMLMediaElement.prototype.playbackRate` so that any attempt by the page to change these values is intercepted and replaced with the extension's values.

### Communication Flow

```
Popup (popup.js)
  │
  │  chrome.tabs.sendMessage({ type: "SET_VOLUME", volume: 0.5 })
  ▼
Content Script (content.js) — isolated world
  │
  │  window.dispatchEvent(new CustomEvent("__vc_set_volume", { detail: { volume: 0.5 } }))
  ▼
Injected Script (inject.js) — main world
  │
  │  Overrides HTMLMediaElement.prototype.volume setter
  │  Applies to all <video> and <audio> elements
  ▼
Page audio is controlled
```

For keyboard shortcuts, the flow is reversed for persistence:

```
inject.js (keydown → change speed/volume)
  │
  │  window.dispatchEvent(new CustomEvent("__vc_speed_changed", { detail: { speed: 1.5 } }))
  │  window.dispatchEvent(new CustomEvent("__vc_volume_changed", { detail: { volume: 0.75 } }))
  ▼
content.js (receives event → saves to chrome.storage.local)
```

### Storage Keys

Settings are stored per-origin in `chrome.storage.local`:

| Key | Value | Example |
|-----|-------|---------|
| `{origin}:volume` | `0–100` (integer) | `"https://www.youtube.com:volume": 50` |
| `{origin}:speed` | `25–400` (integer, speed * 100) | `"https://www.youtube.com:speed": 150` |

### Why Monkey-Patching?

YouTube's player actively manages volume and playback rate. Simple approaches like setting `video.volume` from a content script fail because:

1. YouTube resets volume on video switch (SPA navigation reuses the same `<video>` element)
2. YouTube initializes volume on page load after the content script runs
3. Content scripts run in an isolated JS world — event-based overrides have a timing gap where audio briefly plays at the wrong level

By overriding the property setter on `HTMLMediaElement.prototype`, YouTube's calls to set volume/speed are intercepted at the lowest level. The page literally cannot set a different value.

### SPA Support (YouTube)

YouTube is a Single Page Application — clicking a video doesn't reload the page. The extension handles this via:

1. **`yt-navigate-finish` event** — YouTube fires this custom DOM event on every client-side navigation. `content.js` listens for it and re-sends the saved volume/speed to `inject.js`.
2. **Monkey-patched setters** — Even without the event, any attempt by YouTube to set volume/speed on the new video is intercepted by the patched setters in `inject.js`.

### Keyboard Shortcuts

| Key | Action | Step | Range |
|-----|--------|------|-------|
| `S` | Decrease speed | 0.25x | Min: 0.25x |
| `D` | Increase speed | 0.25x | Max: 4.00x |
| `W` | Decrease volume | 5% | Min: 0% |
| `E` | Increase volume | 5% | Max: 100% |

Shortcuts are **disabled** when:
- Focus is on an `<input>`, `<textarea>`, `<select>`, or `contenteditable` element
- Any modifier key is held (Ctrl, Alt, Meta, Shift)

This prevents conflicts with the page's own keyboard shortcuts (e.g., YouTube's search bar).

When using keyboard shortcuts, a translucent overlay appears in the center of the page showing the current value.

## Important Technical Notes

### Cross-World Communication

- **Use `CustomEvent` with separate named events** (e.g., `__vc_set_volume`, `__vc_set_speed`, `__vc_volume_changed`, `__vc_speed_changed`). Combined events with complex `detail` objects were unreliable across worlds.
- **Use callback-style** `chrome.storage.local.get(keys, callback)` instead of `async/await` in the content script for reliability.
- **Use `var` and `function` declarations** in `inject.js` (main world) for maximum compatibility — the script runs in the page's JS context which may have strict CSP rules.

### Known Gotchas

1. **After reloading the extension**, you must refresh any open tabs for the content scripts to re-inject.
2. **`world: "MAIN"` requires Chrome 111+**. For older Chrome versions, inject.js would need to be loaded via `<script>` tag injection from content.js with `web_accessible_resources`.
3. **Do NOT use `window.postMessage`** for cross-world communication — while it works in theory, it mixes with the page's own messages and can be unreliable.
4. **Do NOT combine event types into a single CustomEvent** — using separate events per action (`__vc_set_volume`, `__vc_set_speed`, `__vc_volume_changed`, `__vc_speed_changed`) proved more reliable than a single `__vc_set` event with a `type` field in the detail.
