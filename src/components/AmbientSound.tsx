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
import { supabase } from "@/lib/supabase";
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
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [selected, setSelected] = useState<string | null>(
    () => safeStorage.getItem(LS_SOUND) || null,
  );
  const [volume, setVolume] = useState<number>(() => {
    const v = Number(safeStorage.getItem(LS_VOL));
    return Number.isFinite(v) && v > 0 ? Math.min(1, v) : 0.5;
  });
  const [muted, setMuted] = useState<boolean>(
    () => safeStorage.getItem(LS_MUTED) === "1",
  );
  const [open, setOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);

  // Fetch bucket contents
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .list("", { limit: 100, sortBy: { column: "name", order: "asc" } });
        if (error || !data || cancelled) return;
        const audio = data.filter((f) =>
          /\.(mp3|ogg|wav|m4a|aac|webm)$/i.test(f.name),
        );
        const mapped: Sound[] = audio.map((f) => {
          const { data: pub } = supabase.storage
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
  }, []);

  const current = useMemo(
    () => sounds.find((s) => s.name === selected) ?? null,
    [sounds, selected],
  );

  // Persist prefs
  useEffect(() => {
    if (selected) safeStorage.setItem(LS_SOUND, selected);
    else safeStorage.removeItem(LS_SOUND);
  }, [selected]);
  useEffect(() => {
    safeStorage.setItem(LS_VOL, String(volume));
  }, [volume]);
  useEffect(() => {
    safeStorage.setItem(LS_MUTED, muted ? "1" : "0");
  }, [muted]);

  // Ensure <audio> element exists & mirrors selection
  useEffect(() => {
    if (!current) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      return;
    }
    let el = audioRef.current;
    if (!el) {
      el = new Audio();
      el.loop = true;
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      audioRef.current = el;
    }
    if (el.src !== current.url) {
      el.src = current.url;
      el.load();
    }
  }, [current]);

  // Volume / mute
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // Play / pause driven by timer phase (with small fade)
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !current) return;
    if (fadeRef.current) {
      window.clearInterval(fadeRef.current);
      fadeRef.current = null;
    }
    const target = muted ? 0 : volume;
    if (running) {
      el.volume = 0;
      el.play().catch(() => {
        /* autoplay blocked — user must interact once; harmless */
      });
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
    } else {
      const start = el.volume;
      const step = start / 10;
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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (fadeRef.current) window.clearInterval(fadeRef.current);
    };
  }, []);

  const hasSounds = sounds.length > 0;

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
