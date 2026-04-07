(function () {
  let overrideVolume = null;
  let overrideSpeed = null;

  var MIN_SPEED = 0.25;
  var MAX_SPEED = 4;
  var SPEED_STEP = 0.25;

  // --- Volume monkey-patch ---
  var volDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
  var volOrigSet = volDesc.set;
  var volOrigGet = volDesc.get;

  Object.defineProperty(HTMLMediaElement.prototype, "volume", {
    get: function () {
      if (overrideVolume !== null) return overrideVolume;
      return volOrigGet.call(this);
    },
    set: function (val) {
      volOrigSet.call(this, overrideVolume !== null ? overrideVolume : val);
    },
    configurable: true,
    enumerable: true,
  });

  // --- PlaybackRate monkey-patch ---
  var rateDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "playbackRate");
  var rateOrigSet = rateDesc.set;
  var rateOrigGet = rateDesc.get;

  Object.defineProperty(HTMLMediaElement.prototype, "playbackRate", {
    get: function () {
      if (overrideSpeed !== null) return overrideSpeed;
      return rateOrigGet.call(this);
    },
    set: function (val) {
      rateOrigSet.call(this, overrideSpeed !== null ? overrideSpeed : val);
    },
    configurable: true,
    enumerable: true,
  });

  // --- Speed overlay ---
  var overlayEl = null;
  var overlayTimeout = null;

  function showSpeedOverlay(speed) {
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.style.cssText =
        "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);" +
        "background:rgba(0,0,0,0.7);color:#fff;font-size:28px;font-weight:700;" +
        "padding:14px 28px;border-radius:10px;z-index:2147483647;" +
        "pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;" +
        "transition:opacity 0.3s;opacity:0;";
      document.documentElement.appendChild(overlayEl);
    }
    overlayEl.textContent = speed.toFixed(2) + "x";
    overlayEl.style.opacity = "1";
    clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(function () {
      overlayEl.style.opacity = "0";
    }, 800);
  }

  // --- Receive from content script ---
  window.addEventListener("__vc_set_volume", function (e) {
    overrideVolume = e.detail.volume;
    var els = document.querySelectorAll("video, audio");
    for (var i = 0; i < els.length; i++) {
      volOrigSet.call(els[i], overrideVolume);
    }
  });

  window.addEventListener("__vc_set_speed", function (e) {
    overrideSpeed = e.detail.speed;
    var els = document.querySelectorAll("video, audio");
    for (var i = 0; i < els.length; i++) {
      rateOrigSet.call(els[i], overrideSpeed);
    }
    showSpeedOverlay(overrideSpeed);
  });

  // --- Keyboard shortcuts ---
  document.addEventListener("keydown", function (e) {
    var tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

    var current, newSpeed;

    if (e.key === "d") {
      current = overrideSpeed || 1;
      newSpeed = Math.min(MAX_SPEED, Math.round((current + SPEED_STEP) * 100) / 100);
    } else if (e.key === "s") {
      current = overrideSpeed || 1;
      newSpeed = Math.max(MIN_SPEED, Math.round((current - SPEED_STEP) * 100) / 100);
    }

    if (newSpeed !== undefined) {
      overrideSpeed = newSpeed;
      var els = document.querySelectorAll("video, audio");
      for (var i = 0; i < els.length; i++) {
        rateOrigSet.call(els[i], overrideSpeed);
      }
      showSpeedOverlay(overrideSpeed);
      // Tell content script to save
      window.dispatchEvent(new CustomEvent("__vc_speed_changed", { detail: { speed: overrideSpeed } }));
    }
  });
})();
