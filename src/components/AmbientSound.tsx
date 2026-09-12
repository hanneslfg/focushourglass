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
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { Volume2, VolumeX, Music2, ChevronDown, Lock } from "lucide-react";
import { publicSupabase } from "@/lib/supabase";
import { safeStorage } from "@/lib/safeStorage";
import { playClick } from "@/lib/click";
import { usePremium } from "@/lib/premium";
import { FREE_SOUND_KEY, getUnlockedFreeSound, isSoundFree } from "@/lib/freeSound";


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
  const [freeSoundId, setFreeSoundId] = useState<string | null>(null);
  const { isPremium, triggerPaywall } = usePremium();

  // The single track the user unlocked for free during onboarding.
  useEffect(() => {
    setFreeSoundId(getUnlockedFreeSound());
    const onChange = () => setFreeSoundId(getUnlockedFreeSound());
    const onStorage = (e: StorageEvent) => {
      if (e.key === FREE_SOUND_KEY) onChange();
    };
    window.addEventListener("hourglass:freeSound", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("hourglass:freeSound", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);


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

  // Non-premium users can only keep their unlocked free sound selected. If a
  // premium sound was previously chosen (or they downgrade), silently reset it.
  useEffect(() => {
    if (!mounted || isPremium) return;
    if (current && !isSoundFree(current, freeSoundId)) setSelected(null);
  }, [mounted, isPremium, current, freeSoundId]);


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


  // Latest volume/mute for rAF to read without re-subscribing.
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const CROSSFADE_SECS = 3;

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

  function getSlot(slot: "a" | "b"): HTMLAudioElement | null {
    return slot === "a" ? audioARef.current : audioBRef.current;
  }
  function otherSlot(slot: "a" | "b"): "a" | "b" { return slot === "a" ? "b" : "a"; }

  function stopCrossfadeLoop() {
    if (crossfadeRafRef.current != null) {
      cancelAnimationFrame(crossfadeRafRef.current);
      crossfadeRafRef.current = null;
    }
    crossfadingRef.current = false;
  }

  function startCrossfadeLoop() {
    stopCrossfadeLoop();
    const tick = () => {
      const activeSlot = activeSlotRef.current;
      const active = getSlot(activeSlot);
      const other = getSlot(otherSlot(activeSlot));
      if (!active || !other) {
        crossfadeRafRef.current = requestAnimationFrame(tick);
        return;
      }
      const userVol = mutedRef.current ? 0 : volumeRef.current;
      const dur = Number.isFinite(active.duration) ? active.duration : 0;
      const remaining = dur > 0 ? dur - active.currentTime : Infinity;

      if (!crossfadingRef.current) {
        // Not crossfading yet — keep the active track at the user volume,
        // ensure the standby track is silent and paused at 0.
        active.volume = userVol;
        if (!other.paused) other.pause();
        other.volume = 0;

        if (dur > 0 && remaining <= CROSSFADE_SECS) {
          // Kick off the crossfade: start the standby instance at 0.
          crossfadingRef.current = true;
          try { other.currentTime = 0; } catch { /* seek may fail pre-metadata */ }
          other.volume = 0;
          const p = other.play();
          if (p && typeof p.catch === "function") p.catch(() => { /* autoplay */ });
        }
      } else {
        // Linear crossfade over CROSSFADE_SECS.
        const elapsed = Math.max(0, CROSSFADE_SECS - Math.max(0, remaining));
        const progress = Math.min(1, elapsed / CROSSFADE_SECS);
        active.volume = userVol * (1 - progress);
        other.volume = userVol * progress;

        if (progress >= 1 || active.ended || remaining <= 0) {
          // Handoff complete — swap roles.
          try { active.pause(); } catch { /* ignore */ }
          try { active.currentTime = 0; } catch { /* ignore */ }
          active.volume = 0;
          other.volume = userVol;
          activeSlotRef.current = otherSlot(activeSlot);
          crossfadingRef.current = false;
        }
      }

      crossfadeRafRef.current = requestAnimationFrame(tick);
    };
    crossfadeRafRef.current = requestAnimationFrame(tick);
  }

  function stopHtmlAudio(fade = true) {
    stopCrossfadeLoop();
    const a = audioARef.current;
    const b = audioBRef.current;
    if (!fade) {
      if (a) { try { a.pause(); } catch { /* ignore */ } a.volume = 0; }
      if (b) { try { b.pause(); } catch { /* ignore */ } b.volume = 0; }
      return;
    }
    // Short shared fade-out to avoid a hard stop.
    const start = Math.max(a?.volume ?? 0, b?.volume ?? 0);
    if (start <= 0) {
      if (a) try { a.pause(); } catch { /* ignore */ }
      if (b) try { b.pause(); } catch { /* ignore */ }
      return;
    }
    const step = Math.max(0.02, start / 10);
    const id = window.setInterval(() => {
      const aa = audioARef.current;
      const bb = audioBRef.current;
      const cur = Math.max(aa?.volume ?? 0, bb?.volume ?? 0);
      const next = Math.max(0, cur - step);
      if (aa) aa.volume = Math.min(aa.volume, next);
      if (bb) bb.volume = Math.min(bb.volume, next);
      if (next <= 0) {
        if (aa) try { aa.pause(); } catch { /* ignore */ }
        if (bb) try { bb.pause(); } catch { /* ignore */ }
        window.clearInterval(id);
      }
    }, 30);
  }

  /**
   * Absolute stop: kills the Web Audio source AND both HTMLAudio instances
   * instantly. Guarantees zero audible output — used on pause and whenever
   * the selected track changes, so only ONE track can ever be active.
   */
  function stopAllAudio() {
    stopWebAudioSource();
    const g = gainRef.current;
    const ctx = audioCtxRef.current;
    if (g && ctx) {
      try {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setValueAtTime(0, ctx.currentTime);
      } catch {
        /* ignore */
      }
    }
    stopHtmlAudio(false);
  }

  // Ensure both <audio> instances exist and mirror the current selection.
  // Also decode into an AudioBuffer for the preferred Web Audio path.
  useEffect(() => {
    // Any selection change hard-stops whatever is currently sounding before
    // the new track is prepared — never two tracks at once.
    stopAllAudio();

    if (!current) {
      if (audioARef.current) audioARef.current.src = "";
      if (audioBRef.current) audioBRef.current.src = "";
      bufferRef.current = null;
      bufferUrlRef.current = null;
      return;
    }

    // Lazily create both audio elements. We do NOT use loop=true — the
    // crossfade rAF stitches instances together instead, avoiding the
    // audible seek-to-0 gap that loop=true produces.
    for (const slot of ["a", "b"] as const) {
      const ref = slot === "a" ? audioARef : audioBRef;
      if (!ref.current) {
        const el = new Audio();
        el.loop = false;
        el.preload = "auto";
        el.crossOrigin = "anonymous";
        el.volume = 0;
        ref.current = el;
      }
      const el = ref.current!;
      el.loop = false;
      el.preload = "auto";
      if (el.src !== current.url) {
        el.src = current.url;
        el.load();
      }
    }
    activeSlotRef.current = "a";
    crossfadingRef.current = false;

    // Decode buffer for the Web Audio (preferred) path.
    if (bufferUrlRef.current !== current.url) {
      bufferUrlRef.current = current.url;
      bufferRef.current = null;
      const url = current.url;
      (async () => {
        try {
          const res = await fetch(url, { mode: "cors" });
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          if (bufferUrlRef.current !== url) return;
          const ctx = ensureAudioContext();
          if (!ctx) return;
          const buf = await ctx.decodeAudioData(arr.slice(0));
          if (bufferUrlRef.current !== url) return;
          bufferRef.current = buf;
          if (running && !usingWebAudioRef.current) {
            // Hand off to Web Audio: kill the HTMLAudio pair instantly so the
            // two paths can never sound at the same time.
            stopHtmlAudio(false);
            startWebAudioSource(mutedRef.current ? 0 : volumeRef.current);
          }
        } catch {
          /* decode failed — HTMLAudio crossfade keeps working */
        }
      })();
    }
  }, [current]);

  // Volume / mute — Web Audio ramps its gain node; HTMLAudio path lets the
  // rAF crossfade tick apply the new value on its next frame (so we only
  // touch the active element directly when no crossfade is in flight).
  useEffect(() => {
    const target = muted ? 0 : volume;
    const g = gainRef.current;
    if (g && audioCtxRef.current) {
      const t = audioCtxRef.current.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.linearRampToValueAtTime(target, t + 0.05);
    }
    if (!crossfadingRef.current) {
      const active = getSlot(activeSlotRef.current);
      const other = getSlot(otherSlot(activeSlotRef.current));
      if (active && !active.paused) active.volume = target;
      if (other) other.volume = 0;
    }
  }, [volume, muted]);

  // Play / pause driven by timer phase. Deliberately NOT dependent on
  // volume/mute — those are applied by the effect above, so changing them can
  // never restart a source (which used to stack overlapping tracks).
  useEffect(() => {
    if (!current) {
      stopAllAudio();
      return;
    }
    const target = mutedRef.current ? 0 : volumeRef.current;

    if (running) {
      // Always clear any existing playback first: exactly one active track.
      stopAllAudio();
      if (bufferRef.current && ensureAudioContext()) {
        startWebAudioSource(target);
      } else {
        // Start the HTMLAudio crossfade pair on slot A.
        activeSlotRef.current = "a";
        crossfadingRef.current = false;
        const a = audioARef.current;
        const b = audioBRef.current;
        if (b) { try { b.pause(); } catch { /* ignore */ } b.volume = 0; }
        if (a) {
          try { a.currentTime = 0; } catch { /* ignore */ }
          a.volume = target;
          const p = a.play();
          if (p && typeof p.catch === "function") p.catch(() => { /* autoplay */ });
        }
        startCrossfadeLoop();
      }
    } else {
      // Absolute pause rule: everything stops immediately, no lingering fades.
      stopAllAudio();
    }
    return () => {
      stopCrossfadeLoop();
    };
  }, [running, current]);


  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebAudioSource();
      stopCrossfadeLoop();
      for (const ref of [audioARef, audioBRef]) {
        const el = ref.current;
        if (el) {
          try { el.pause(); } catch { /* ignore */ }
          el.src = "";
        }
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

  // The player lives at the app root so audio keeps playing while navigating.
  // Its UI ALWAYS renders inside the timer view's `#ambient-slot` (between the
  // project row and the hourglass) — never in a fixed/floating footer.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!mounted) return;
    // The slot registers itself from its own effect (i.e. after the timer
    // route has hydrated), so portalling here can never race hydration.
    const sync = () => setSlot(getAmbientSlot());
    sync();
    return subscribeAmbientSlot(sync);
  }, [mounted]);



  // Render nothing during SSR / first paint so hydration matches.
  if (!mounted) return null;

  const ui = (
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
              sounds.map((s) => {
                const free = isSoundFree(s, freeSoundId);
                const locked = !free && !isPremium;
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => {
                      playClick();
                      if (locked) {
                        setOpen(false);
                        triggerPaywall();
                        return;
                      }
                      setSelected(s.name);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[12px] transition-colors truncate ${
                      selected === s.name
                        ? "text-amber-200/90 bg-amber-500/5"
                        : locked
                          ? "text-muted-foreground/60 hover:text-foreground/80 hover:bg-white/5"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    }`}
                    aria-label={locked ? `${s.title} — Premium` : s.title}
                  >
                    <span className="flex-1 truncate text-left">{s.title}</span>
                    {locked && (
                      <Lock className="h-3 w-3 text-amber-300/70 shrink-0" strokeWidth={1.75} />
                    )}
                  </button>
                );
              })
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
                  onInput={(e) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    setVolume(v);
                    if (v > 0 && muted) setMuted(false);
                    if (import.meta.env.DEV) console.debug("[slider] volume", v);
                  }}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    if (v > 0 && muted) setMuted(false);
                  }}
                  aria-label="Volume"
                  className="flex-1 h-1 accent-amber-400/80 touch-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // No slot on this page → audio keeps playing, but no floating control.
  if (!slot) return null;
  return createPortal(ui, slot);
}

