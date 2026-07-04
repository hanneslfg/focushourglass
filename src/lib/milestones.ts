import { safeStorage } from "./safeStorage";
import { toast } from "sonner";
import { effectiveDayKey, getTodayFocusedMinutes, getTodayGoal, todayKey } from "./settings";
import { getSessions } from "./sessions";
import { getDailyStreak, STREAK_MILESTONES } from "./streaks";


const KEY = "hourglass.milestones.v1";
const RECORD_KEY = "hourglass.dailyRecord.v1";
const STREAK_KEY = "hourglass.streakMilestones.v1";

interface MilestoneState {
  date: string;
  firedFirst: boolean;
  firedHalf: boolean;
  firedDaily: boolean;
  firedRecord: boolean;
  firedStreaks: number[];
}

interface DailyRecord {
  /** Highest single-day focused minutes ever recorded (excluding today). */
  minutes: number;
  /** YYYY-MM-DD of the day that set the record. */
  date: string;
}



function read(): MilestoneState {
  const empty: MilestoneState = {
    date: todayKey(),
    firedFirst: false,
    firedHalf: false,
    firedDaily: false,
    firedRecord: false,
    firedStreaks: [],
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = safeStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<MilestoneState>;
      if (s.date === todayKey()) {
        return {
          ...empty,
          ...s,
          firedStreaks: Array.isArray(s.firedStreaks) ? s.firedStreaks : [],
        };
      }
    }
  } catch {
    // ignore
  }
  return empty;
}

function write(s: MilestoneState) {
  try {
    safeStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function readRecord(): DailyRecord {
  if (typeof window === "undefined") return { minutes: 0, date: "" };
  try {
    const raw = safeStorage.getItem(RECORD_KEY);
    if (raw) return JSON.parse(raw) as DailyRecord;
  } catch {
    // ignore
  }
  return { minutes: 0, date: "" };
}

function writeRecord(r: DailyRecord) {
  try {
    safeStorage.setItem(RECORD_KEY, JSON.stringify(r));
  } catch {
    // ignore
  }
}

/**
 * Highest cumulative focus time recorded in a single day, EXCLUDING today.
 * Recomputes from full session history so it stays correct after sync.
 */
function computePreviousBest(): DailyRecord {
  const today = todayKey();
  const totals = new Map<string, number>();
  for (const s of getSessions()) {
    const key = effectiveDayKey(s.completedAt);
    if (key === today) continue;
    totals.set(key, (totals.get(key) ?? 0) + s.focusedMinutes);
  }
  let best: DailyRecord = { minutes: 0, date: "" };
  for (const [date, minutes] of totals) {
    if (minutes > best.minutes) best = { minutes, date };
  }
  const stored = readRecord();
  if (stored.minutes > best.minutes) return stored;
  if (best.minutes !== stored.minutes || best.date !== stored.date) {
    writeRecord(best);
  }
  return best;
}

/**
 * Inspect current session state and fire any unfired milestones.
 * - Daily goal → big celebratory overlay (custom event)
 * - New daily record → big celebratory overlay (custom event)
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

  // New all-time daily record → overlay
  const previous = computePreviousBest();
  if (
    !state.firedRecord &&
    previous.minutes > 0 &&
    done > previous.minutes
  ) {
    state.firedRecord = true;
    writeRecord({ minutes: done, date: today });
    window.dispatchEvent(
      new CustomEvent("hourglass:milestone:record", {
        detail: { minutes: done, previous: previous.minutes },
      }),
    );
  }




  write(state);
}
