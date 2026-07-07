import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Play, Pause, Check, X, Coffee, Focus as FocusIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Hourglass } from "./Hourglass";
import { ProjectPickerCompact } from "./ProjectPickerCompact";
import { AmbientSound } from "./AmbientSound";
import { VisualWarmup } from "./VisualWarmup";


import { ProjectGoalPicker } from "./ProjectGoalPicker";
import { playClick } from "@/lib/click";
import { useTimer } from "@/lib/TimerContext";
import { getSettings } from "@/lib/settings";
import { deactivateRhythm } from "@/lib/rhythms";

function fmt(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function TimerView() {
  const {
    task,
    setTask,
    project,
    setProject,
    goalId,
    goalId,
    setGoal,

    minutes,
    setMinutes,
    phase,
    remaining,
    total,
    flipNonce,
    endAtMs,
    rhythm,
    blockKind,
    start,
    pause,
    finalize,
    abort,
    addExtra,
  } = useTimer();


  const [minuteInput, setMinuteInput] = useState(String(minutes));
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [warmupActive, setWarmupActive] = useState(false);
  // Gate any Date.now()-derived UI behind mount to avoid SSR/client hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Only animate the flip when the user actively clicks Start during this
  // mount. On remount with an already-running timer, skip the intro animation.
  const initialFlipRef = useRef(flipNonce);
  const shouldAnimateFlip = flipNonce !== initialFlipRef.current;


  // Keep the visible minute field synced with context state.
  useEffect(() => {
    setMinuteInput(String(minutes));
  }, [minutes]);

  // Break blocks can start without a task (the timer auto-fills "Break").
  const nextIsBreak = phase === "idle" && rhythm?.block.kind === "break";
  const canStart =
    phase === "idle" && (nextIsBreak || task.trim().length > 0);
  const locked = phase !== "idle";

  function computeEndTime(offsetSeconds: number) {
    const d = new Date(Date.now() + offsetSeconds * 1000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const endTimeLabel = (() => {
    if (!mounted) return null;
    if (phase === "idle") return computeEndTime(minutes * 60);
    if (phase === "running" && endAtMs)
      return computeEndTime(Math.max(0, Math.ceil((endAtMs - Date.now()) / 1000)));
    if (phase === "paused") return computeEndTime(remaining);
    return null;
  })();

  const progress = total > 0 ? 1 - remaining / total : 1;

  return (
    <div className="flex-1 flex items-start md:items-center justify-center px-4 md:px-6 pt-28 pb-6 md:py-10">
      <div className="w-full max-w-md flex flex-col items-center gap-6 md:gap-10">
        {/* Rhythm indicator (Focus Blocks) — minimal floating pill */}
        {rhythm && (
          <div
            key={`${rhythm.rhythm.id}-${rhythm.index}`}
            className="group flex items-center gap-2 rounded-full bg-white/[0.03] backdrop-blur-md px-3 py-1 text-[11px] text-muted-foreground/80 ring-1 ring-inset ring-white/[0.06] transition-opacity duration-500 animate-in fade-in"
          >
            {blockKind === "break" ? (
              <Coffee className="h-3 w-3 text-sky-400/70" strokeWidth={1.75} />
            ) : (
              <FocusIcon className="h-3 w-3 text-amber-400/70" strokeWidth={1.75} />
            )}
            <span className="truncate max-w-[16rem]">
              <span className="text-foreground/70">{rhythm.rhythm.name}</span>
              <span className="mx-1.5 opacity-40">•</span>
              <span>
                Block {rhythm.index + 1}/{rhythm.rhythm.blocks.length}:{" "}
                {blockKind === "break" ? "Break" : "Focus"}
              </span>
            </span>
            <span className="ml-1 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Link
                to="/focus-blocks"
                className="text-[10px] uppercase tracking-[0.18em] hover:text-foreground transition-colors"
              >
                Edit
              </Link>
              <button
                onClick={() => deactivateRhythm()}
                className="text-[10px] uppercase tracking-[0.18em] hover:text-destructive transition-colors"
                title="Stop this rhythm"
              >
                End
              </button>
            </span>
          </div>
        )}

        {/* Task */}
        <div className="w-full">
          <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 text-center">
            One thing
          </label>
          <input
            value={task}
            onChange={(e) => setTask(e.target.value.slice(0, 60))}
            disabled={locked}
            maxLength={60}
            placeholder="What are you working on?"
            className="w-full bg-transparent text-center font-display text-xl md:text-3xl tracking-tight placeholder:text-muted-foreground/50 border-b border-border focus:border-foreground/60 outline-none py-3 transition-colors disabled:opacity-90"
          />
          <div className="mt-1 text-[10px] text-right text-muted-foreground/60 tabular-nums">
            {task.length}/60
          </div>
        </div>

        {/* Project + Goal — inline horizontal row, wraps on narrow widths */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <ProjectPickerCompact
            selectedId={project?.id ?? null}
            onSelect={setProject}
          />
          <ProjectGoalPicker project={project} goalId={goalId} onChange={setGoal} disabled={locked} />
        </div>

        {/* Ambient sound selector */}
        <AmbientSound running={phase === "running"} />



        {/* Hourglass */}
        <div
          className="relative w-48 h-60 md:w-64 md:h-80 text-foreground/85 transition-[color] duration-700"
          style={
            blockKind === "break"
              ? ({
                  ["--sand" as string]: "oklch(0.82 0.04 235)",
                  ["--sand-glow" as string]: "oklch(0.78 0.06 235)",
                } as React.CSSProperties)
              : undefined
          }
        >
          <div key={flipNonce} className={`w-full h-full ${shouldAnimateFlip ? "animate-hg-flip" : ""}`}>
            <div
              className="w-full h-full"
              style={{
                transform: phase === "paused" ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.45s ease-in-out",
                transformOrigin: "50% 50%",
              }}
            >
              <Hourglass
                progress={progress}
                flowing={phase === "running"}
                complete={phase === "complete"}
              />
            </div>
          </div>
        </div>

        {/* Time + duration */}
        <div className="flex flex-col items-center gap-3">
          <div className="font-display text-4xl md:text-5xl tabular-nums tracking-tight">
            {fmt(remaining)}
          </div>
          {phase === "idle" ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <button
                onClick={() => { playClick(); setMinutes(Math.max(1, minutes - 5)); }}
                className="h-11 w-11 md:h-9 md:w-9 rounded-full border border-border active:bg-accent hover:text-foreground hover:border-foreground/60 transition-colors flex items-center justify-center touch-manipulation"
                aria-label="Decrease minutes"
              >
                <Minus className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={1.5} />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={minuteInput}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") {
                    setMinuteInput("");
                    return;
                  }
                  const num = Number(val);
                  if (!isNaN(num)) {
                    setMinuteInput(val);
                    setMinutes(Math.max(1, Math.min(600, num)));
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === "") {
                    setMinutes(90);
                  } else {
                    const num = Math.max(1, Math.min(600, Number(e.target.value) || 90));
                    setMinutes(num);
                  }
                }}
                className="w-16 bg-transparent text-center text-base md:text-sm tabular-nums outline-none border-b border-border focus:border-foreground/60 py-1"
              />
              <span className="text-xs uppercase tracking-[0.18em]">min</span>
              <button
                onClick={() => { playClick(); setMinutes(Math.min(600, minutes + 5)); }}
                className="h-11 w-11 md:h-9 md:w-9 rounded-full border border-border active:bg-accent hover:text-foreground hover:border-foreground/60 transition-colors flex items-center justify-center touch-manipulation"
                aria-label="Increase minutes"
              >
                <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {phase === "running" && (blockKind === "break" ? "Resting" : "Focusing")}
              {phase === "paused" && "Paused"}
              {phase === "asking" && "Time up"}
              
              {phase === "complete" && "Done"}
            </div>

          )}
          {endTimeLabel && (
            <div className="text-[11px] text-muted-foreground/50 tracking-wide tabular-nums">
              Ends at {endTimeLabel}
            </div>
          )}
        </div>

        {/* Controls */}
        {phase === "asking" ? (
          <AskingControls task={task} onDone={finalize} onAddExtra={addExtra} />


        ) : showAbortConfirm ? (
          <div className="flex flex-col items-center gap-4 w-full rounded-lg border border-border bg-card p-5">
            <p className="text-sm text-center text-foreground">
              Are you sure? This session will not be saved.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAbortConfirm(false)}
                className="px-5 min-h-10 rounded-md border border-border text-sm hover:border-foreground/60 active:bg-accent transition-colors touch-manipulation"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowAbortConfirm(false); abort(); }}
                className="px-5 min-h-10 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 active:opacity-80 transition-opacity touch-manipulation"
              >
                Confirm
              </button>
            </div>
          </div>
        ) : phase === "running" || phase === "paused" ? (
          <div className="flex items-center gap-2 w-full justify-center flex-wrap">
            <button
              onClick={pause}
              className="inline-flex items-center justify-center gap-2 px-5 min-h-10 rounded-md bg-foreground/80 text-background text-sm font-medium hover:bg-foreground active:opacity-80 transition-all touch-manipulation"
            >
              <Pause className="h-3.5 w-3.5" strokeWidth={2} />
              {phase === "paused" ? "Resume" : "Pause"}
            </button>
            <button
              onClick={finalize}
              className="inline-flex items-center justify-center gap-2 px-5 min-h-10 rounded-md border border-border text-sm hover:border-foreground/60 active:bg-accent transition-colors touch-manipulation"
            >
              <Check className="h-4 w-4" strokeWidth={1.75} /> Complete
            </button>
            <button
              onClick={() => setShowAbortConfirm(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 min-h-10 rounded-md border border-border/60 text-xs text-muted-foreground hover:border-foreground/40 active:bg-accent transition-colors touch-manipulation"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} /> Abort
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:flex md:flex-wrap items-center justify-center gap-2 w-full">
            <button
              onClick={() => {
                if (getSettings().warmupEnabled) setWarmupActive(true);
                else start();
              }}
              disabled={!canStart}
              className="col-span-2 md:col-span-1 inline-flex items-center justify-center gap-2 px-5 min-h-12 md:min-h-0 md:py-2.5 rounded-md bg-foreground text-background text-base md:text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:opacity-80 transition-opacity touch-manipulation"
            >
              <Play className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={2} /> Start
            </button>
            <button
              disabled
              className="inline-flex items-center justify-center gap-2 px-5 min-h-12 md:min-h-0 md:py-2.5 rounded-md border border-border text-base md:text-sm disabled:opacity-30 hover:border-foreground/60 active:bg-accent transition-colors touch-manipulation"
            >
              <Pause className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={1.75} />
              Pause
            </button>
            <button
              disabled
              className="inline-flex items-center justify-center gap-2 px-5 min-h-12 md:min-h-0 md:py-2.5 rounded-md border border-border text-base md:text-sm disabled:opacity-30 hover:border-foreground/60 active:bg-accent transition-colors touch-manipulation"
            >
              <Check className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={1.75} /> Complete
            </button>
          </div>
        )}

        {!canStart && phase === "idle" && (
          <p className="text-[11px] text-muted-foreground/70 -mt-4">
            Name your one thing to begin.
          </p>
        )}
      </div>
      {warmupActive && (
        <VisualWarmup
          onComplete={() => {
            setWarmupActive(false);
            start();
          }}
          onCancel={() => setWarmupActive(false)}
        />
      )}
    </div>
  );
}

function AskingControls({
  task,
  onDone,
  onAddExtra,
}: {
  task: string;
  onDone: () => void;
  onAddExtra: (mins: number) => void;
}) {
  const [extra, setExtra] = useState(10);
  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <div className="text-sm text-muted-foreground text-center">
        Is <span className="text-foreground">{task}</span> done?
      </div>
      <button
        onClick={onDone}
        className="px-6 min-h-12 rounded-md bg-foreground text-background text-base md:text-sm font-medium hover:opacity-90 active:opacity-80 transition-opacity touch-manipulation w-full md:w-auto"
      >
        Yes, complete
      </button>
      <div className="flex flex-col items-center gap-2 w-full">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Or add more time
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-muted-foreground">
          <button
            onClick={() => { playClick(); setExtra((m) => Math.max(1, m - 5)); }}
            className="h-11 w-11 md:h-9 md:w-9 rounded-full border border-border active:bg-accent hover:text-foreground hover:border-foreground/60 transition-colors flex items-center justify-center touch-manipulation"
            aria-label="Less extra"
          >
            <Minus className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={1.5} />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={240}
            value={extra}
            onChange={(e) =>
              setExtra(Math.max(1, Math.min(240, Number(e.target.value) || 1)))
            }
            className="w-14 bg-transparent text-center text-base md:text-sm tabular-nums outline-none border-b border-border focus:border-foreground/60 py-1"
          />
          <span className="text-xs uppercase tracking-[0.18em]">min</span>
          <button
            onClick={() => { playClick(); setExtra((m) => Math.min(240, m + 5)); }}
            className="h-11 w-11 md:h-9 md:w-9 rounded-full border border-border active:bg-accent hover:text-foreground hover:border-foreground/60 transition-colors flex items-center justify-center touch-manipulation"
            aria-label="More extra"
          >
            <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onAddExtra(extra)}
            className="ml-1 px-5 min-h-11 rounded-md border border-border text-foreground text-base md:text-sm hover:border-foreground/60 active:bg-accent transition-colors touch-manipulation"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
