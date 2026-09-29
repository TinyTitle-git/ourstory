/* Actual uploaded music assets. Keep these paths when replacing the files. */
const AUDIO_LIBRARY = {
  opening: { source: "audio/AUDIO_LIBRARY_01.mp3", volume: 0.22 },
  emotional: { source: "audio/PUN DAY ONE.mp3", volume: 0.20, cueStart: 22 },
};
const FIRST_MESSAGE_TIMING = {
  indicatorMs: 15000,
  openingFadeSeconds: 3.5,
  punFadeSeconds: 1.25,
};

window.AudioSystem = (() => {
  let started = false;
  let muted = false;
  let currentScene = 0;
  let punStarted = false;
  let punPlaying = false;
  let punStartPending = false;
  let punCrossfading = false;
  let musicEnding = false;
  let sfxContext;
  let openingBuffer;
  let openingBufferPromise;
  let openingMasterGain;
  let activeOpening;
  let openingStarted = false;
  let openingStartPending = false;
  let openingPlaying = false;
  let openingFadeTimer;
  let openingFadeOutTimer;
  let openingTypingReadyTimer;
  let openingTimelineStarted = false;
  let openingTimelineCompleted = false;
  let firstMessageReadyCallback;
  let punBuffer;
  let punBufferPromise;
  let punMasterGain;
  let activePun;
  let suspendedPunOffset = 0;
  let punLoopTimer;
  let punPauseTimer;
  const punInstances = new Set();

  function reportPunPlaybackError(phase, error) {
    // PUN errors remain visible for iPhone Safari QA; never silently swallow them.
    console.error(`PUN DAY ONE ${phase} failed.`, error);
  }

  function getSfxContext() {
    if (!sfxContext) sfxContext = new (window.AudioContext || window.webkitAudioContext)();
    return sfxContext;
  }

  function getOpeningMasterGain() {
    const ctx = getSfxContext();
    if (!openingMasterGain) {
      openingMasterGain = ctx.createGain();
      openingMasterGain.gain.value = 0;
      openingMasterGain.connect(ctx.destination);
    }
    return openingMasterGain;
  }

  function prepareOpeningBuffer() {
    if (openingBuffer) return Promise.resolve(openingBuffer);
    if (!openingBufferPromise) {
      const ctx = getSfxContext();
      openingBufferPromise = fetch(AUDIO_LIBRARY.opening.source)
        .then((response) => {
          if (!response.ok) throw new Error(`Opening music request returned ${response.status}.`);
          return response.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data.slice(0)))
        .then((buffer) => {
          openingBuffer = buffer;
          return buffer;
        })
        .catch((error) => {
          openingBufferPromise = undefined;
          console.error("Opening music preparation failed.", error);
          throw error;
        });
    }
    return openingBufferPromise;
  }

  function getPunMasterGain() {
    const ctx = getSfxContext();
    if (!punMasterGain) {
      punMasterGain = ctx.createGain();
      punMasterGain.gain.value = 0;
      punMasterGain.connect(ctx.destination);
    }
    return punMasterGain;
  }

  function preparePunBuffer() {
    if (punBuffer) return Promise.resolve(punBuffer);
    if (!punBufferPromise) {
      const ctx = getSfxContext();
      punBufferPromise = fetch(AUDIO_LIBRARY.emotional.source)
        .then((response) => {
          if (!response.ok) throw new Error(`PUN DAY ONE request returned ${response.status}.`);
          return response.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data.slice(0)))
        .then((buffer) => {
          punBuffer = buffer;
          return buffer;
        })
        .catch((error) => {
          punBufferPromise = undefined;
          reportPunPlaybackError("decode", error);
          throw error;
        });
    }
    return punBufferPromise;
  }

  function stopActiveOpeningSource() {
    const instance = activeOpening;
    activeOpening = undefined;
    openingPlaying = false;
    if (!instance) return;
    instance.source.onended = null;
    try { instance.source.stop(); } catch (error) {
      if (error.name !== "InvalidStateError") console.error("Opening music stop failed.", error);
    }
    try { instance.source.disconnect(); } catch (error) {
      console.error("Opening music cleanup failed.", error);
    }
  }

  function clearOpeningTimeline() {
    clearTimeout(openingFadeOutTimer);
    clearTimeout(openingTypingReadyTimer);
    openingFadeOutTimer = undefined;
    openingTypingReadyTimer = undefined;
    firstMessageReadyCallback = undefined;
  }

  function fadeOpening(target, seconds, stopWhenDone = false) {
    if (!openingMasterGain) return;
    clearInterval(openingFadeTimer);
    const gain = openingMasterGain.gain;
    const original = gain.value;
    const began = performance.now();
    openingFadeTimer = setInterval(() => {
      const progress = Math.min((performance.now() - began) / (seconds * 1000), 1);
      gain.value = muted ? 0 : original + (target - original) * progress;
      if (progress === 1) {
        clearInterval(openingFadeTimer);
        openingFadeTimer = undefined;
        if (stopWhenDone) stopActiveOpeningSource();
      }
    }, 25);
  }

  function startOpeningTimeline() {
    if (openingTimelineStarted) return;
    openingTimelineStarted = true;
    openingFadeOutTimer = setTimeout(() => {
      fadeOpening(0, FIRST_MESSAGE_TIMING.openingFadeSeconds, true);
      openingTypingReadyTimer = setTimeout(() => {
        openingTimelineCompleted = true;
        const onReady = firstMessageReadyCallback;
        firstMessageReadyCallback = undefined;
        onReady?.();
      }, FIRST_MESSAGE_TIMING.openingFadeSeconds * 1000);
    }, FIRST_MESSAGE_TIMING.indicatorMs);
  }

  function currentPunOffset() {
    if (!activePun || !punPlaying) return suspendedPunOffset;
    return Math.min(
      activePun.offset + Math.max(0, getSfxContext().currentTime - activePun.startedAt),
      punBuffer?.duration ?? activePun.offset,
    );
  }

  function clearPunTimers() {
    clearTimeout(punLoopTimer);
    clearTimeout(punPauseTimer);
    punLoopTimer = undefined;
    punPauseTimer = undefined;
  }

  function stopPunInstances() {
    punInstances.forEach((instance) => {
      try { instance.source.stop(); } catch (error) {
        if (error.name !== "InvalidStateError") reportPunPlaybackError("stop", error);
      }
      instance.source.disconnect();
      instance.gain.disconnect();
    });
    punInstances.clear();
  }

  function pausePunNow() {
    if (!punPlaying) return;
    suspendedPunOffset = currentPunOffset();
    clearPunTimers();
    stopPunInstances();
    activePun = undefined;
    punPlaying = false;
    punCrossfading = false;
  }

  function fadePun(target, seconds, pauseWhenDone = false) {
    if (!punMasterGain) return;
    clearTimeout(punPauseTimer);
    const gain = punMasterGain.gain;
    const ctx = getSfxContext();
    const now = ctx.currentTime;
    const output = muted ? 0 : target;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(output, now + seconds);
    if (pauseWhenDone) {
      punPauseTimer = setTimeout(() => pausePunNow(), seconds * 1000);
    }
  }

  function createPunInstance(offset, sourceGain = 1) {
    const ctx = getSfxContext();
    if (!punBuffer) throw new Error("PUN DAY ONE buffer is not ready.");
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = punBuffer;
    gain.gain.value = sourceGain;
    source.connect(gain).connect(getPunMasterGain());
    const instance = { source, gain, offset, startedAt: ctx.currentTime };
    punInstances.add(instance);
    source.onended = () => {
      punInstances.delete(instance);
      try { source.disconnect(); gain.disconnect(); } catch (error) {
        reportPunPlaybackError("source cleanup", error);
      }
    };
    source.start(0, offset);
    return instance;
  }

  function schedulePunLoop() {
    clearTimeout(punLoopTimer);
    if (!punPlaying || !activePun || musicEnding || currentScene >= 17 || punCrossfading) return;
    const remaining = punBuffer.duration - currentPunOffset();
    const delay = Math.max(0, (remaining - 2.5) * 1000);
    punLoopTimer = setTimeout(beginPunLoopCrossfade, delay);
  }

  function beginPunLoopCrossfade() {
    if (!punPlaying || !activePun || musicEnding || currentScene >= 17 || punCrossfading) return;
    punCrossfading = true;
    const outgoing = activePun;
    const incoming = createPunInstance(0, 0);
    const ctx = getSfxContext();
    const now = ctx.currentTime;
    incoming.gain.gain.linearRampToValueAtTime(1, now + 2.4);
    outgoing.gain.gain.cancelScheduledValues(now);
    outgoing.gain.gain.setValueAtTime(outgoing.gain.gain.value, now);
    outgoing.gain.gain.linearRampToValueAtTime(0, now + 2.4);
    setTimeout(() => {
      try { outgoing.source.stop(); } catch (error) {
        if (error.name !== "InvalidStateError") reportPunPlaybackError("loop handoff", error);
      }
      activePun = incoming;
      punCrossfading = false;
      schedulePunLoop();
    }, 2450);
  }

  function startPunAtOffset(offset, fadeSeconds, targetVolume) {
    if (punStartPending) return;
    punStartPending = true;
    const begin = async () => {
      const ctx = getSfxContext();
      if (ctx.state !== "running") {
        try {
          await ctx.resume();
        } catch (error) {
          punStartPending = false;
          reportPunPlaybackError("AudioContext resume", error);
          return;
        }
      }
      if (ctx.state !== "running") {
        punStartPending = false;
        reportPunPlaybackError("AudioContext resume", new Error(`AudioContext remained ${ctx.state}.`));
        return;
      }
      punStartPending = false;
      musicEnding = false;
      clearPunTimers();
      stopPunInstances();
      const safeOffset = Math.min(Math.max(offset, 0), Math.max(0, punBuffer.duration - .01));
      activePun = createPunInstance(safeOffset);
      suspendedPunOffset = safeOffset;
      punPlaying = true;
      punStarted = true;
      fadePun(targetVolume, fadeSeconds);
      schedulePunLoop();
    };
    preparePunBuffer().then(begin).catch((error) => {
      punStartPending = false;
      reportPunPlaybackError("start", error);
    });
  }

  function fadeAllOut(seconds, pause = true) {
    if (pause) clearOpeningTimeline();
    fadeOpening(0, seconds, pause);
    fadePun(0, seconds, pause);
  }

  function playOpening() {
    if (openingStarted || openingStartPending) return;
    openingStartPending = true;
    const begin = () => {
      openingStartPending = false;
      if (openingStarted || !openingBuffer) return;
      const ctx = getSfxContext();
      const source = ctx.createBufferSource();
      source.buffer = openingBuffer;
      source.connect(getOpeningMasterGain());
      const instance = { source };
      activeOpening = instance;
      openingStarted = true;
      openingPlaying = true;
      source.onended = () => {
        if (activeOpening === instance) {
          activeOpening = undefined;
          openingPlaying = false;
        }
        try { source.disconnect(); } catch (error) {
          console.error("Opening music source cleanup failed.", error);
        }
      };
      source.start();
      fadeOpening(AUDIO_LIBRARY.opening.volume, 2.8);
      startOpeningTimeline();
    };
    if (openingBuffer) {
      begin();
      return;
    }
    prepareOpeningBuffer().then(begin).catch((error) => {
      openingStartPending = false;
      console.error("Opening music could not start.", error);
    });
  }

  function startPunAtCue() {
    fadeOpening(0, 1.2, true);
    startPunAtOffset(AUDIO_LIBRARY.emotional.cueStart, FIRST_MESSAGE_TIMING.punFadeSeconds, AUDIO_LIBRARY.emotional.volume);
  }

  function setScene(scene) {
    if (!started || scene === currentScene) return;
    currentScene = scene;
    if (scene === 11) return;
    if (scene === 12 || scene === 13) return fadeAllOut(.15, true);
    if (scene === 17) {
      musicEnding = true;
      return fadeAllOut(6, true);
    }
    if (scene >= 14 && punStarted && !punPlaying && !punStartPending) {
      return startPunAtOffset(suspendedPunOffset, 3.5, scene >= 16 ? .065 : .16);
    }
    if (scene === 16 && punPlaying) fadePun(.065, 1.5);
  }

  function start() {
    started = true;
    const ctx = getSfxContext();
    if (ctx.state === "suspended") ctx.resume().catch((error) => console.error("AudioContext resume failed.", error));
    // This user-gesture path unlocks only the AudioContext; PUN itself is never played here.
    preparePunBuffer().catch((error) => reportPunPlaybackError("initial preparation", error));
    playOpening();
  }

  function beginFirstMessage(onReady) {
    if (!started || punStarted) return;
    [3800, 8300, 13200].forEach((delay, index) => setTimeout(() => {
      if (!punStarted) playTone(680 + index * 45, .05, .015);
    }, delay));
    firstMessageReadyCallback = onReady;
    if (openingTimelineCompleted) {
      firstMessageReadyCallback = undefined;
      onReady?.();
    }
  }

  function playTone(frequency, duration, volume, delay = 0) {
    if (!started || muted) return;
    const ctx = getSfxContext();
    if (ctx.state === "suspended") ctx.resume().catch((error) => console.error("AudioContext resume failed.", error));
    const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); const at = ctx.currentTime + delay;
    oscillator.type = "sine"; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain).connect(ctx.destination); oscillator.start(at); oscillator.stop(at + duration + .04);
  }

  function type(index = 0) { playTone(760 + (index % 3) * 55, .045, .08); }
  function sparkle() { playTone(783.99, .2, .02); playTone(1174.66, .3, .015, .08); }
  function countdownStart() { fadeAllOut(.15, true); }
  function countdownTick(value) { const intensity = (11 - value) / 10; playTone(58 + intensity * 25, .18 + intensity * .11, .18 + intensity * .05); }
  function silence() { fadeAllOut(.08, true); }
  function completeFakeEnding() { musicEnding = true; fadeAllOut(6, true); }
  function finish() { musicEnding = true; fadeAllOut(6, true); }
  function stopForVideo() {
    clearOpeningTimeline();
    clearInterval(openingFadeTimer);
    openingFadeTimer = undefined;
    if (openingMasterGain) openingMasterGain.gain.value = 0;
    stopActiveOpeningSource();
    if (punMasterGain) {
      punMasterGain.gain.cancelScheduledValues(getSfxContext().currentTime);
      punMasterGain.gain.value = 0;
    }
    pausePunNow();
  }
  function resumeAfterVideo() {
    if (!punStarted) return;
    musicEnding = false;
    startPunAtOffset(suspendedPunOffset, 3.5, AUDIO_LIBRARY.emotional.volume);
  }
  function duckForLetter() { if (punStarted && punPlaying) fadePun(.105, .6); }
  function restoreAfterLetter() { if (punStarted && punPlaying) fadePun(AUDIO_LIBRARY.emotional.volume, 1.2); }
  function toggle() {
    muted = !muted;
    if (openingMasterGain) openingMasterGain.gain.value = muted ? 0 : AUDIO_LIBRARY.opening.volume;
    if (punMasterGain) {
      const gain = punMasterGain.gain;
      gain.cancelScheduledValues(getSfxContext().currentTime);
      gain.value = muted ? 0 : AUDIO_LIBRARY.emotional.volume;
    }
    return muted;
  }

  // Begin the Opening fetch/decode during page load; it never produces sound.
  const openingReady = prepareOpeningBuffer();

  return { start, setScene, beginFirstMessage, startPunAtCue, type, sparkle, countdownStart, countdownTick, silence, completeFakeEnding, finish, stopForVideo, resumeAfterVideo, duckForLetter, restoreAfterLetter, toggle, whenOpeningReady: () => openingReady };
})();
