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

/* ----------------- Automatic freeze consumption ----------------- */

/**
 * Days (YYYY-MM-DD keys) that were missed but automatically rescued by
 * spending a Streak Freeze. Stored so the same day never costs twice.
 */
export function getProtectedDays(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = safeStorage.getItem(PROTECTED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((d) => typeof d === "string") : [];
  } catch {
    return [];
  }
}

export function isDayProtected(dayKey: string): boolean {
  return getProtectedDays().includes(dayKey);
}

function markProtected(dayKey: string) {
  const list = getProtectedDays();
  if (list.includes(dayKey)) return;
  list.push(dayKey);
  try {
    safeStorage.setItem(PROTECTED_KEY, JSON.stringify(list.slice(-400)));
  } catch {
    /* ignore */
  }
}

/**
 * Spends one Streak Freeze to rescue a missed day. Returns true when the day
 * is protected (either it already was, or a token was just deducted).
 */
export function consumeFreezeForDay(dayKey: string): boolean {
  if (!dayKey) return false;
  if (isDayProtected(dayKey)) return true;
  const state = readState();
  if (state.count <= 0) return false;
  writeState({ count: state.count - 1 });
  markProtected(dayKey);
  void syncFreezesToCloud();
  return true;
}

/**
 * Best-effort mirror of the freeze balance to the user's profile so it
 * survives device changes. Silently ignored when signed out.
 */
export async function syncFreezesToCloud() {
  if (typeof window === "undefined") return;
  try {
    const { supabase } = await import("./supabase");
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.auth.updateUser({
      data: {
        streak_freezes_count: getFreezeCount(),
        streak_protected_days: getProtectedDays().slice(-60),
      },
    });
  } catch {
    /* offline / signed out */
  }
}

/** Restores the freeze balance from the cloud profile when it is ahead. */
export async function hydrateFreezesFromCloud() {
  if (typeof window === "undefined") return;
  try {
    const { supabase } = await import("./supabase");
    const { data } = await supabase.auth.getUser();
    const meta = data.user?.user_metadata as
      | { streak_freezes_count?: number; streak_protected_days?: string[] }
      | undefined;
    if (!meta || typeof meta.streak_freezes_count !== "number") return;
    const local = readState().count;
    const remote = Math.max(0, Math.min(MAX_FREEZES, meta.streak_freezes_count));
    if (remote !== local) writeState({ count: remote });
    if (Array.isArray(meta.streak_protected_days)) {
      const merged = Array.from(
        new Set([...getProtectedDays(), ...meta.streak_protected_days]),
      );
      safeStorage.setItem(PROTECTED_KEY, JSON.stringify(merged.slice(-400)));
    }
  } catch {
    /* offline / signed out */
  }
}
