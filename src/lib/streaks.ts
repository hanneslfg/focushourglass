import { effectiveDayKey } from "./settings";
import { getSessions } from "./sessions";
import { consumeFreezeForDay, isDayProtected } from "./streakFreezes";

/** Streak milestones (in days) that trigger a celebratory notification. */
export const STREAK_MILESTONES = [5, 10, 100, 200, 300, 400, 600, 700, 800] as const;

function shiftDay(d: Date, delta: number) {
  const next = new Date(d.getTime());
  next.setDate(next.getDate() + delta);
  return next;
}

/**
 * Number of consecutive days (ending today or yesterday) with at least one
 * completed focus session.
 *
 * "Never miss twice": a single missed day does NOT break the streak as long as
 * the user owns a Streak Freeze — one token is automatically spent and the day
 * is flagged as protected 🧊. The streak only resets to 0 when a day is missed
 * with zero freezes left, or when two days in a row are missed.
 */
export function getDailyStreak(): number {
  if (typeof window === "undefined") return 0;
  const days = new Set<string>();
  for (const s of getSessions()) {
    if (s.focusedMinutes <= 0) continue;
    days.add(effectiveDayKey(s.startedAt || s.completedAt));
  }
  if (days.size === 0) return 0;

  const earliest = [...days].sort()[0];
  const today = effectiveDayKey(new Date());

  // Anchor: today if focused today, else yesterday (today is still "in play").
  let cursor = new Date(today + "T00:00:00");
  if (!days.has(today)) cursor = shiftDay(cursor, -1);

  let streak = 0;
  let missesInRow = 0;

  while (true) {
    const key = effectiveDayKey(cursor);
    if (key < earliest) break;

    if (days.has(key)) {
      streak += 1;
      missesInRow = 0;
    } else {
      // Never spend a freeze before the streak has actually started.
      const protectedDay = isDayProtected(key) || (streak > 0 && consumeFreezeForDay(key));
      if (!protectedDay) break;
      missesInRow += 1;
      // Never miss twice — a second consecutive gap always ends the streak.
      if (missesInRow >= 2) break;
    }
    cursor = shiftDay(cursor, -1);
  }

  return streak;
}
