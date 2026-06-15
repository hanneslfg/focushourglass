import { toast } from "sonner";
import { effectiveDayKey, getTodayFocusedMinutes, getTodayGoal, todayKey } from "./settings";
import { getSessions } from "./sessions";
import { computeStreaks } from "./streaks";

const KEY = "hourglass.milestones.v1";

interface MilestoneState {
  date: string;
  firedFirst: boolean;
  firedHalf: boolean;
  firedDaily: boolean;
  firedStreaks: number[];
}

const STREAK_MILESTONES = [5, 10, 25, 50, 100, 200, 500];

function read(): MilestoneState {
  if (typeof window === "undefined")
    return { date: todayKey(), firedFirst: false, firedHalf: false, firedDaily: false, firedStreaks: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as MilestoneState;
      if (s.date === todayKey()) return s;
    }
  } catch {
    // ignore
  }
  return { date: todayKey(), firedFirst: false, firedHalf: false, firedDaily: false, firedStreaks: [] };
}

function write(s: MilestoneState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

/**
 * Inspect current session state and fire any unfired milestones.
 * - Daily goal → big celebratory overlay (custom event)
 * - First session of day, halfway, streak {5,10,25,50,…} → bottom toasts
 */
export function checkMilestones() {
  if (typeof window === "undefined") return;
  const state = read();

  const today = todayKey();
  const todaysSessions = getSessions().filter(
    (s) => effectiveDayKey(s.completedAt) === today,
  );
  const done = getTodayFocusedMinutes();
  const goal = getTodayGoal();

  // First session of the day
  if (!state.firedFirst && todaysSessions.length >= 1) {
    state.firedFirst = true;
    toast("First session of the day ✦", {
      description: "Great start. Keep the momentum.",
    });
  }

  // Halfway to daily goal
  if (!state.firedHalf && goal > 0 && done >= goal / 2 && done < goal) {
    state.firedHalf = true;
    toast("Halfway to your daily goal", {
      description: `${done} / ${goal} min focused.`,
    });
  }

  // Daily goal reached → overlay (and suppress halfway re-fire afterward)
  if (!state.firedDaily && goal > 0 && done >= goal) {
    state.firedDaily = true;
    state.firedHalf = true;
    window.dispatchEvent(new CustomEvent("hourglass:milestone:daily"));
  }

  // Session streak milestones
  const { sessionStreak } = computeStreaks();
  for (const m of STREAK_MILESTONES) {
    if (sessionStreak >= m && !state.firedStreaks.includes(m)) {
      state.firedStreaks.push(m);
      toast(`⚡ ${m}-session streak`, {
        description: "Consistency compounds.",
      });
    }
  }

  write(state);
}
