import { safeStorage } from "./safeStorage";
import { addSession } from "./sessions";
import { saveSessionRemote, getUserId } from "./supabase";

const KEY = "hourglass.active_timer.v1";

export interface ActiveTimerState {
  task: string;
  projectId?: string;
  projectName?: string;
  projectColor?: string;
  /** Free-form multi-tags chosen for this session. */
  tags?: string[];
  /** UUID of the selected ProjectGoal (persisted across refresh). */
  goalId?: string;
  plannedMinutes: number;
  startedAt: string; // ISO
  /** Seconds actually focused so far (running time). */
  focusedSeconds: number;
  /** Timestamp (ms) of the last persisted tick. */
  lastTickAt: number;
  /** Whether the timer was running at the time of persistence. */
  running: boolean;
}


export function saveActive(state: ActiveTimerState) {
  if (typeof window === "undefined") return;
  try {
    safeStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

export function loadActive(): ActiveTimerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = safeStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveTimerState) : null;
  } catch {
    return null;
  }
}

export function clearActive() {
  if (typeof window === "undefined") return;
  safeStorage.removeItem(KEY);
}

/**
 * Recover an orphaned active timer (page was refreshed/closed mid-session)
 * by saving it as a COMPLETED session with the elapsed focus time.
 * Idempotent — clears localStorage even if there was nothing to recover.
 */
export async function recoverActiveAsCompleted(): Promise<boolean> {
  const a = loadActive();
  if (!a) return false;
  clearActive();
  const task = a.task?.trim();
  if (!task) return false;

  // If the timer was still running when we last persisted, credit the
  // wall-clock time elapsed since then (capped at the remaining planned
  // duration) so a quick refresh doesn't lose seconds.
  let focusedSeconds = a.focusedSeconds;
  if (a.running) {
    const plannedSeconds = a.plannedMinutes * 60;
    const remaining = Math.max(0, plannedSeconds - focusedSeconds);
    const gap = Math.max(0, Math.round((Date.now() - a.lastTickAt) / 1000));
    focusedSeconds += Math.min(remaining, gap);
  }
  const focusedMinutes = Math.max(0, Math.round(focusedSeconds / 60));
  if (focusedMinutes <= 0) return false;

  const completedAt = new Date(
    new Date(a.startedAt).getTime() + focusedSeconds * 1000,
  ).toISOString();
  const localId = crypto.randomUUID();
  addSession({
    id: localId,
    task,
    plannedMinutes: a.plannedMinutes,
    focusedMinutes,
    startedAt: a.startedAt,
    completedAt,
    projectId: a.projectId,
    projectName: a.projectName,
    projectColor: a.projectColor,
  });
  try {
    await saveSessionRemote({
      user_id: getUserId(),
      task_name: task,
      project_tag: a.projectName ?? null,
      planned_duration: a.plannedMinutes,
      actual_duration: focusedMinutes,
      started_at: a.startedAt,
      completed_at: completedAt,
      was_aborted: false,
    });
  } catch (e) {
    console.error("[activeTimer] recover save failed:", e);
  }
  return true;
}
