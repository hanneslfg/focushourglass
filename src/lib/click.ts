/**
 * Synthesizes a subtle mechanical click/tick with Web Audio API.
 * Short bandpass-filtered noise burst — quiet and satisfying.
 */
import { getSettings } from "./settings";

export function playClick() {
  if (typeof window === "undefined") return;
  if (!getSettings().soundsEnabled) return;
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;

  const ctx = new AC();
  const now = ctx.currentTime;

  // Very short buffer of noise (2ms)
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(sampleRate * 0.002), sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  // Bandpass around 3.5kHz for that crisp tick character
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 3500;
  filter.Q.value = 1.8;

  // Ultra-fast envelope for a sharp click
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.09, now + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.05);

  window.setTimeout(() => ctx.close().catch(() => {}), 150);
}
