// This script runs in the MAIN world — same context as YouTube's own JS.
// It overrides the volume property on HTMLMediaElement so that YouTube
// (or any page) can never set a volume different from ours.

(function () {
  let overrideVolume = null; // null = not active, let page do whatever

  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    "volume"
  );
  const originalSet = descriptor.set;
  const originalGet = descriptor.get;

  Object.defineProperty(HTMLMediaElement.prototype, "volume", {
    get() {
      if (overrideVolume !== null) return overrideVolume;
      return originalGet.call(this);
    },
    set(val) {
      if (overrideVolume !== null) {
        // Force our volume instead of what the page wants
        originalSet.call(this, overrideVolume);
      } else {
        originalSet.call(this, val);
      }
    },
    configurable: true,
    enumerable: true,
  });

  // Listen for messages from the content script
  window.addEventListener("__vc_set_volume", (e) => {
    overrideVolume = e.detail.volume;
    // Apply to all existing media elements
    for (const el of document.querySelectorAll("video, audio")) {
      originalSet.call(el, overrideVolume);
    }
  });
})();
