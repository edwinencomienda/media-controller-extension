(function () {
  var overrideVolume = null;
  var overrideSpeed = null;
  var speedApplyAll = true;

  var MIN_SPEED = 0.25;
  var MAX_SPEED = 4;
  var SPEED_STEP = 0.25;

  var MIN_VOLUME = 0;
  var MAX_VOLUME = 1;
  var VOLUME_STEP = 0.05;

  // --- Volume monkey-patch (always active) ---
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

  // --- PlaybackRate monkey-patch (respects applyAll toggle) ---
  var rateDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "playbackRate");
  var rateOrigSet = rateDesc.set;
  var rateOrigGet = rateDesc.get;

  Object.defineProperty(HTMLMediaElement.prototype, "playbackRate", {
    get: function () {
      if (overrideSpeed !== null && speedApplyAll) return overrideSpeed;
      return rateOrigGet.call(this);
    },
    set: function (val) {
      if (overrideSpeed !== null && speedApplyAll) {
        rateOrigSet.call(this, overrideSpeed);
      } else {
        rateOrigSet.call(this, val);
      }
    },
    configurable: true,
    enumerable: true,
  });

  // --- Helper: find the currently playing video ---
  function getActiveVideo() {
    var els = document.querySelectorAll("video, audio");
    for (var i = 0; i < els.length; i++) {
      if (!els[i].paused) return els[i];
    }
    // Fallback to first video if none playing
    return els[0] || null;
  }

  // --- Speed overlay ---
  var speedOverlayEl = null;
  var speedOverlayTimeout = null;

  function showSpeedOverlay(speed) {
    if (!speedOverlayEl) {
      speedOverlayEl = document.createElement("div");
      speedOverlayEl.style.cssText =
        "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);" +
        "background:rgba(0,0,0,0.7);color:#fff;font-size:28px;font-weight:700;" +
        "padding:14px 28px;border-radius:10px;z-index:2147483647;" +
        "pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;" +
        "transition:opacity 0.3s;opacity:0;";
      document.documentElement.appendChild(speedOverlayEl);
    }
    speedOverlayEl.textContent = speed.toFixed(2) + "x";
    speedOverlayEl.style.opacity = "1";
    clearTimeout(speedOverlayTimeout);
    speedOverlayTimeout = setTimeout(function () {
      speedOverlayEl.style.opacity = "0";
    }, 800);
  }

  // --- Volume overlay ---
  var volumeOverlayEl = null;
  var volumeOverlayTimeout = null;

  function showVolumeOverlay(volume) {
    if (!volumeOverlayEl) {
      volumeOverlayEl = document.createElement("div");
      volumeOverlayEl.style.cssText =
        "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);" +
        "background:rgba(0,0,0,0.7);color:#fff;font-size:28px;font-weight:700;" +
        "padding:14px 28px;border-radius:10px;z-index:2147483647;" +
        "pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;" +
        "transition:opacity 0.3s;opacity:0;";
      document.documentElement.appendChild(volumeOverlayEl);
    }
    volumeOverlayEl.textContent = Math.round(volume * 100) + "%";
    volumeOverlayEl.style.opacity = "1";
    clearTimeout(volumeOverlayTimeout);
    volumeOverlayTimeout = setTimeout(function () {
      volumeOverlayEl.style.opacity = "0";
    }, 800);
  }

  // --- Apply speed based on mode ---
  function applySpeed(speed) {
    overrideSpeed = speed;
    if (speedApplyAll) {
      // Apply to all media elements
      var els = document.querySelectorAll("video, audio");
      for (var i = 0; i < els.length; i++) {
        rateOrigSet.call(els[i], overrideSpeed);
      }
    } else {
      // Only apply to the currently playing video
      var active = getActiveVideo();
      if (active) {
        rateOrigSet.call(active, overrideSpeed);
      }
    }
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
    applySpeed(e.detail.speed);
  });

  window.addEventListener("__vc_set_speed_mode", function (e) {
    speedApplyAll = e.detail.applyAll;
    // Re-apply current speed with new mode
    if (overrideSpeed !== null) {
      applySpeed(overrideSpeed);
    }
  });

  // --- Keyboard shortcuts ---
  document.addEventListener("keydown", function (e) {
    var tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

    if (!document.querySelector("video, audio")) return;

    var current, newSpeed, newVolume;

    // Speed shortcuts
    if (e.key === "d") {
      current = overrideSpeed || 1;
      newSpeed = Math.min(MAX_SPEED, Math.round((current + SPEED_STEP) * 100) / 100);
    } else if (e.key === "s") {
      current = overrideSpeed || 1;
      newSpeed = Math.max(MIN_SPEED, Math.round((current - SPEED_STEP) * 100) / 100);
    }

    // Volume shortcuts
    if (e.key === "e") {
      current = overrideVolume !== null ? overrideVolume : 1;
      newVolume = Math.min(MAX_VOLUME, Math.round((current + VOLUME_STEP) * 100) / 100);
    } else if (e.key === "w") {
      current = overrideVolume !== null ? overrideVolume : 1;
      newVolume = Math.max(MIN_VOLUME, Math.round((current - VOLUME_STEP) * 100) / 100);
    }

    if (newSpeed !== undefined) {
      applySpeed(newSpeed);
      showSpeedOverlay(overrideSpeed);
      // Tell content script to save
      window.dispatchEvent(new CustomEvent("__vc_speed_changed", { detail: { speed: overrideSpeed } }));
    }

    if (newVolume !== undefined) {
      overrideVolume = newVolume;
      // Apply to all media elements
      var els = document.querySelectorAll("video, audio");
      for (var i = 0; i < els.length; i++) {
        volOrigSet.call(els[i], overrideVolume);
      }
      showVolumeOverlay(overrideVolume);
      // Tell content script to save
      window.dispatchEvent(new CustomEvent("__vc_volume_changed", { detail: { volume: overrideVolume } }));
    }
  });
})();
