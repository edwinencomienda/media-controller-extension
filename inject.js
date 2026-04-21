(function () {
  var siteEnabled = true; // Default: enabled
  var overrideVolume = null;
  var overrideSpeed = null;
  var speedApplyAll = true;
  var suppressSiteShortcuts = true;

  var MIN_SPEED = 0.25;
  var MAX_SPEED = 4;
  var SPEED_STEP = 0.25;

  var MIN_VOLUME = 0;
  var MAX_VOLUME = 1;
  var VOLUME_STEP = 0.05;

  // Store original descriptors
  var volDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
  var volOrigSet = volDesc.set;
  var volOrigGet = volDesc.get;

  var rateDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "playbackRate");
  var rateOrigSet = rateDesc.set;
  var rateOrigGet = rateDesc.get;

  // --- Volume monkey-patch (respects enabled state) ---
  Object.defineProperty(HTMLMediaElement.prototype, "volume", {
    get: function () {
      if (siteEnabled && overrideVolume !== null) return overrideVolume;
      return volOrigGet.call(this);
    },
    set: function (val) {
      volOrigSet.call(this, siteEnabled && overrideVolume !== null ? overrideVolume : val);
    },
    configurable: true,
    enumerable: true,
  });

  // --- PlaybackRate monkey-patch (respects enabled state and applyAll toggle) ---
  Object.defineProperty(HTMLMediaElement.prototype, "playbackRate", {
    get: function () {
      if (siteEnabled && overrideSpeed !== null && speedApplyAll) return overrideSpeed;
      return rateOrigGet.call(this);
    },
    set: function (val) {
      if (siteEnabled && overrideSpeed !== null && speedApplyAll) {
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
    if (!siteEnabled) return null;
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
    if (!siteEnabled) return;
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
    if (!siteEnabled) return;
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
    if (!siteEnabled) return;
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

  // --- Apply current overrides to a single media element ---
  function applyOverridesTo(el) {
    if (!siteEnabled || !el || (el.tagName !== "VIDEO" && el.tagName !== "AUDIO")) return;
    if (overrideVolume !== null) {
      volOrigSet.call(el, overrideVolume);
    }
    if (overrideSpeed !== null && speedApplyAll) {
      rateOrigSet.call(el, overrideSpeed);
    }
  }

  // --- Watch for dynamically-added media (e.g. "Show demo" buttons) ---
  function scanSubtree(node) {
    if (!siteEnabled || !node) return;
    if (node.nodeType !== 1) return; // Element nodes only
    if (node.tagName === "VIDEO" || node.tagName === "AUDIO") {
      applyOverridesTo(node);
    }
    if (node.querySelectorAll) {
      var nested = node.querySelectorAll("video, audio");
      for (var i = 0; i < nested.length; i++) {
        applyOverridesTo(nested[i]);
      }
    }
  }

  var mediaObserver = new MutationObserver(function (mutations) {
    if (!siteEnabled) return;
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        scanSubtree(added[j]);
      }
    }
  });

  function startObserving() {
    mediaObserver.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
    });
  }
  startObserving();

  // Safety net: catch media that finishes loading after insertion.
  // Some sites swap `src` on an existing element rather than insert a new one.
  document.addEventListener(
    "loadedmetadata",
    function (e) {
      applyOverridesTo(e.target);
    },
    true
  );
  document.addEventListener(
    "play",
    function (e) {
      applyOverridesTo(e.target);
    },
    true
  );

  // --- Receive from content script ---
  window.addEventListener("__vc_set_site_enabled", function (e) {
    var newEnabled = e.detail.enabled;
    if (siteEnabled === newEnabled) return; // No change
    
    siteEnabled = newEnabled;
    
    if (siteEnabled) {
      // Re-apply overrides when re-enabling
      if (overrideVolume !== null) {
        var volEls = document.querySelectorAll("video, audio");
        for (var i = 0; i < volEls.length; i++) {
          volOrigSet.call(volEls[i], overrideVolume);
        }
      }
      if (overrideSpeed !== null) {
        applySpeed(overrideSpeed);
      }
    } else {
      // When disabling, restore original values to all media elements
      var allMedia = document.querySelectorAll("video, audio");
      for (var j = 0; j < allMedia.length; j++) {
        var media = allMedia[j];
        // Restore volume to actual stored value
        var actualVolume = volOrigGet.call(media);
        volOrigSet.call(media, actualVolume);
        // Restore speed to 1
        rateOrigSet.call(media, 1);
      }
      // Hide any overlays
      if (speedOverlayEl) speedOverlayEl.style.opacity = "0";
      if (volumeOverlayEl) volumeOverlayEl.style.opacity = "0";
    }
  });

  window.addEventListener("__vc_set_volume", function (e) {
    if (!siteEnabled) return;
    overrideVolume = e.detail.volume;
    var els = document.querySelectorAll("video, audio");
    for (var i = 0; i < els.length; i++) {
      volOrigSet.call(els[i], overrideVolume);
    }
  });

  window.addEventListener("__vc_set_speed", function (e) {
    if (!siteEnabled) return;
    applySpeed(e.detail.speed);
  });

  window.addEventListener("__vc_set_speed_mode", function (e) {
    speedApplyAll = e.detail.applyAll;
    // Re-apply current speed with new mode
    if (siteEnabled && overrideSpeed !== null) {
      applySpeed(overrideSpeed);
    }
  });

  window.addEventListener("__vc_set_suppress_site_shortcuts", function (e) {
    suppressSiteShortcuts = e.detail.enabled;
  });

  // --- Keyboard shortcuts ---
  var HANDLED_KEYS = { d: 1, s: 1, e: 1, w: 1 };

  document.addEventListener("keydown", function (e) {
    // If disabled, don't handle any shortcuts
    if (!siteEnabled) return;
    
    var tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

    if (!HANDLED_KEYS[e.key]) return;

    var els = document.querySelectorAll("video, audio");
    if (!els.length) return;

    var isPlaying = false;
    for (var k = 0; k < els.length; k++) {
      if (!els[k].paused && !els[k].ended) {
        isPlaying = true;
        break;
      }
    }

    if (suppressSiteShortcuts && isPlaying) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }

    if (!isPlaying) return;

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
      overrideSpeed = newSpeed;
      applySpeed(overrideSpeed);
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
  }, true);
})();
