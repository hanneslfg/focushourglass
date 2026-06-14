/**
 * Synthesizes a deep temple-gong tone with Web Audio — no network call needed.
 * Layered low sine partials with a very long exponential decay through a low-pass.
 */
import { getSettings } from "./settings";

export function playGong() {
  if (typeof window === "undefined") return;
  if (!getSettings().soundsEnabled) return;
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return;

  const ctx = new AC();
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.value = 0.85;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1800, now);
  filter.frequency.exponentialRampToValueAtTime(300, now + 8);
  filter.Q.value = 1.2;

  master.connect(filter).connect(ctx.destination);

  // Fundamental + inharmonic partials — longer decays for a lingering gong.
  const partials: Array<{ f: number; gain: number; decay: number }> = [
    { f: 55, gain: 0.7, decay: 9.0 },
    { f: 110, gain: 0.45, decay: 7.5 },
    { f: 164, gain: 0.28, decay: 6.0 },
    { f: 220, gain: 0.2, decay: 5.0 },
    { f: 277, gain: 0.14, decay: 4.0 },
    { f: 415, gain: 0.09, decay: 3.2 },
    { f: 550, gain: 0.05, decay: 2.5 },
  ];

  partials.forEach((p) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = p.f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(p.gain, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + p.decay + 0.2);
  });

  // Stronger mallet thump at the strike.
  const thump = ctx.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(70, now);
  thump.frequency.exponentialRampToValueAtTime(28, now + 0.35);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.7, now);
  tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  thump.connect(tg).connect(master);
  thump.start(now);
  thump.stop(now + 0.5);

  window.setTimeout(() => ctx.close().catch(() => {}), 10500);
}
