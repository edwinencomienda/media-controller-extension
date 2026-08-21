(function () {
  var siteEnabled = false; // Default: disabled until explicitly enabled
  var overrideVolume = null;
  var overrideSpeed = null;
  var speedApplyAll = true;
  var suppressSiteShortcuts = true;
  var youtubeAutoPip = false; // Default: off

  var MIN_SPEED = 0.25;
  var MAX_SPEED = 4;
  var SPEED_STEP = 0.25;

  var MIN_VOLUME = 0;
  var MAX_VOLUME = 1;
  var VOLUME_STEP = 0.05;

  var IS_YOUTUBE = /(^|\.)youtube\.com$/.test(window.location.hostname);

  function isYouTubeLiveVideo() {
    if (!IS_YOUTUBE) return false;
    var player = document.querySelector(".html5-video-player");
    if (player && player.classList.contains("ytp-live")) return true;
    return !!document.querySelector(".ytp-live-badge[disabled]");
  }

  // --- YouTube Auto Picture-in-Picture ---
  // Uses Chrome's automatic PiP media-session hook so PiP can open when
  // Chrome considers the playing YouTube video eligible.
  //
  // Lifecycle gotchas (YouTube-specific):
  // - Leaving PiP without restoring playback leaves the player stuck on
  //   "Playing in picture-in-picture" and breaks the next auto-enter.
  // - YouTube rewrites mediaSession often; we must re-claim the handler.

  var pipVideoEl = null;
  var weEnteredPip = false;
  var pipOpenMode = null; // "auto" or "manual"
  var autoPipReclaimTimer = null;
  var restoreAfterPipScheduled = false;
  var manualPipButtonEl = null;
  // true = playing, false = paused, null = not in a PiP session we track
  // Updated live while in PiP so pause in the PiP window is remembered.
  // Never force-play on return — only force-pause if this is false.
  var playbackStateInPip = null;
  var pipEnteredAt = 0;
  var PIP_EXIT_COOLDOWN_MS = 500;

  function getYouTubeVideo() {
    if (!IS_YOUTUBE) return null;
    // Prefer the main player video (not ads / related-video previews if possible)
    var main = document.querySelector(
      ".html5-video-player:not(.ad-showing) video.html5-main-video, " +
        ".html5-video-player:not(.ad-showing) video, " +
        "video.html5-main-video, video"
    );
    return main || null;
  }

  function getYouTubeVideos() {
    if (!IS_YOUTUBE) return [];
    return Array.prototype.slice.call(document.querySelectorAll("video"));
  }

  function canAutoPip() {
    return IS_YOUTUBE && youtubeAutoPip;
  }

  function setAutoPipVideoHint(video, enabled) {
    if (!video || video.tagName !== "VIDEO") return;
    try {
      if ("autoPictureInPicture" in video) video.autoPictureInPicture = enabled;
      if (enabled) {
        if ("disablePictureInPicture" in video) video.disablePictureInPicture = false;
        video.setAttribute("autopictureinpicture", "");
      } else {
        video.removeAttribute("autopictureinpicture");
      }
    } catch (e) {}
  }

  function syncAutoPipVideoHints() {
    if (!IS_YOUTUBE) return;
    var videos = getYouTubeVideos();
    for (var i = 0; i < videos.length; i++) {
      setAutoPipVideoHint(videos[i], canAutoPip());
    }
  }

  function forcePause(video) {
    if (!video || video.ended) return;
    try {
      if (!video.paused) video.pause();
    } catch (e) {}
  }

  function registerAutoPipHandler() {
    if (!IS_YOUTUBE || !("mediaSession" in navigator)) return;
    try {
      if (canAutoPip()) {
        syncAutoPipVideoHints();
        navigator.mediaSession.setActionHandler("enterpictureinpicture", function () {
          enterYouTubePip("auto");
        });
      } else {
        // Clear handler when disabled so Chrome won't auto-trigger for us
        navigator.mediaSession.setActionHandler("enterpictureinpicture", null);
      }
    } catch (e) {
      // Some browsers throw if the action isn't supported
    }
  }

  function startAutoPipReclaim() {
    stopAutoPipReclaim();
    if (!canAutoPip()) return;
    registerAutoPipHandler();
    ensureManualPipButton();
    // YouTube frequently overwrites mediaSession — re-claim periodically
    autoPipReclaimTimer = setInterval(function () {
      if (!canAutoPip()) {
        stopAutoPipReclaim();
        return;
      }
      syncAutoPipVideoHints();
      registerAutoPipHandler();
      ensureManualPipButton();
    }, 2000);
  }

  function stopAutoPipReclaim() {
    if (autoPipReclaimTimer) {
      clearInterval(autoPipReclaimTimer);
      autoPipReclaimTimer = null;
    }
  }

  function canExitPipNow() {
    // Ignore spurious focus/visibility blips right after we open PiP
    // (common when switching apps while video is already playing)
    return Date.now() - pipEnteredAt >= PIP_EXIT_COOLDOWN_MS;
  }

  function snapshotPipPlaybackState(video) {
    // Capture BEFORE exitPictureInPicture — Chrome/YouTube often resume on leave
    if (video && video.tagName === "VIDEO") {
      playbackStateInPip = !video.paused;
    }
  }

  function restoreAfterPip(videoHint) {
    if (restoreAfterPipScheduled) return;
    restoreAfterPipScheduled = true;

    var video =
      videoHint ||
      pipVideoEl ||
      document.pictureInPictureElement ||
      getYouTubeVideo();

    // Snapshot taken before exit (or live pause/play while in PiP)
    var shouldPlay = playbackStateInPip;

    weEnteredPip = false;
    pipVideoEl = null;
    pipOpenMode = null;
    playbackStateInPip = null;

    // Re-enable auto-enter for the next leave
    registerAutoPipHandler();
    setTimeout(registerAutoPipHandler, 100);
    setTimeout(registerAutoPipHandler, 500);
    setTimeout(registerAutoPipHandler, 1500);

    function finishRestore() {
      restoreAfterPipScheduled = false;
      if (!video) return;
      // Critical: NEVER force play on return (that was the unwanted autoplay).
      // If user had paused in PiP, force pause — browser often resumes on leave.
      if (shouldPlay === false) {
        forcePause(video);
        // YouTube sometimes resumes a beat later after leave
        setTimeout(function () {
          forcePause(video);
        }, 100);
        setTimeout(function () {
          forcePause(video);
        }, 300);
      }
      updateManualPipButton();
      registerAutoPipHandler();
    }

    setTimeout(finishRestore, 50);
  }

  function enterYouTubePip(mode) {
    if (!canAutoPip()) return;
    if (document.pictureInPictureElement) return;

    var isManual = mode === "manual";
    var video = getYouTubeVideo();
    // Auto-enter only while media is playing. Manual button clicks can open
    // PiP for paused, already-loaded videos because the click supplies gesture.
    if (!video || video.ended) return;
    if (!isManual && video.paused) return;
    if (typeof video.requestPictureInPicture !== "function") return;

    playbackStateInPip = !video.paused;
    weEnteredPip = true;
    pipVideoEl = video;
    pipOpenMode = mode || "auto";
    pipEnteredAt = Date.now();

    try {
      var p = video.requestPictureInPicture();
      if (p && typeof p.then === "function") {
        p.then(function () {
          // Do not force play here — video was already playing
          registerAutoPipHandler();
        }).catch(function () {
          weEnteredPip = false;
          pipVideoEl = null;
          pipOpenMode = null;
          playbackStateInPip = null;
          updateManualPipButton();
          registerAutoPipHandler();
        });
      }
    } catch (e) {
      weEnteredPip = false;
      pipVideoEl = null;
      pipOpenMode = null;
      playbackStateInPip = null;
      updateManualPipButton();
    }
  }

  function getPlayerContainer() {
    return document.querySelector(".html5-video-player");
  }

  // The button lives inside the player element (absolute, not fixed) so it
  // stays pinned to the video's top-right, scrolls with it, and never
  // overlaps the YouTube masthead or anything outside the player.
  function attachManualPipButton() {
    if (!manualPipButtonEl) return;
    var player = getPlayerContainer();
    if (!player) return;
    if (manualPipButtonEl.parentNode !== player) {
      player.appendChild(manualPipButtonEl);
    }
  }

  function ensureManualPipButton() {
    if (!IS_YOUTUBE) return;

    if (manualPipButtonEl) {
      attachManualPipButton();
      updateManualPipButton();
      return;
    }

    manualPipButtonEl = document.createElement("button");
    manualPipButtonEl.type = "button";
    manualPipButtonEl.className = "vc-manual-pip-button";
    manualPipButtonEl.title = "Open picture-in-picture";
    manualPipButtonEl.setAttribute("aria-label", "Open picture-in-picture");
    // Built with createElement — YouTube enforces Trusted Types via CSP,
    // so plain-string innerHTML assignment throws in the main world.
    var icon = document.createElement("span");
    icon.className = "vc-pip-icon";
    icon.setAttribute("aria-hidden", "true");
    var inset = document.createElement("span");
    icon.appendChild(inset);
    manualPipButtonEl.appendChild(icon);
    manualPipButtonEl.style.cssText =
      "position:absolute;top:12px;right:12px;width:38px;height:30px;" +
      "display:flex;align-items:center;justify-content:center;padding:0;" +
      "border:1px solid rgba(255,255,255,0.35);border-radius:6px;" +
      "background:rgba(8,8,10,0.78);color:#fff;z-index:500;" +
      "cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.28);" +
      "opacity:0.92;transition:opacity 0.15s ease,background 0.15s ease;" +
      "pointer-events:auto;";

    icon.style.cssText =
      "position:relative;display:block;width:20px;height:14px;" +
      "border:2px solid currentColor;border-radius:2px;box-sizing:border-box;";
    inset.style.cssText =
      "position:absolute;right:2px;bottom:2px;width:8px;height:5px;" +
      "border:2px solid currentColor;border-radius:1px;box-sizing:border-box;";

    manualPipButtonEl.addEventListener("mouseenter", function () {
      manualPipButtonEl.style.opacity = "1";
      manualPipButtonEl.style.background = "rgba(20,20,24,0.92)";
    });
    manualPipButtonEl.addEventListener("mouseleave", function () {
      manualPipButtonEl.style.opacity = "0.92";
      manualPipButtonEl.style.background = "rgba(8,8,10,0.78)";
    });
    manualPipButtonEl.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      enterYouTubePip("manual");
    });

    attachManualPipButton();
    updateManualPipButton();
  }

  function removeManualPipButton() {
    if (manualPipButtonEl && manualPipButtonEl.parentNode) {
      manualPipButtonEl.parentNode.removeChild(manualPipButtonEl);
    }
    manualPipButtonEl = null;
  }

  function updateManualPipButton() {
    if (!manualPipButtonEl) return;
    attachManualPipButton();

    var video = getYouTubeVideo();
    var shouldShow =
      canAutoPip() &&
      !!manualPipButtonEl.parentNode &&
      !!video &&
      !video.ended &&
      typeof video.requestPictureInPicture === "function" &&
      !document.pictureInPictureElement;

    manualPipButtonEl.style.display = shouldShow ? "flex" : "none";
  }

  function exitYouTubePip() {
    if (!canExitPipNow()) return;

    var pipEl = document.pictureInPictureElement;
    if (!pipEl) {
      // No PiP window — do not touch playback (avoids accidental autoplay)
      weEnteredPip = false;
      pipVideoEl = null;
      pipOpenMode = null;
      playbackStateInPip = null;
      registerAutoPipHandler();
      return;
    }

    if (!pipVideoEl) pipVideoEl = pipEl;
    // Must snapshot before exit — leave often reports playing even if user paused
    snapshotPipPlaybackState(pipEl);

    try {
      var p = document.exitPictureInPicture();
      if (p && typeof p.then === "function") {
        p.then(function () {
          restoreAfterPip(pipEl);
        }).catch(function () {
          restoreAfterPip(pipEl);
        });
      } else {
        restoreAfterPip(pipEl);
      }
    } catch (e) {
      restoreAfterPip(pipEl);
    }
  }

  // Track pause/play while the video is in PiP (user toggles in the PiP chrome)
  document.addEventListener(
    "pause",
    function (e) {
      if (!e.target || e.target.tagName !== "VIDEO") return;
      if (document.pictureInPictureElement !== e.target) return;
      playbackStateInPip = false;
    },
    true
  );
  document.addEventListener(
    "play",
    function (e) {
      if (!e.target || e.target.tagName !== "VIDEO") return;
      if (document.pictureInPictureElement !== e.target) return;
      playbackStateInPip = true;
    },
    true
  );

  // Tab leave / return (Chrome reliably fires mediaSession on tab switch)
  document.addEventListener("visibilitychange", function () {
    if (!canAutoPip()) return;
    if (document.visibilityState === "visible") {
      // Slight delay so Chrome finishes focus/visibility transitions
      setTimeout(function () {
        if (document.visibilityState !== "visible" || !canAutoPip()) return;
        if (!document.hasFocus()) return;
        if (!canExitPipNow()) return;
        if (pipOpenMode === "manual") return;
        exitYouTubePip();
      }, 80);
    } else if (document.visibilityState === "hidden") {
      // Tab leave — re-claim handler, then best-effort enter (Chrome usually
      // also invokes enterpictureinpicture via mediaSession for tab switches)
      registerAutoPipHandler();
      setTimeout(function () {
        if (!canAutoPip() || document.visibilityState !== "hidden") return;
        enterYouTubePip("auto");
      }, 50);
    }
  });

  // Always restore when PiP actually ends (user close, our exit, or browser)
  document.addEventListener(
    "leavepictureinpicture",
    function (e) {
      if (!IS_YOUTUBE) return;
      // Prefer state we already snapped (before exit). Only fill if still unknown.
      // Do NOT trust e.target.paused after leave — browser often auto-resumes.
      if (playbackStateInPip === null && e.target && e.target.tagName === "VIDEO") {
        // Fallback only if we never tracked (e.g. user opened PiP manually)
        playbackStateInPip = !e.target.paused;
      }
      restoreAfterPip(e.target);
      updateManualPipButton();
    },
    true
  );

  document.addEventListener(
    "enterpictureinpicture",
    function (e) {
      if (!IS_YOUTUBE) return;
      pipVideoEl = e.target;
      weEnteredPip = true;
      if (!pipOpenMode) pipOpenMode = "auto";
      pipEnteredAt = Date.now();
      // If we didn't start this enter, seed state from element once
      if (playbackStateInPip === null && e.target && e.target.tagName === "VIDEO") {
        playbackStateInPip = !e.target.paused;
      }
      // Do not force play/pause on enter
      updateManualPipButton();
      registerAutoPipHandler();
    },
    true
  );

  // Re-register after YouTube SPA navigations (player may reset mediaSession)
  document.addEventListener("yt-navigate-finish", function () {
    if (!canAutoPip()) return;
    // Small delay so YouTube finishes wiring its own media session
    setTimeout(function () {
      registerAutoPipHandler();
      startAutoPipReclaim();
      ensureManualPipButton();
    }, 300);
  });

  // YouTube often rewrites mediaSession on play — re-claim the auto-PiP handler
  document.addEventListener(
    "play",
    function (e) {
      if (!canAutoPip()) return;
      if (!e.target || e.target.tagName !== "VIDEO") return;
      setAutoPipVideoHint(e.target, true);
      ensureManualPipButton();
      setTimeout(registerAutoPipHandler, 50);
    },
    true
  );

  function shouldApplySpeedOverride() {
    return siteEnabled && overrideSpeed !== null && speedApplyAll && !isYouTubeLiveVideo();
  }

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
      if (shouldApplySpeedOverride()) return overrideSpeed;
      return rateOrigGet.call(this);
    },
    set: function (val) {
      if (shouldApplySpeedOverride()) {
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
    if (isYouTubeLiveVideo()) return;
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
    if (overrideSpeed !== null && speedApplyAll && !isYouTubeLiveVideo()) {
      rateOrigSet.call(el, overrideSpeed);
    }
  }

  // --- Watch for dynamically-added media (e.g. "Show demo" buttons) ---
  function scanSubtree(node) {
    if (!node) return;
    if (node.nodeType !== 1) return; // Element nodes only
    if (canAutoPip()) ensureManualPipButton();
    if (!siteEnabled) return;
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
      if (canAutoPip()) {
        setAutoPipVideoHint(e.target, true);
        ensureManualPipButton();
      }
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

  window.addEventListener("__vc_set_youtube_auto_pip", function (e) {
    youtubeAutoPip = e.detail.enabled === true;
    syncAutoPipVideoHints();
    if (youtubeAutoPip) {
      startAutoPipReclaim();
      ensureManualPipButton();
    } else {
      stopAutoPipReclaim();
      removeManualPipButton();
      registerAutoPipHandler(); // clears handler
    }
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

  function requestCurrentSettings() {
    window.dispatchEvent(new CustomEvent("__vc_request_settings"));
  }

  requestCurrentSettings();
  setTimeout(requestCurrentSettings, 250);
  setTimeout(requestCurrentSettings, 1000);
})();
