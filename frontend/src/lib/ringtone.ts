/**
 * Looping incoming-call ringtone (Web Audio) + vibration on mobile.
 *
 * Both audio and vibration require a prior user gesture in modern Chrome
 * (see https://www.chromestatus.com/feature/5644273861001216). We unlock on
 * the first tap anywhere in the app, then ring/vibrate on incoming calls.
 */

let ctx: AudioContext | null = null;
let ringInterval: ReturnType<typeof setInterval> | null = null;
let userGestureUnlocked = false;
let unlockListenerAttached = false;

function attachGestureUnlock() {
  if (unlockListenerAttached || typeof window === 'undefined') return;
  unlockListenerAttached = true;

  const unlock = () => {
    userGestureUnlocked = true;
    if (ctx?.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };

  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
}

/** Call once at app boot so the first dashboard tap unlocks ring + vibrate. */
export function initRingtoneUnlock() {
  attachGestureUnlock();
}

function playRingBurst(audio: AudioContext) {
  const now = audio.currentTime;
  for (const offset of [0, 0.6]) {
    for (const freq of [440, 480]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.linearRampToValueAtTime(0.12, now + offset + 0.03);
      gain.gain.setValueAtTime(0.12, now + offset + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.45);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.5);
    }
  }
}

function tryVibrate() {
  if (!userGestureUnlocked || !navigator.vibrate) return;
  try {
    navigator.vibrate([400, 250, 400]);
  } catch {
    // Vibration not available on this device
  }
}

export function startRingtone() {
  stopRingtone();
  attachGestureUnlock();

  const tick = () => {
    try {
      if (!ctx) ctx = new AudioContext();
      if (ctx.state === 'suspended' && userGestureUnlocked) {
        ctx.resume().catch(() => {});
      }
      if (ctx.state === 'running') {
        playRingBurst(ctx);
      }
    } catch {
      // Audio not available
    }
    tryVibrate();
  };

  tick();
  ringInterval = setInterval(tick, 2000);
}

export function stopRingtone() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  if (userGestureUnlocked && navigator.vibrate) {
    try {
      navigator.vibrate(0);
    } catch {
      // ignore
    }
  }
}
