import { safeStorage } from "./safeStorage";

/**
 * Milestone progression (in days) for the "Never Miss Twice" reward system.
 * Each milestone reached grants +1 Streak Freeze (capped at MAX_FREEZES).
 */
export const STREAK_PROGRESSION = [
  5, 15, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
] as const;

export const MAX_FREEZES = 3;

const FREEZES_KEY = "hourglass.streakFreezes.v1";
const AWARDED_KEY = "hourglass.streakFreezes.awarded.v1";
const PROTECTED_KEY = "hourglass.streakFreezes.protectedDays.v1";

interface FreezeState {
  count: number;
}

function readState(): FreezeState {
  if (typeof window === "undefined") return { count: 0 };
  try {
    const raw = safeStorage.getItem(FREEZES_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<FreezeState>;
      return { count: Math.max(0, Math.min(MAX_FREEZES, Number(s.count) || 0)) };
    }
  } catch {
    /* ignore */
  }
  return { count: 0 };
}

function writeState(s: FreezeState) {
  try {
    safeStorage.setItem(FREEZES_KEY, JSON.stringify(s));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("hourglass:freezes"));
    }
  } catch {
    /* ignore */
  }
}

function readAwarded(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = safeStorage.getItem(AWARDED_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((n) => typeof n === "number");
    }
  } catch {
    /* ignore */
  }
  return [];
}

function writeAwarded(list: number[]) {
  try {
    safeStorage.setItem(AWARDED_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function getFreezeCount(): number {
  return readState().count;
}

/** Returns the next milestone above the current streak, or null when maxed out. */
export function getNextMilestone(currentStreak: number): number | null {
  for (const m of STREAK_PROGRESSION) {
    if (currentStreak < m) return m;
  }
  return null;
}

/** Returns the previous milestone (floor). Used to compute progress percentage. */
export function getPreviousMilestone(currentStreak: number): number {
  let prev = 0;
  for (const m of STREAK_PROGRESSION) {
    if (currentStreak >= m) prev = m;
    else break;
  }
  return prev;
}

/**
 * Given a streak count, mark any newly-crossed milestones as awarded and grant
 * the corresponding freezes (up to the cap). Returns the list of milestones
 * that were newly awarded on this call so the UI can celebrate.
 */
export function claimMilestones(currentStreak: number): number[] {
  const awarded = readAwarded();
  const newlyHit: number[] = [];
  for (const m of STREAK_PROGRESSION) {
    if (currentStreak >= m && !awarded.includes(m)) {
      newlyHit.push(m);
      awarded.push(m);
    }
  }
  if (newlyHit.length === 0) return [];
  writeAwarded(awarded);
  const state = readState();
  const next = Math.min(MAX_FREEZES, state.count + newlyHit.length);
  writeState({ count: next });
  return newlyHit;
}
