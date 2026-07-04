import { useEffect, useRef, useState } from "react";
import { getSettings } from "@/lib/settings";
import { playGong } from "@/lib/gong";

interface Props {
  /** Duration in seconds. Defaults to 60. */
  duration?: number;
  onComplete: () => void;
  onCancel: () => void;
}

/**
 * Visual Focus Warm-Up (Overt Attention Nudge).
 * Full-screen dark overlay with a single center point and a countdown ring.
 * Cancels on Escape. Plays a subtle chime on completion.
 */
export function VisualWarmup({ duration = 60, onComplete, onCancel }: Props) {
  const [remaining, setRemaining] = useState(duration);
  const startedAtRef = useRef<number>(Date.now());
  const doneRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
    const id = window.setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
      if (left <= 0 && !doneRef.current) {
        doneRef.current = true;
        window.clearInterval(id);
        if (getSettings().soundsEnabled) {
          try {
            playGong();
          } catch {
            /* ignore */
          }
        }
        setFading(true);
        // brief fade-out then hand off to the timer
        window.setTimeout(() => onComplete(), 450);
      }
    }, 100);
    intervalRef.current = id;
    return () => window.clearInterval(id);
  }, [duration, onComplete]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const skipToSession = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    // Instant hand-off — no fade, no chime — drop straight into the session.
    onComplete();
  };

  const progress = 1 - remaining / duration;
  const R = 46;
  const C = 2 * Math.PI * R;
  const dash = C * progress;
  const secondsLeft = Math.ceil(remaining);

  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center bg-black transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100 animate-fade-in"
      }`}
      role="dialog"
      aria-label="Visual focus warm-up"
    >
      {/* Faint vignette to draw the eye toward center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      {/* Ring + center point */}
      <div className="relative">
        <svg
          width="220"
          height="220"
          viewBox="0 0 120 120"
          className="block"
          aria-hidden
        >
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="0.6"
          />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="hsl(38 92% 62% / 0.55)"
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C - dash}`}
            transform="rotate(-90 60 60)"
            style={{ transition: "stroke-dasharray 120ms linear" }}
          />
        </svg>

        {/* Sand-grain center point */}
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 block rounded-full"
          style={{
            width: 4,
            height: 4,
            background: "hsl(38 92% 68%)",
            boxShadow:
              "0 0 6px hsl(38 92% 62% / 0.75), 0 0 14px hsl(38 92% 55% / 0.35)",
          }}
          aria-hidden
        />

        {/* Minimal skip — starts the session instantly */}
        <button
          type="button"
          onClick={skipToSession}
          className="absolute left-1/2 -translate-x-1/2 -bottom-10 text-[9px] uppercase tracking-[0.32em] text-white/20 hover:text-white/55 transition-colors"
          aria-label="Skip warm-up and start session"
        >
          Skip
        </button>
      </div>

      {/* Countdown + instruction */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[18vh] text-center px-6">
        <div className="font-display text-2xl tabular-nums tracking-tight text-white/70">
          {String(secondsLeft).padStart(2, "0")}
          <span className="text-white/25 text-base ml-1">s</span>
        </div>
        <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-white/35 max-w-xs mx-auto leading-relaxed">
          Stare at the center point. Breathe normally, blink when needed.
        </p>
      </div>

      {/* Cancel (top-right) — bails out entirely without starting the session */}
      <button
        onClick={onCancel}
        className="absolute top-6 right-6 text-[10px] uppercase tracking-[0.28em] text-white/15 hover:text-white/45 transition-colors"
        aria-label="Cancel warm-up"
      >
        Cancel
      </button>
    </div>
  );
}
