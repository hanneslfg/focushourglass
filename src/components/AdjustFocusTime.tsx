/**
 * Post-session focus-time adjustment.
 *
 * Shown after the user completes a session. The tracked focused minutes are
 * pre-filled; the user can scrub the slider backward to subtract distracted
 * time (e.g. they forgot to pause). Confirming commits the adjusted value
 * to local + Supabase via `commitReview()` in TimerContext.
 *
 * Pure presentation — all persistence lives in TimerContext.
 */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";

interface Props {
  trackedMinutes: number;
  taskName: string;
  onConfirm: (finalMinutes: number) => void;
  /** Override slider max (defaults to trackedMinutes). Use to allow upward adjustment. */
  maxMinutes?: number;
  /** Start the adjust slider expanded by default. */
  startExpanded?: boolean;
}

export function AdjustFocusTime({ trackedMinutes, taskName, onConfirm, maxMinutes, startExpanded }: Props) {
  const [adjust, setAdjust] = useState(Boolean(startExpanded));
  const [value, setValue] = useState(trackedMinutes);

  useEffect(() => {
    setValue(trackedMinutes);
  }, [trackedMinutes]);

  const subtracted = Math.max(0, trackedMinutes - value);
  const added = Math.max(0, value - trackedMinutes);
  const min = 1;
  const max = Math.max(maxMinutes ?? trackedMinutes, trackedMinutes, 1);
  const pct = ((value - min) / Math.max(1, max - min)) * 100;


  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <div className="text-sm text-muted-foreground text-center">
        Logging <span className="text-foreground">{taskName}</span>
      </div>

      {/* Duration display */}
      <div className="flex flex-col items-center gap-1">
        <div className="font-display text-5xl md:text-6xl tabular-nums tracking-tight text-foreground transition-all">
          {value}
          <span className="text-2xl md:text-3xl text-muted-foreground ml-1.5 font-normal">min</span>
        </div>
        {subtracted > 0 ? (
          <div className="text-[11px] uppercase tracking-[0.2em] text-amber-300/70">
            −{subtracted} min adjusted
          </div>
        ) : added > 0 ? (
          <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/70">
            +{added} min added
          </div>
        ) : (
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
            Focused time
          </div>
        )}

      </div>

      {/* Inline adjust slider */}
      {adjust ? (
        <div className="w-full max-w-xs flex flex-col items-center gap-3 pt-1">
          <div className="w-full relative">
            {/* Track */}
            <div className="h-[3px] w-full rounded-full bg-border/60 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500/40 to-amber-300/80 transition-[width] duration-75"
                style={{ width: `${pct}%`, boxShadow: "0 0 12px rgba(245,158,11,0.35)" }}
              />
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={1}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="adjust-slider absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-manipulation"
              aria-label="Adjust focused minutes"
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none w-3.5 h-3.5 rounded-full bg-amber-300 transition-[left] duration-75"
              style={{
                left: `calc(${pct}% - 7px)`,
                boxShadow: "0 0 0 4px rgba(15,15,15,0.9), 0 0 14px rgba(245,158,11,0.6)",
              }}
            />
          </div>
          <div className="flex items-center justify-between w-full text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 tabular-nums px-0.5">
            <span>1 min</span>
            <span>{trackedMinutes} min tracked</span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdjust(true)}
          className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-amber-300 transition-colors"
        >
          Adjust focus time
        </button>
      )}

      <button
        onClick={() => onConfirm(value)}
        className="mt-2 inline-flex items-center justify-center gap-2 px-6 min-h-12 rounded-md bg-foreground text-background text-base md:text-sm font-medium hover:opacity-90 active:opacity-80 transition-opacity touch-manipulation w-full md:w-auto"
      >
        <Check className="h-4 w-4" strokeWidth={2} />
        Save session
      </button>
    </div>
  );
}
