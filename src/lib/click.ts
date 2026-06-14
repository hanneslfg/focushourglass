/**
 * Crisp mechanical "tick" synthesized with the Web Audio API.
 *
 * Designed to mimic a premium watch wheel turning: a very short combination
 * of a high-frequency oscillator (the metallic ring) and a noise burst
 * (the mechanical impact), shaped by a sharp exponential decay envelope.
 *
 * The AudioContext is created lazily and resumed synchronously from inside
 * the user-gesture handler (button click) so browser autoplay policies
 * don't suppress it.
 */
import { getSettings } from "./settings";

type AnyWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const w = window as AnyWindow;
  const AC = window.AudioContext || w.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch (error) {
    console.error("Audio Playback Error:", error);
    return null;
  }
  return ctx;
}

export function playClick() {
  if (typeof window === "undefined") return;
  if (!getSettings().soundsEnabled) return;

  try {
    const audio = getCtx();
    if (!audio) return;

    // Resume synchronously inside the user gesture if needed.
    if (audio.state === "suspended") {
      void audio.resume();
    }

    const now = audio.currentTime;
    const master = audio.createGain();
    master.gain.value = 0.7;
    master.connect(audio.destination);

    // 1) Wooden/mechanical body — low oscillator thump with sharp decay.
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.04);

    const oscGain = audio.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.45, now + 0.001);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(oscGain).connect(master);
    osc.start(now);
    osc.stop(now + 0.08);

    // 2) Mechanical impact — short lowpassed noise burst (the "tock").
    const bufferLen = Math.max(1, Math.floor(audio.sampleRate * 0.006));
    const buffer = audio.createBuffer(1, bufferLen, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferLen; i++) data[i] = Math.random() * 2 - 1;

    const noise = audio.createBufferSource();
    noise.buffer = buffer;

    const bp = audio.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 1.2;

    const noiseGain = audio.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.3, now + 0.0008);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    noise.connect(bp).connect(noiseGain).connect(master);
    noise.start(now);
    noise.stop(now + 0.06);
  } catch (error) {
    console.error("Audio Playback Error:", error);
  }
}
