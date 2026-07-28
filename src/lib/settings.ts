import { safeStorage } from "./safeStorage";
import { getSessions } from "./sessions";

const KEY = "hourglass.settings.v1";
const OVERRIDE_KEY = "hourglass.dailyOverride.v1";


export type WeekStart = 0 | 1; // 0 = Sunday, 1 = Monday

export interface Settings {
  soundsEnabled: boolean;
  defaultDailyGoal: number; // minutes
  /** Hour (0-4) at which a new "day" begins for stats purposes. Default 0 (midnight). */
  dayStartHour: number;
  /** Day index that starts the week (0 = Sunday, 1 = Monday). Default 1. */
  weekStartsOn: WeekStart;
  /** Overt-attention warm-up before every session (60s stare-at-center). Default false. */
  warmupEnabled: boolean;
}

const DEFAULTS: Settings = {
  soundsEnabled: true,
  defaultDailyGoal: 180,
  dayStartHour: 0,
  weekStartsOn: 1,
  warmupEnabled: false,
};

export function getSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = safeStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged: Settings = { ...DEFAULTS, ...parsed };
    // Sanitize ranges
    merged.dayStartHour = Math.max(0, Math.min(4, Math.floor(merged.dayStartHour ?? 0)));
    merged.weekStartsOn = (merged.weekStartsOn === 0 ? 0 : 1) as WeekStart;
    return merged;
  } catch {
    return DEFAULTS;
  }
}

export function setSettings(patch: Partial<Settings>) {
  const next = { ...getSettings(), ...patch };
  safeStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("hourglass:settings"));
}

/* ----------------- Effective day / week helpers ----------------- */

/**
 * Returns the local-calendar day key (YYYY-MM-DD) that a timestamp belongs to,
 * accounting for the user's custom `dayStartHour` cutoff. A completion at
 * 01:30 with `dayStartHour = 2` is still part of the previous calendar day.
 */
export function effectiveDayKey(input: Date | string | number): string {
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  const offsetMs = getSettings().dayStartHour * 3600_000;
  const shifted = new Date(d.getTime() - offsetMs);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD for "right now", honoring the dayStartHour cutoff. */
export function todayKey(): string {
  return effectiveDayKey(new Date());
}

/**
 * Returns a Date at local midnight representing the effective "today" anchor
 * for the user. Useful for grid alignment.
 */
export function effectiveToday(): Date {
  const key = todayKey();
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Column index (0-6) for a date within a week that starts on the user's
 * configured `weekStartsOn` day. Mon-first → Mon=0..Sun=6. Sun-first →
 * Sun=0..Sat=6.
 */
export function weekColumnIndex(date: Date): number {
  const start = getSettings().weekStartsOn;
  return (date.getDay() - start + 7) % 7;
}

/** Day-of-week labels ordered by the user's `weekStartsOn` setting. */
export function orderedDowLabels(short = true): string[] {
  const start = getSettings().weekStartsOn;
  const sun = short
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return start === 0 ? sun : [...sun.slice(1), sun[0]];
}

/* ----------------- Today's-goal override ----------------- */

interface DailyOverride {
  date: string;
  minutes: number;
}

export function getTodayOverride(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = safeStorage.getItem(OVERRIDE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as DailyOverride;
    if (o.date !== todayKey()) return null;
    return o.minutes;
  } catch {
    return null;
  }
}

export function setTodayOverride(minutes: number) {
  const o: DailyOverride = { date: todayKey(), minutes };
  safeStorage.setItem(OVERRIDE_KEY, JSON.stringify(o));
  window.dispatchEvent(new Event("hourglass:settings"));
}

export function clearTodayOverride() {
  safeStorage.removeItem(OVERRIDE_KEY);
  window.dispatchEvent(new Event("hourglass:settings"));
}

export function getTodayGoal(): number {
  const override = getTodayOverride();
  if (override != null) return override;
  return getSettings().defaultDailyGoal;
}

export function getTodayFocusedMinutes(): number {
  const tk = todayKey();
  return getSessions()
    .filter((s) => effectiveDayKey(s.startedAt || s.completedAt) === tk)
    .reduce((sum, s) => sum + s.focusedMinutes, 0);
}


/**
 * Kept for backwards compatibility. Milestone celebrations are now fully
 * in-app (see `src/lib/milestones.ts` + `MilestoneOverlay`); we never request
 * or fire browser push notifications.
 */
export function maybeNotifyGoalReached(): boolean {
  return false;
}

export function requestNotificationPermission() {
  // no-op: in-app milestones only.
}
