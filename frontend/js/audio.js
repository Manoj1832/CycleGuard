/**
 * CycleGuard Frontend — Audio Alarm Synthesizer
 *
 * Uses the Web Audio API to synthesize a loud siren/alarm sound and chirps.
 * Zero audio files required; zero latency across all browsers.
 */

let audioCtx = null;
let isAlarmPlaying = false;
let alarmOscillator = null;
let alarmGain = null;
let lfoOscillator = null;

/**
 * Ensure AudioContext is created and resumed on user interaction.
 */
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

/**
 * Synthesizes and plays the siren oscillator audio graph.
 */
function _playSiren(ctx) {
  if (!isAlarmPlaying) return;

  try {
    // Clean up any stale nodes
    if (alarmOscillator) {
      try { alarmOscillator.stop(); alarmOscillator.disconnect(); } catch (_) {}
      alarmOscillator = null;
    }
    if (lfoOscillator) {
      try { lfoOscillator.stop(); lfoOscillator.disconnect(); } catch (_) {}
      lfoOscillator = null;
    }

    // Carrier Oscillator (produces the siren pitch)
    alarmOscillator = ctx.createOscillator();
    alarmOscillator.type = 'sawtooth';
    alarmOscillator.frequency.value = 1000; // Base frequency 1000 Hz

    // Low Frequency Oscillator (LFO) for siren wail frequency modulation
    lfoOscillator = ctx.createOscillator();
    lfoOscillator.type = 'sine';
    lfoOscillator.frequency.value = 3.5; // 3.5 Hz wail modulation rate

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 450; // Pitch modulates between 550 Hz and 1450 Hz

    lfoOscillator.connect(lfoGain);
    lfoGain.connect(alarmOscillator.frequency);

    // Master volume gain node
    alarmGain = ctx.createGain();
    alarmGain.gain.setValueAtTime(0.01, ctx.currentTime);
    alarmGain.gain.exponentialRampToValueAtTime(0.7, ctx.currentTime + 0.1);

    alarmOscillator.connect(alarmGain);
    alarmGain.connect(ctx.destination);

    alarmOscillator.start();
    lfoOscillator.start();
    console.log('[Audio] Alarm siren started.');
  } catch (err) {
    console.warn('[Audio] Failed to synthesize alarm:', err);
  }
}

/**
 * Start the alarm siren.
 */
export function startAlarm() {
  if (isAlarmPlaying) return;
  isAlarmPlaying = true;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().then(() => {
      if (isAlarmPlaying) _playSiren(ctx);
    }).catch((err) => {
      console.warn('[Audio] Autoplay blocked by browser. Click anywhere to activate audio.', err);
    });
  } else {
    _playSiren(ctx);
  }
}

/**
 * Stop the alarm siren.
 */
export function stopAlarm() {
  if (!isAlarmPlaying) return;
  isAlarmPlaying = false;

  if (alarmGain && audioCtx) {
    try {
      alarmGain.gain.setValueAtTime(alarmGain.gain.value, audioCtx.currentTime);
      alarmGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
      setTimeout(() => {
        if (alarmOscillator) {
          try { alarmOscillator.stop(); alarmOscillator.disconnect(); } catch (_) {}
          alarmOscillator = null;
        }
        if (lfoOscillator) {
          try { lfoOscillator.stop(); lfoOscillator.disconnect(); } catch (_) {}
          lfoOscillator = null;
        }
        console.log('[Audio] Alarm siren stopped.');
      }, 130);
    } catch (_) {
      alarmOscillator = null;
      lfoOscillator = null;
    }
  } else {
    alarmOscillator = null;
    lfoOscillator = null;
  }
}

/**
 * Play a short confirmation beep (e.g. on ARM/DISARM).
 * @param {'ARM' | 'DISARM' | 'BEEP'} type
 */
export function playChirp(type = 'BEEP') {
  const ctx = getAudioContext();
  if (!ctx || ctx.state === 'suspended') return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    if (type === 'ARM') {
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
    } else if (type === 'DISARM') {
      osc.frequency.setValueAtTime(1760, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    } else {
      osc.frequency.setValueAtTime(1200, now);
    }

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  } catch (_) {}
}

/**
 * Unlock AudioContext on first user interaction anywhere on the document.
 */
export function initAudioUnlock() {
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        console.log('[Audio] AudioContext unlocked.');
        if (isAlarmPlaying && !alarmOscillator) {
          _playSiren(ctx);
        }
      });
    }
  };

  ['click', 'touchstart', 'keydown'].forEach((evt) => {
    document.addEventListener(evt, unlock, { passive: true });
  });
}
