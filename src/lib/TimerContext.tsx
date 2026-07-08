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
import { calculateFocusScore } from "./focusScore";


export type Phase = "idle" | "running" | "paused" | "asking" | "complete";

interface TimerCtx {
  // form / draft state (used when idle)
  task: string;
  setTask: (s: string) => void;
  project: ProjectTag | null;
  setProject: (p: ProjectTag | null) => void;
  /** Selected goal text for this session (denormalized). */
  goalText: string | null;
  /** UUID of the selected goal (or null). Persisted to Supabase as goal_id. */
  goalId: string | null;
  setGoalText: (t: string | null) => void;
  /** Set the active goal by id + text in one atomic update. */
  setGoal: (goal: { id: string; text: string } | null) => void;
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
  const [goalId, setGoalIdState] = useState<string | null>(null);

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
  /** How many times the user paused this session. */
  const pauseCountRef = useRef(0);
  /** Cumulative seconds spent paused this session. */
  const pauseSecondsRef = useRef(0);

  /** Wall-clock ms when the timer entered the paused phase (null when not paused). */
  const pausedAtRef = useRef<number | null>(null);

  /** Auto-complete a session that stayed paused this long (3 hours). */
  const PAUSE_TIMEOUT_MS = 3 * 60 * 60 * 1000;


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
        goalId: goalId ?? undefined,
        plannedMinutes: Math.round(total / 60),
        startedAt: startedAtRef.current,
        focusedSeconds: focusedRef.current,
        lastTickAt: Date.now(),
        running,
      };
      saveActive(state);
    },
    [task, project, goalText, goalId, total],
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
    if (a.goalId) setGoalIdState(a.goalId);

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
      pausedAtRef.current = a.lastTickAt;
      // If the session sat paused for >3h while we were away, auto-complete
      // it with the exact focus time accumulated up to the pause point.
      if (Date.now() - a.lastTickAt > PAUSE_TIMEOUT_MS) {
        // Defer so state has committed before abort() reads it.
        window.setTimeout(() => {
          abortRef.current?.();
          toast("Session auto-completed", {
            description: "Paused for over 3 hours — saved the focus time so far.",
          });
        }, 0);
        return;
      }
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
      pausedAtRef.current = null;
      pauseCountRef.current = 0;
      pauseSecondsRef.current = 0;

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
      pausedAtRef.current = now;
      pauseCountRef.current += 1;
      setPhase("paused");
    } else if (phase === "paused") {
      const now = Date.now();
      if (pausedAtRef.current != null) {
        pauseSecondsRef.current += Math.max(
          0,
          Math.round((now - pausedAtRef.current) / 1000),
        );
      }
      setEndAt(now + remaining * 1000);
      lastCheckRef.current = now;
      pausedAtRef.current = null;
      setPhase("running");
    }
  }, [phase, remaining, setEndAt]);



  const resetIdle = useCallback(() => {
    setPhase("idle");
    setTaskState("");
    setProjectState(null);
    setGoalTextState(null);
    setGoalIdState(null);
    setMinutesState(90);
    setRemaining(90 * 60);
    setTotal(90 * 60);
    focusedRef.current = 0;
    startedAtRef.current = null;
    pausedAtRef.current = null;
    pauseCountRef.current = 0;
    pauseSecondsRef.current = 0;


    setEndAt(null);
  }, [setEndAt]);

  const setGoal = useCallback((goal: { id: string; text: string } | null) => {
    if (!goal) {
      setGoalIdState(null);
      setGoalTextState(null);
      return;
    }
    setGoalIdState(goal.id);
    setGoalTextState(goal.text);
  }, []);


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
    // If finalized straight from the paused phase, credit the ongoing pause
    // interval towards total pause time so the focus score is fair.
    if (phase === "paused" && pausedAtRef.current != null) {
      pauseSecondsRef.current += Math.max(
        0,
        Math.round((Date.now() - pausedAtRef.current) / 1000),
      );
      pausedAtRef.current = null;
    }
    savedRef.current = true;
    const wasBreak = currentKindRef.current === "break";
    const startedAt = startedAtRef.current ?? new Date().toISOString();
    const completedAt = new Date().toISOString();
    const plannedMinutes = Math.round(total / 60);
    const focusedMinutes = Math.max(1, Math.round(focusedRef.current / 60));
    const pauseCount = pauseCountRef.current;
    const totalPauseSeconds = pauseSecondsRef.current;
    // Successful completion = user pressed Complete (phase !== "asking"),
    // or the timer ran out naturally (phase === "asking" implies target hit).
    const isCompletedSuccessfully = phase !== "asking" || focusedRef.current > 0;
    const focusScore = calculateFocusScore(
      plannedMinutes,
      focusedMinutes,
      totalPauseSeconds / 60,
      pauseCount,
      isCompletedSuccessfully,
    );

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
        goalId: goalId ?? undefined,
        tags: goalText ? [goalText] : undefined,
        focusScore,
        pauseCount,
        totalPauseSeconds,
      });
      maybeNotifyGoalReached();
      // Stoic completion notification.
      toast("Block done. Rest completely. Prepare for the next sprint.", {
        description: `Focus Score ${focusScore}/100`,
      });
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
        goal_id: goalId ?? null,
        focus_score: focusScore,
        pause_count: pauseCount,
        total_pause_seconds: totalPauseSeconds,
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
    } else {
      toast("Break over. Reset your mind. Enter the hourglass.");
    }
    setPhase("complete");
    setEndAt(null);
    clearActive();


    // Focus Blocks: cue up the next block. Break blocks auto-start; Focus
    // blocks HALT on the task input so each work block is dedicated to its
    // own "One Thing" — user must define/confirm the task before countdown.
    const next = getActiveRhythm() ? advanceRhythm() : null;
    if (next) {
      const isBreak = next.block.kind === "break";
      if (isBreak) {
        window.setTimeout(() => {
          setTaskState("Break");
          startWith(next.block.minutes, next.block.kind);
        }, 900);
      } else {
        // Reset to idle for the next focus block — user must enter their
        // One Thing and hit start. The rhythm state (block N/M) persists.
        window.setTimeout(() => {
          currentKindRef.current = null;
          savedRef.current = false;
          focusedRef.current = 0;
          startedAtRef.current = null;
          setTaskState("");
          setGoalTextState(null);
          setGoalIdState(null);

          setMinutesState(next.block.minutes);
          setTotal(next.block.minutes * 60);
          setRemaining(next.block.minutes * 60);
          setEndAt(null);
          setPhase("idle");
        }, 900);
      }
    } else {
      currentKindRef.current = null;
      window.setTimeout(resetIdle, 1800);
    }
  }, [phase, task, project, goalText, goalId, total, resetIdle, setEndAt, startWith]);


  // Rhythm-driven auto-advance: skip the "asking" prompt when the current
  // block was scheduled by an active Focus Blocks rhythm.
  useEffect(() => {
    if (phase === "asking" && currentKindRef.current !== null) {
      finalize();
    }
  }, [phase, finalize]);



  const abort = useCallback(() => {
    // Credit any ticking time the interval hasn't picked up yet so the
    // saved `actual_duration` reflects the true focused seconds, not
    // whatever the last tick happened to land on.
    if (currentKindRef.current !== "break" && startedAtRef.current) {
      const now = Date.now();
      const delta = Math.max(0, Math.round((now - lastCheckRef.current) / 1000));
      focusedRef.current += delta;
      lastCheckRef.current = now;
    }
    setEndAt(null);
    const wasBreak = currentKindRef.current === "break";
    currentKindRef.current = null;
    if (!wasBreak && startedAtRef.current && task.trim() && !savedRef.current) {
      savedRef.current = true;
      // Credit any ongoing pause interval towards total pause time.
      if (pausedAtRef.current != null) {
        pauseSecondsRef.current += Math.max(
          0,
          Math.round((Date.now() - pausedAtRef.current) / 1000),
        );
      }
      const startedAt = startedAtRef.current;
      const completedAt = new Date().toISOString();
      const plannedMinutes = Math.round(total / 60);
      const focusedMinutes = Math.max(0, Math.round(focusedRef.current / 60));
      const pauseCount = pauseCountRef.current;
      const totalPauseSeconds = pauseSecondsRef.current;
      const focusScore = calculateFocusScore(
        plannedMinutes,
        focusedMinutes,
        totalPauseSeconds / 60,
        pauseCount,
        false,
      );
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
        goalId: goalId ?? undefined,
        tags: goalText ? [goalText] : undefined,
        focusScore,
        pauseCount,
        totalPauseSeconds,
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
        tags: goalText ? [goalText] : undefined,
        goal_id: goalId ?? null,
        focus_score: focusScore,
        pause_count: pauseCount,
        total_pause_seconds: totalPauseSeconds,
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
    pausedAtRef.current = null;
    pauseCountRef.current = 0;
    pauseSecondsRef.current = 0;
    resetIdle();
  }, [task, project, goalText, goalId, total, resetIdle, setEndAt]);


  // Mirror `abort` into a ref so effects (cold-start recovery, paused
  // auto-complete watchdog) can call the latest version without depending
  // on it and re-subscribing every render.
  const abortRef = useRef(abort);
  useEffect(() => {
    abortRef.current = abort;
  }, [abort]);

  // ---- Paused auto-complete watchdog --------------------------------------
  // If a session stays paused for >3h, save the exact focus time captured
  // up to the pause point and clear the active timer. Also re-checks when
  // the tab becomes visible again after a long background pause.
  useEffect(() => {
    if (phase !== "paused") return;
    if (pausedAtRef.current == null) pausedAtRef.current = Date.now();
    const check = () => {
      const startedAt = pausedAtRef.current;
      if (startedAt == null) return;
      if (Date.now() - startedAt > PAUSE_TIMEOUT_MS) {
        abortRef.current?.();
        toast("Session auto-completed", {
          description: "Paused for over 3 hours — saved the focus time so far.",
        });
      }
    };
    const id = window.setInterval(check, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [phase, PAUSE_TIMEOUT_MS]);


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
      // Active session goal is scoped to a project; clear on switch.
      if (changed) {
        setGoalTextState(null);
        setGoalIdState(null);
      }
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
        goalText,
        goalId,
        setGoalText: setGoalTextState,
        setGoal,

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
