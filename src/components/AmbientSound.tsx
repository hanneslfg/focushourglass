/**
 * Ambient Sound Player
 *
 * Tiny, minimalist control that plays a looping background sound while the
 * focus timer is running. Sound files are stored in the Supabase Storage
 * bucket `focus-sounds` (public). The list is populated dynamically —
 * upload new .mp3 / .ogg / .m4a files via the Supabase dashboard and they'll
 * appear here automatically on next load.
 *
 * Playback rules:
 *   - phase === "running" & a sound selected → play (loop)
 *   - anything else                          → pause
 *
 * Persistence: chosen sound + volume + mute state in localStorage.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX, Music2, ChevronDown } from "lucide-react";
import { publicSupabase } from "@/lib/supabase";
import { safeStorage } from "@/lib/safeStorage";
import { playClick } from "@/lib/click";

const BUCKET = "focus-sounds";
const LS_SOUND = "hourglass.ambient.sound.v1";
const LS_VOL = "hourglass.ambient.volume.v1";
const LS_MUTED = "hourglass.ambient.muted.v1";

type Sound = { name: string; title: string; url: string };

function titleize(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AmbientSound({ running }: { running: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(0.5);
  const [muted, setMuted] = useState<boolean>(false);
  const [open, setOpen] = useState(false);

  // Hydrate client-only prefs after mount to avoid SSR mismatch.
  useEffect(() => {
    setSelected(safeStorage.getItem(LS_SOUND) || null);
    const v = Number(safeStorage.getItem(LS_VOL));
    if (Number.isFinite(v) && v > 0) setVolume(Math.min(1, v));
    setMuted(safeStorage.getItem(LS_MUTED) === "1");
    setMounted(true);
  }, []);


  // HTMLAudio crossfade pair — two instances of the same track. Only one is
  // "active" at a time; the other is primed to take over the last N seconds
  // for a seamless handoff (true gapless looping requires two instances
  // because HTMLAudio's `loop=true` re-seeks to 0 with an audible gap).
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const activeSlotRef = useRef<"a" | "b">("a");
  const crossfadeRafRef = useRef<number | null>(null);
  const crossfadingRef = useRef<boolean>(false);

  // Kept for legacy references below.
  const audioRef = audioARef;
  // Web Audio graph for truly gapless looping (preferred path)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const bufferUrlRef = useRef<string | null>(null);
  const usingWebAudioRef = useRef<boolean>(false);
  const fadeRef = useRef<number | null>(null);


  // Fetch bucket contents (client only, after mount)
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await publicSupabase.storage
          .from(BUCKET)
          .list("", { limit: 100, sortBy: { column: "name", order: "asc" } });
        if (error || !data || cancelled) return;
        const audio = data.filter((f) =>
          /\.(mp3|ogg|wav|m4a|aac|webm)$/i.test(f.name),
        );
        const mapped: Sound[] = audio.map((f) => {
          const { data: pub } = publicSupabase.storage
            .from(BUCKET)
            .getPublicUrl(f.name);
          return { name: f.name, title: titleize(f.name), url: pub.publicUrl };
        });
        setSounds(mapped);
      } catch {
        /* bucket may not exist yet — silently ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  const current = useMemo(
    () => sounds.find((s) => s.name === selected) ?? null,
    [sounds, selected],
  );

  // Persist prefs (skip until mounted so we don't overwrite stored values)
  useEffect(() => {
    if (!mounted) return;
    if (selected) safeStorage.setItem(LS_SOUND, selected);
    else safeStorage.removeItem(LS_SOUND);
  }, [selected, mounted]);
  useEffect(() => {
    if (!mounted) return;
    safeStorage.setItem(LS_VOL, String(volume));
  }, [volume, mounted]);
  useEffect(() => {
    if (!mounted) return;
    safeStorage.setItem(LS_MUTED, muted ? "1" : "0");
  }, [muted, mounted]);


  // Ensure <audio> element exists & mirrors selection (fallback path).
  // Also kicks off a Web Audio buffer decode for gapless looping.
  useEffect(() => {
    if (!current) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      stopWebAudioSource();
      bufferRef.current = null;
      bufferUrlRef.current = null;
      return;
    }

    // HTMLAudio fallback: fully preload to avoid mid-loop network hits.
    let el = audioRef.current;
    if (!el) {
      el = new Audio();
      el.loop = true;
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      audioRef.current = el;
    }
    el.loop = true;
    el.preload = "auto";
    if (el.src !== current.url) {
      el.src = current.url;
      el.load();
    }

    // Fetch + decode into an AudioBuffer for the Web Audio path.
    // Once decoded, an AudioBufferSourceNode with loop=true plays sample-
    // accurate, gapless — no re-fetch, no seek, no silence at wrap.
    if (bufferUrlRef.current !== current.url) {
      bufferUrlRef.current = current.url;
      bufferRef.current = null;
      const url = current.url;
      (async () => {
        try {
          const res = await fetch(url, { mode: "cors" });
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          if (bufferUrlRef.current !== url) return; // selection changed
          const ctx = ensureAudioContext();
          if (!ctx) return;
          const buf = await ctx.decodeAudioData(arr.slice(0));
          if (bufferUrlRef.current !== url) return;
          bufferRef.current = buf;
          // If we're already supposed to be running, upgrade to Web Audio now.
          if (running && !usingWebAudioRef.current) {
            startWebAudioSource(muted ? 0 : volume);
            // Fade the HTMLAudio fallback out to avoid double-playback.
            if (audioRef.current) audioRef.current.pause();
          }
        } catch {
          /* decode failed — HTMLAudio fallback keeps working */
        }
      })();
    }
  }, [current]);

  // Volume / mute
  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = muted ? 0 : volume;
    const g = gainRef.current;
    if (g && audioCtxRef.current) {
      const target = muted ? 0 : volume;
      const t = audioCtxRef.current.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.linearRampToValueAtTime(target, t + 0.05);
    }
  }, [volume, muted]);

  function ensureAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctor: typeof AudioContext | undefined =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainRef.current = g;
      return ctx;
    } catch {
      return null;
    }
  }

  function startWebAudioSource(initialVolume: number) {
    const ctx = audioCtxRef.current;
    const g = gainRef.current;
    const buf = bufferRef.current;
    if (!ctx || !g || !buf) return false;
    // Resume if suspended (autoplay policy).
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    stopWebAudioSource();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = buf.duration;
    src.connect(g);
    src.start(0);
    sourceRef.current = src;
    usingWebAudioRef.current = true;
    // Fade in
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(initialVolume, t + 0.5);
    return true;
  }

  function stopWebAudioSource() {
    const src = sourceRef.current;
    if (src) {
      try { src.stop(); } catch { /* ignore */ }
      try { src.disconnect(); } catch { /* ignore */ }
    }
    sourceRef.current = null;
    usingWebAudioRef.current = false;
  }

  // Play / pause driven by timer phase (with small fade)
  useEffect(() => {
    if (!current) return;
    const target = muted ? 0 : volume;

    if (running) {
      // Prefer Web Audio path for gapless loop; fall back to HTMLAudio.
      if (bufferRef.current && ensureAudioContext()) {
        if (audioRef.current) audioRef.current.pause();
        startWebAudioSource(target);
      } else {
        const el = audioRef.current;
        if (!el) return;
        if (fadeRef.current) {
          window.clearInterval(fadeRef.current);
          fadeRef.current = null;
        }
        el.loop = true;
        el.volume = 0;
        el.play().catch(() => { /* autoplay blocked */ });
        const step = target / 12;
        fadeRef.current = window.setInterval(() => {
          if (!audioRef.current) return;
          const next = Math.min(target, audioRef.current.volume + step);
          audioRef.current.volume = next;
          if (next >= target && fadeRef.current) {
            window.clearInterval(fadeRef.current);
            fadeRef.current = null;
          }
        }, 40);
      }
    } else {
      // Stop Web Audio source (with short fade) if active
      if (usingWebAudioRef.current && audioCtxRef.current && gainRef.current) {
        const ctx = audioCtxRef.current;
        const g = gainRef.current;
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 0.3);
        const src = sourceRef.current;
        window.setTimeout(() => {
          if (sourceRef.current === src) stopWebAudioSource();
        }, 350);
      }
      // Fade HTMLAudio fallback out if it was playing
      const el = audioRef.current;
      if (el && !el.paused) {
        if (fadeRef.current) {
          window.clearInterval(fadeRef.current);
          fadeRef.current = null;
        }
        const start = el.volume;
        const step = Math.max(0.02, start / 10);
        fadeRef.current = window.setInterval(() => {
          if (!audioRef.current) return;
          const next = Math.max(0, audioRef.current.volume - step);
          audioRef.current.volume = next;
          if (next <= 0) {
            audioRef.current.pause();
            if (fadeRef.current) {
              window.clearInterval(fadeRef.current);
              fadeRef.current = null;
            }
          }
        }, 30);
      }
    }
    return () => {
      if (fadeRef.current) {
        window.clearInterval(fadeRef.current);
        fadeRef.current = null;
      }
    };
  }, [running, current, volume, muted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebAudioSource();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (fadeRef.current) window.clearInterval(fadeRef.current);
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch { /* ignore */ }
        audioCtxRef.current = null;
        gainRef.current = null;
      }
    };
  }, []);

  const hasSounds = sounds.length > 0;

  // Render a stable placeholder during SSR / first paint so hydration matches.
  if (!mounted) {
    return <div className="relative inline-flex items-center gap-1.5 h-8" aria-hidden />;
  }

  return (
    <div className="relative inline-flex items-center gap-1.5 text-muted-foreground">

      {/* Selector */}
      <button
        type="button"
        onClick={() => {
          playClick();
          setOpen((v) => !v);
        }}
        className="group inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-border/60 hover:border-foreground/40 hover:text-foreground/90 transition-colors text-[11px] tracking-wide"
        aria-label="Select ambient sound"
      >
        <Music2 className="h-3 w-3" strokeWidth={1.75} />
        <span className="max-w-[110px] truncate">
          {current ? current.title : hasSounds ? "Ambient" : "No sounds"}
        </span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
        />
      </button>

      {/* Mute */}
      <button
        type="button"
        onClick={() => {
          playClick();
          setMuted((m) => !m);
        }}
        className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-border/60 hover:border-foreground/40 hover:text-foreground/90 transition-colors"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? (
          <VolumeX className="h-3.5 w-3.5" strokeWidth={1.75} />
        ) : (
          <Volume2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
      </button>

      {open && (
        <>
          {/* Click-away */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-50 top-full mt-2 left-0 min-w-[220px] rounded-lg border border-border/70 bg-black/95 backdrop-blur shadow-2xl p-2">
            <div className="px-2 pb-1.5 text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70">
              Ambient
            </div>
            <button
              type="button"
              onClick={() => {
                playClick();
                setSelected(null);
                setOpen(false);
              }}
              className={`w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors ${
                !selected
                  ? "text-amber-200/90 bg-amber-500/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              None
            </button>
            {hasSounds ? (
              sounds.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => {
                    playClick();
                    setSelected(s.name);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors truncate ${
                    selected === s.name
                      ? "text-amber-200/90 bg-amber-500/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {s.title}
                </button>
              ))
            ) : (
              <div className="px-2 py-2 text-[11px] leading-relaxed text-muted-foreground/70">
                No sounds yet. Upload audio files to the{" "}
                <span className="text-foreground/80">focus-sounds</span> bucket
                in Supabase Storage — they'll appear here automatically.
              </div>
            )}

            {/* Volume slider */}
            <div className="mt-2 pt-2 border-t border-border/50 px-2 pb-1">
              <div className="flex items-center gap-2">
                <Volume2 className="h-3 w-3 text-muted-foreground/70" strokeWidth={1.75} />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    if (v > 0 && muted) setMuted(false);
                  }}
                  className="flex-1 h-1 accent-amber-400/80"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
