/**
 * Global timer state.
 *
 * Lives at the app root so the countdown survives route changes (the
 * <TimerView> component is unmounted when the user navigates to /projects,
 * /analytics, etc. — the interval here keeps running regardless).
 *
 * Also handles localStorage persistence + recovery on cold start: on refresh
 * we resume the timer with the elapsed wall-clock time subtracted from the
 * remaining duration, or gracefully finalize if the session already expired.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { ProjectTag } from "./projects";
import {
  saveActive,
  loadActive,
  clearActive,
  type ActiveTimerState,
} from "./activeTimer";
import { addSession, removeSession } from "./sessions";
import { saveSessionRemote, getUserId } from "./supabase";
import { playGong } from "./gong";
import { maybeNotifyGoalReached } from "./settings";
import {
  advanceRhythm,
  getActiveRhythm,
  type ActiveRhythmState,
  type BlockKind,
} from "./rhythms";

export type Phase = "idle" | "running" | "paused" | "asking" | "complete";

interface TimerCtx {
  // form / draft state (used when idle)
  task: string;
  setTask: (s: string) => void;
  project: ProjectTag | null;
  setProject: (p: ProjectTag | null) => void;
  /** Selected goal text for this session (denormalized). */
  goalText: string | null;
  setGoalText: (t: string | null) => void;
  minutes: number;
  setMinutes: (m: number) => void;

  // live runtime state
  phase: Phase;
  remaining: number;
  total: number;
  flipNonce: number;
  endAtMs: number | null;

  // rhythm awareness (Focus Blocks)
  rhythm: ActiveRhythmState | null;
  /** Kind of the currently-running block ('break' while a break interval runs). */
  blockKind: BlockKind | null;

  // actions
  start: () => void;
  pause: () => void;
  /** Save the session with the tracked focused time and show success. */
  finalize: () => void;
  abort: () => void;
  addExtra: (mins: number) => void;
}


const Ctx = createContext<TimerCtx | null>(null);

export function useTimer(): TimerCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTimer must be used inside <TimerProvider>");
  return v;
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const [task, setTaskState] = useState("");
  const [project, setProjectState] = useState<ProjectTag | null>(null);
  const [goalText, setGoalTextState] = useState<string | null>(null);
  const [minutes, setMinutesState] = useState(90);

  const [phase, setPhase] = useState<Phase>("idle");
  const [remaining, setRemaining] = useState(90 * 60);
  const [total, setTotal] = useState(90 * 60);
  const [flipNonce, setFlipNonce] = useState(0);
  const [endAtMs, setEndAtMs] = useState<number | null>(null);

  // Active Focus Blocks rhythm (mirrors localStorage; re-reads on events).
  const [rhythm, setRhythm] = useState<ActiveRhythmState | null>(() =>
    typeof window === "undefined" ? null : getActiveRhythm(),
  );
  const currentKindRef = useRef<BlockKind | null>(null);

  const focusedRef = useRef(0);
  const startedAtRef = useRef<string | null>(null);
  const endAtRef = useRef<number | null>(null);
  const lastCheckRef = useRef<number>(0);
  const savedRef = useRef(false);

  // Keep "ends-at" mirror state in sync with the ref so consumers re-render.
  const setEndAt = useCallback((v: number | null) => {
    endAtRef.current = v;
    setEndAtMs(v);
  }, []);

  // When idle, follow the minute selector
  useEffect(() => {
    if (phase === "idle") {
      setRemaining(minutes * 60);
      setTotal(minutes * 60);
    }
  }, [minutes, phase]);

  // Subscribe to rhythm store changes.
  useEffect(() => {
    const sync = () => setRhythm(getActiveRhythm());
    sync();
    window.addEventListener("hourglass:rhythm", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hourglass:rhythm", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // When idle, snap the timer duration to the active block so the Home
  // screen shows the correct block time immediately after activation.
  useEffect(() => {
    if (phase !== "idle") return;
    if (rhythm) setMinutesState(rhythm.block.minutes);
  }, [phase, rhythm]);

  const persist = useCallback(
    (running: boolean) => {
      if (!startedAtRef.current) return;
      const state: ActiveTimerState = {
        task: task.trim(),
        projectId: project?.id,
        projectName: project?.name,
        projectColor: project?.color,
        tags: goalText ? [goalText] : undefined,
        plannedMinutes: Math.round(total / 60),
        startedAt: startedAtRef.current,
        focusedSeconds: focusedRef.current,
        lastTickAt: Date.now(),
        running,
      };
      saveActive(state);
    },
    [task, project, goalText, total],
  );

  // ---- Tick loop ----------------------------------------------------------
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      const now = Date.now();
      const delta = Math.max(0, Math.round((now - lastCheckRef.current) / 1000));
      focusedRef.current += delta;
      lastCheckRef.current = now;

      const r = Math.max(0, Math.ceil((endAtRef.current! - now) / 1000));
      setRemaining(r);
      persist(true);
      if (r <= 0) {
        setEndAt(null);
        playGong();
        // Rhythm-driven blocks (Focus Blocks) auto-advance without an
        // "asking" prompt; handled by the finalize-on-asking effect below.
        setPhase("asking");
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, persist, setEndAt]);

  // ---- Persistence on tab hide / unload -----------------------------------
  useEffect(() => {
    if (phase !== "running" && phase !== "paused") return;
    const onHide = () => persist(phase === "running");
    window.addEventListener("beforeunload", onHide);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [phase, persist]);

  // ---- Cold-start recovery: resume (not auto-finalize) --------------------
  useEffect(() => {
    const a = loadActive();
    if (!a || !a.task) return;
    const planned = Math.max(1, a.plannedMinutes);
    const plannedSec = planned * 60;
    const gapSec = Math.max(0, Math.round((Date.now() - a.lastTickAt) / 1000));
    // If timer was running, credit wall-clock gap towards focusedSeconds.
    const focused = a.running
      ? Math.min(plannedSec, a.focusedSeconds + gapSec)
      : a.focusedSeconds;
    const remainingSec = Math.max(0, plannedSec - focused);

    // Restore draft fields so the UI shows the right task/project
    setTaskState(a.task);
    if (a.projectName) {
      setProjectState({
        id: a.projectId ?? a.projectName,
        name: a.projectName,
        color: a.projectColor ?? "#f4a261",
      });
    }
    if (Array.isArray(a.tags) && a.tags.length > 0) setGoalTextState(String(a.tags[0]));
    setMinutesState(planned);
    setTotal(plannedSec);
    setRemaining(remainingSec);
    focusedRef.current = focused;
    startedAtRef.current = a.startedAt;

    if (remainingSec <= 0) {
      // Session expired while we were away — go straight to the asking screen
      // so the user can choose to log it or add time.
      setEndAt(null);
      setPhase("asking");
    } else if (a.running) {
      const now = Date.now();
      setEndAt(now + remainingSec * 1000);
      lastCheckRef.current = now;
      setPhase("running");
    } else {
      setEndAt(null);
      setPhase("paused");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Actions ------------------------------------------------------------
  /** Internal: start the timer with an explicit duration and kind. */
  const startWith = useCallback(
    (mins: number, kind: BlockKind | null) => {
      const now = Date.now();
      focusedRef.current = 0;
      savedRef.current = false;
      startedAtRef.current = new Date().toISOString();
      currentKindRef.current = kind;
      setEndAt(now + mins * 60 * 1000);
      lastCheckRef.current = now;
      setTotal(mins * 60);
      setRemaining(mins * 60);
      setPhase("running");
      setFlipNonce((n) => n + 1);
    },
    [setEndAt],
  );

  const start = useCallback(() => {
    if (phase !== "idle") return;
    const active = getActiveRhythm();
    if (active) {
      const isBreak = active.block.kind === "break";
      if (!isBreak && !task.trim()) return;
      if (isBreak && !task.trim()) setTaskState("Break");
      startWith(active.block.minutes, active.block.kind);
      return;
    }
    if (!task.trim()) return;
    startWith(minutes, null);
  }, [task, phase, minutes, startWith]);

  const pause = useCallback(() => {
    if (phase === "running") {
      const now = Date.now();
      const delta = Math.max(0, Math.round((now - lastCheckRef.current) / 1000));
      focusedRef.current += delta;
      const r = Math.max(0, Math.ceil((endAtRef.current! - now) / 1000));
      setRemaining(r);
      setEndAt(null);
      setPhase("paused");
    } else if (phase === "paused") {
      const now = Date.now();
      setEndAt(now + remaining * 1000);
      lastCheckRef.current = now;
      setPhase("running");
    }
  }, [phase, remaining, setEndAt]);

  const resetIdle = useCallback(() => {
    setPhase("idle");
    setTaskState("");
    setProjectState(null);
    setGoalTextState(null);
    setMinutesState(90);
    setRemaining(90 * 60);
    setTotal(90 * 60);
    focusedRef.current = 0;
    startedAtRef.current = null;
    setEndAt(null);
  }, [setEndAt]);

  /**
   * Finalize the session: persist immediately to local + remote and show the
   * success/dopamine screen. Post-hoc adjustments happen later from the
   * history lists, not here.
   */
  const finalize = useCallback(() => {
    if (savedRef.current || phase === "complete") return;
    // Capture any ticking time the running interval hasn't credited yet.
    if (phase === "running" && endAtRef.current) {
      const now = Date.now();
      const delta = Math.max(0, Math.round((now - lastCheckRef.current) / 1000));
      focusedRef.current += delta;
      lastCheckRef.current = now;
    }
    savedRef.current = true;
    const wasBreak = currentKindRef.current === "break";
    const startedAt = startedAtRef.current ?? new Date().toISOString();
    const completedAt = new Date().toISOString();
    const plannedMinutes = Math.round(total / 60);
    const focusedMinutes = Math.max(1, Math.round(focusedRef.current / 60));

    if (!wasBreak) {
      const localId = crypto.randomUUID();
      addSession({
        id: localId,
        task: task.trim(),
        plannedMinutes,
        focusedMinutes,
        startedAt,
        completedAt,
        projectId: project?.id,
        projectName: project?.name,
        projectColor: project?.color,
        goalText: goalText ?? undefined,
        tags: goalText ? [goalText] : undefined,
      });
      maybeNotifyGoalReached();
      saveSessionRemote({
        user_id: getUserId(),
        task_name: task.trim(),
        project_tag: project?.name ?? null,
        planned_duration: plannedMinutes,
        actual_duration: focusedMinutes,
        started_at: startedAt,
        completed_at: completedAt,
        was_aborted: false,
        tags: goalText ? [goalText] : undefined,
      })
        .then((res) => {
          if (res && !res.ok && !res.queued) {
            toast.error("Saved locally", {
              description: "This session was kept locally, but the cloud row was rejected.",
            });
          } else if (res && res.queued) {
            toast("Saved locally", {
              description: "Will sync when you sign in or reconnect.",
            });
          }
        })
        .catch((e) => console.error("saveSessionRemote threw:", e));
    }
    setPhase("complete");
    setEndAt(null);
    clearActive();

    // Focus Blocks: seamlessly advance to the next block if one exists.
    const next = getActiveRhythm() ? advanceRhythm() : null;
    if (next) {
      window.setTimeout(() => {
        const isBreak = next.block.kind === "break";
        // Break auto-fills task; focus keeps the user's task (or "Focus" as fallback).
        if (isBreak) setTaskState("Break");
        else if (!task.trim()) setTaskState("Focus");
        startWith(next.block.minutes, next.block.kind);
      }, 900);
    } else {
      currentKindRef.current = null;
      window.setTimeout(resetIdle, 1800);
    }
  }, [phase, task, project, tags, total, resetIdle, setEndAt, startWith]);

  // Rhythm-driven auto-advance: skip the "asking" prompt when the current
  // block was scheduled by an active Focus Blocks rhythm.
  useEffect(() => {
    if (phase === "asking" && currentKindRef.current !== null) {
      finalize();
    }
  }, [phase, finalize]);



  const abort = useCallback(() => {
    setEndAt(null);
    const wasBreak = currentKindRef.current === "break";
    currentKindRef.current = null;
    if (!wasBreak && startedAtRef.current && task.trim() && !savedRef.current) {
      savedRef.current = true;
      const startedAt = startedAtRef.current;
      const completedAt = new Date().toISOString();
      const plannedMinutes = Math.round(total / 60);
      const focusedMinutes = Math.round(focusedRef.current / 60);
      const localId = crypto.randomUUID();
      addSession({
        id: localId,
        task: task.trim(),
        plannedMinutes,
        focusedMinutes,
        startedAt,
        completedAt,
        projectId: project?.id,
        projectName: project?.name,
        projectColor: project?.color,
        tags: tags.length > 0 ? tags : undefined,
      });
      saveSessionRemote({
        user_id: getUserId(),
        task_name: task.trim(),
        project_tag: project?.name ?? null,
        planned_duration: plannedMinutes,
        actual_duration: focusedMinutes,
        started_at: startedAt,
        completed_at: completedAt,
        was_aborted: true,
        tags: tags.length > 0 ? tags : undefined,
      })
        .then((res) => {
          if (res && !res.ok && !res.queued) {
            toast.error("Saved locally", {
              description: "This session was kept locally, but the cloud row was rejected.",
            });
          }
        })
        .catch((e) => console.error("saveSessionRemote threw:", e));
    }
    clearActive();
    resetIdle();
  }, [task, project, tags, total, resetIdle, setEndAt]);

  const addExtra = useCallback(
    (mins: number) => {
      const now = Date.now();
      const cur = endAtRef.current && endAtRef.current > now ? endAtRef.current : now + remaining * 1000;
      setEndAt(cur + mins * 60 * 1000);
      lastCheckRef.current = now;
      setTotal((t) => t + mins * 60);
      setRemaining((r) => r + mins * 60);
      setPhase("running");
    },
    [remaining, setEndAt],
  );

  // ---- Task/project switching: auto-pause if running ----------------------
  const setTask = useCallback(
    (s: string) => {
      if (phase === "running" && s.trim() !== task.trim()) {
        // Auto-pause to prevent inaccurate tracking when switching focus.
        const now = Date.now();
        const delta = Math.max(0, Math.round((now - lastCheckRef.current) / 1000));
        focusedRef.current += delta;
        const r = Math.max(0, Math.ceil((endAtRef.current! - now) / 1000));
        setRemaining(r);
        setEndAt(null);
        setPhase("paused");
        toast("Auto-paused", { description: "Resume to continue focusing." });
      }
      setTaskState(s);
    },
    [phase, task, setEndAt],
  );

  const setProject = useCallback(
    (p: ProjectTag | null) => {
      const changed = (p?.id ?? null) !== (project?.id ?? null);
      if (phase === "running" && changed) {
        const now = Date.now();
        const delta = Math.max(0, Math.round((now - lastCheckRef.current) / 1000));
        focusedRef.current += delta;
        const r = Math.max(0, Math.ceil((endAtRef.current! - now) / 1000));
        setRemaining(r);
        setEndAt(null);
        setPhase("paused");
        toast("Auto-paused", { description: "Project changed mid-session." });
      }
      setProjectState(p);
      // Active session tags are scoped to a project; clear them on switch.
      if (changed) setTagsState([]);
    },
    [phase, project, setEndAt],
  );

  const setMinutes = useCallback((m: number) => {
    setMinutesState(Math.max(1, Math.min(600, m)));
  }, []);

  return (
    <Ctx.Provider
      value={{
        task,
        setTask,
        project,
        setProject,
        tags,
        setTags: setTagsState,
        minutes,
        setMinutes,
        phase,
        remaining,
        total,
        flipNonce,
        endAtMs,
        rhythm,
        blockKind: rhythm ? rhythm.block.kind : null,
        start,
        pause,
        finalize,
        abort,
        addExtra,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
