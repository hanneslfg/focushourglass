/**
 * Synthesizes a soft temple-gong tone with Web Audio — no network call needed.
 * Layered low sine partials with a long exponential decay through a low-pass.
 */
export function playGong() {
  if (typeof window === "undefined") return;
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return;

  const ctx = new AC();
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.value = 0.45;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2400, now);
  filter.frequency.exponentialRampToValueAtTime(500, now + 3.5);
  filter.Q.value = 0.8;

  master.connect(filter).connect(ctx.destination);

  // Fundamental + inharmonic partials for a metallic bell-like timbre.
  const partials: Array<{ f: number; gain: number; decay: number }> = [
    { f: 55, gain: 0.55, decay: 4.0 },
    { f: 110, gain: 0.35, decay: 3.4 },
    { f: 164, gain: 0.18, decay: 2.6 },
    { f: 220, gain: 0.12, decay: 2.0 },
    { f: 277, gain: 0.08, decay: 1.6 },
    { f: 415, gain: 0.05, decay: 1.0 },
  ];

  partials.forEach((p) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = p.f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(p.gain, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + p.decay + 0.1);
  });

  // Brief soft mallet thump at the strike.
  const thump = ctx.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(80, now);
  thump.frequency.exponentialRampToValueAtTime(35, now + 0.25);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.4, now);
  tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  thump.connect(tg).connect(master);
  thump.start(now);
  thump.stop(now + 0.32);

  window.setTimeout(() => ctx.close().catch(() => {}), 4500);
}
