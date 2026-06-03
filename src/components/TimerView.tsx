import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Play, Pause, Check } from "lucide-react";
import { Hourglass } from "./Hourglass";
import { addSession } from "@/lib/sessions";
import { playGong } from "@/lib/gong";

type Phase = "idle" | "running" | "paused" | "asking" | "complete";

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
  const [task, setTask] = useState("");
  const [minutes, setMinutes] = useState(90);
  const [phase, setPhase] = useState<Phase>("idle");
  /** Remaining seconds */
  const [remaining, setRemaining] = useState(90 * 60);
  /** Total seconds for current session (grows if extra time added) */
  const [total, setTotal] = useState(90 * 60);
  /** Seconds actually focused (running time only) */
  const focusedRef = useRef(0);
  const startedAtRef = useRef<string | null>(null);
  const tickRef = useRef<number | null>(null);

  // Keep remaining synced when idle and minutes change
  useEffect(() => {
    if (phase === "idle") {
      setRemaining(minutes * 60);
      setTotal(minutes * 60);
    }
  }, [minutes, phase]);

  // Tick loop
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        const next = r - 1;
        focusedRef.current += 1;
        if (next <= 0) {
          setPhase("asking");
          return 0;
        }
        return next;
      });
    }, 1000);
    tickRef.current = id;
    return () => window.clearInterval(id);
  }, [phase]);

  const canStart = task.trim().length > 0 && phase === "idle";
  const locked = phase !== "idle";
  const progress = total > 0 ? 1 - remaining / total : 1;

  function start() {
    if (!canStart) return;
    focusedRef.current = 0;
    startedAtRef.current = new Date().toISOString();
    setTotal(minutes * 60);
    setRemaining(minutes * 60);
    setPhase("running");
  }

  function pause() {
    if (phase === "running") setPhase("paused");
    else if (phase === "paused") setPhase("running");
  }

  function finalize() {
    addSession({
      id: crypto.randomUUID(),
      task: task.trim(),
      plannedMinutes: Math.round(total / 60),
      focusedMinutes: Math.round(focusedRef.current / 60),
      startedAt: startedAtRef.current ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    setPhase("complete");
    window.setTimeout(() => {
      setPhase("idle");
      setTask("");
      setMinutes(90);
      setRemaining(90 * 60);
      setTotal(90 * 60);
      focusedRef.current = 0;
      startedAtRef.current = null;
    }, 1800);
  }

  function addExtra(mins: number) {
    setTotal((t) => t + mins * 60);
    setRemaining((r) => r + mins * 60);
    setPhase("running");
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md flex flex-col items-center gap-10">
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
            className="w-full bg-transparent text-center font-display text-2xl md:text-3xl tracking-tight placeholder:text-muted-foreground/50 border-b border-border focus:border-foreground/60 outline-none py-3 transition-colors disabled:opacity-90"
          />
          <div className="mt-1 text-[10px] text-right text-muted-foreground/60 tabular-nums">
            {task.length}/60
          </div>
        </div>

        {/* Hourglass */}
        <div className="relative w-64 h-80 text-foreground/85">
          <Hourglass
            progress={progress}
            flowing={phase === "running"}
            complete={phase === "complete"}
          />
        </div>

        {/* Time + duration */}
        <div className="flex flex-col items-center gap-3">
          <div className="font-display text-5xl tabular-nums tracking-tight">
            {fmt(remaining)}
          </div>
          {phase === "idle" ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <button
                onClick={() => setMinutes((m) => Math.max(1, m - 5))}
                className="h-8 w-8 rounded-full border border-border hover:text-foreground hover:border-foreground/60 transition-colors flex items-center justify-center"
                aria-label="Decrease minutes"
              >
                <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <input
                type="number"
                min={1}
                max={600}
                value={minutes}
                onChange={(e) =>
                  setMinutes(Math.max(1, Math.min(600, Number(e.target.value) || 1)))
                }
                className="w-16 bg-transparent text-center text-sm tabular-nums outline-none border-b border-border focus:border-foreground/60 py-1"
              />
              <span className="text-xs uppercase tracking-[0.18em]">min</span>
              <button
                onClick={() => setMinutes((m) => Math.min(600, m + 5))}
                className="h-8 w-8 rounded-full border border-border hover:text-foreground hover:border-foreground/60 transition-colors flex items-center justify-center"
                aria-label="Increase minutes"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {phase === "running" && "Focusing"}
              {phase === "paused" && "Paused"}
              {phase === "asking" && "Time up"}
              {phase === "complete" && "Done"}
            </div>
          )}
        </div>

        {/* Controls */}
        {phase === "asking" ? (
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="text-sm text-muted-foreground text-center">
              Is <span className="text-foreground">{task}</span> done?
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={finalize}
                className="px-5 py-2.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Yes, complete
              </button>
              <button
                onClick={() => addExtra(5)}
                className="px-4 py-2.5 rounded-md border border-border text-sm hover:border-foreground/60 transition-colors"
              >
                +5 min
              </button>
              <button
                onClick={() => addExtra(15)}
                className="px-4 py-2.5 rounded-md border border-border text-sm hover:border-foreground/60 transition-colors"
              >
                +15 min
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={start}
              disabled={!canStart}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-foreground text-background text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              <Play className="h-3.5 w-3.5" strokeWidth={2} /> Start
            </button>
            <button
              onClick={pause}
              disabled={phase !== "running" && phase !== "paused"}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-border text-sm disabled:opacity-30 hover:border-foreground/60 transition-colors"
            >
              <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
              {phase === "paused" ? "Resume" : "Pause"}
            </button>
            <button
              onClick={finalize}
              disabled={phase === "idle" || phase === "complete"}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-border text-sm disabled:opacity-30 hover:border-foreground/60 transition-colors"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={1.75} /> Complete
            </button>
          </div>
        )}

        {!canStart && phase === "idle" && (
          <p className="text-[11px] text-muted-foreground/70 -mt-4">
            Name your one thing to begin.
          </p>
        )}
      </div>
    </div>
  );
}
