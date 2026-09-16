/**
 * Web Audio API synthesizer for WhatsApp incoming message notification sound.
 * Zero external audio files required — reliable, instant, and works offline.
 */
export function playNotificationSound(): void {
  try {
    if (typeof window === "undefined") return;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // ── Primary Tone (E6 - ~1318.5 Hz) ──
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(1318.5, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // ── Secondary Harmony Tone (B6 - ~1975.5 Hz) ──
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1975.5, now + 0.07);
    gain2.gain.setValueAtTime(0.3, now + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.07);
    osc2.stop(now + 0.38);
  } catch (err) {
    // Audio context may be restricted before first user interaction
    console.debug("Notification sound skipped or restricted:", err);
  }
}
