/**
 * Looping incoming-call ringtone (Web Audio) + vibration on mobile.
 * Browsers block audio before the first user gesture; we retry each loop so
 * the ring starts as soon as the page is allowed to play sound.
 */

let ctx: AudioContext | null = null;
let ringInterval: ReturnType<typeof setInterval> | null = null;

function playRingBurst(audio: AudioContext) {
  // Classic two-tone ring: two short dual-frequency bursts
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

export function startRingtone() {
  stopRingtone();

  const tick = () => {
    try {
      if (!ctx) ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        // Autoplay-blocked until a user gesture; keep trying each loop
        ctx.resume().catch(() => {});
      }
      if (ctx.state === 'running') {
        playRingBurst(ctx);
      }
    } catch {
      // Audio not available
    }
    try {
      navigator.vibrate?.([400, 250, 400]);
    } catch {
      // Vibration not available
    }
  };

  tick();
  ringInterval = setInterval(tick, 2000);
}

export function stopRingtone() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  try {
    navigator.vibrate?.(0);
  } catch {
    // ignore
  }
}
