import { effectiveDayKey } from "./settings";
import { getSessions } from "./sessions";

/** Streak milestones (in days) that trigger a celebratory notification. */
export const STREAK_MILESTONES = [5, 10, 100, 200, 300, 400, 600, 700, 800] as const;

/**
 * Number of consecutive days (ending today or yesterday) with at least one
 * completed focus session. If the user has not focused today, the streak is
 * counted through yesterday — it only breaks once a full day is missed.
 */
export function getDailyStreak(): number {
  if (typeof window === "undefined") return 0;
  const days = new Set<string>();
  for (const s of getSessions()) {
    if (s.focusedMinutes <= 0) continue;
    days.add(effectiveDayKey(s.completedAt));
  }
  if (days.size === 0) return 0;

  const today = effectiveDayKey(new Date());
  // Anchor: today if focused today, else yesterday.
  let cursor = new Date(today + "T00:00:00");
  if (!days.has(today)) {
    cursor.setDate(cursor.getDate() - 1);
    const y = effectiveDayKey(cursor);
    if (!days.has(y)) return 0;
  }

  let streak = 0;
  // Walk backwards while each day has a session.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const key = effectiveDayKey(cursor);
    if (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
