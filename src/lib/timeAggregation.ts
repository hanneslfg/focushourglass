/**
 * Reusable focus-time aggregation over Day / Week / Month / Year / All-time.
 *
 * All boundaries are derived from the app's existing day-boundary helpers in
 * `src/lib/settings.ts` (`effectiveDayKey`, `todayKey`, `effectiveToday`,
 * `weekColumnIndex`), so the custom `dayStartHour` cutoff and the configurable
 * `weekStartsOn` setting are honored — no third, divergent definition of "a
 * day" or "a week" is introduced here.
 *
 * Implementation note on timezones: sessions are compared as *day keys*
 * (YYYY-MM-DD strings produced by `effectiveDayKey`), never as raw UTC
 * timestamps. Range boundaries are also expressed as day keys, so comparison
 * is a plain lexicographic string compare and is immune to DST shifts and
 * UTC/local offset bugs.
 */
import { getSessions, type Session } from "./sessions";
import { effectiveDayKey, effectiveToday, todayKey, weekColumnIndex } from "./settings";

export type TimeRange = "day" | "week" | "month" | "year" | "all";

export const TIME_RANGES: TimeRange[] = ["day", "week", "month", "year", "all"];

export const RANGE_LABELS: Record<TimeRange, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
  all: "All-time",
};

function keyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDays(d: Date, delta: number): Date {
  const next = new Date(d.getTime());
  next.setDate(next.getDate() + delta);
  return next;
}

/**
 * Inclusive [startKey, endKey] day-key window for a range, anchored on the
 * user's effective "today". `null` start means unbounded (all-time).
 */
export function rangeBounds(range: TimeRange): { start: string | null; end: string } {
  const end = todayKey();
  const today = effectiveToday(); // local midnight of the effective day
  switch (range) {
    case "day":
      return { start: end, end };
    case "week":
      return { start: keyOf(shiftDays(today, -weekColumnIndex(today))), end };
    case "month":
      return { start: keyOf(new Date(today.getFullYear(), today.getMonth(), 1)), end };
    case "year":
      return { start: keyOf(new Date(today.getFullYear(), 0, 1)), end };
    case "all":
    default:
      return { start: null, end };
  }
}

/** Day key a session is attributed to (the day it was *worked*). */
export function sessionDayKey(s: Session): string {
  return effectiveDayKey(s.startedAt || s.completedAt);
}

/** Total focused minutes within a range. */
export function focusedMinutesInRange(
  range: TimeRange,
  sessions: Session[] = getSessions(),
): number {
  const { start, end } = rangeBounds(range);
  let total = 0;
  for (const s of sessions) {
    const anchor = s.startedAt || s.completedAt;
    if (!anchor) continue;
    const key = effectiveDayKey(anchor);
    if (key > end) continue;
    if (start && key < start) continue;
    total += s.focusedMinutes || 0;
  }
  return total;
}

/**
 * Human formatting tuned per range: minute precision for short windows,
 * whole hours (thousands-separated) from month upwards.
 */
export function formatFocusedMinutes(minutes: number, range: TimeRange): string {
  const mins = Math.max(0, Math.round(minutes));
  if (range === "day" || range === "week") {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }
  const hours = Math.round(mins / 60);
  if (hours === 0) return `${mins}m`;
  return `${hours.toLocaleString("en-US")}h`;
}

/** Short natural-language suffix used in the share text ("this week", …). */
export const RANGE_PHRASES: Record<TimeRange, string> = {
  day: "today",
  week: "this week",
  month: "this month",
  year: "this year",
  all: "in total",
};
