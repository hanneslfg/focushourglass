import { getSessions, type Session } from "./sessions";
import { effectiveDayKey } from "./settings";

const CACHE_KEY = "hourglass.streaks.v1";

export interface Streaks {
  dayStreak: number;
  sessionStreak: number;
  lastActivity: string | null; // ISO of most recent completed session
}

function emptyStreaks(): Streaks {
  return { dayStreak: 0, sessionStreak: 0, lastActivity: null };
}

/**
 * Compute streaks from local session history.
 * - Day streak: consecutive effective-day keys ending today (or yesterday if
 *   none today yet) with ≥1 completed session.
 * - Session streak: consecutive completed sessions (newest → oldest) where
 *   each pair is ≤24h apart.
 */
export function computeStreaks(sessions: Session[] = getSessions()): Streaks {
  if (!sessions.length) return emptyStreaks();

  // Newest first
  const sorted = [...sessions].sort((a, b) =>
    a.completedAt < b.completedAt ? 1 : -1,
  );

  // ---- Day streak ----
  const dayKeys = new Set(sorted.map((s) => effectiveDayKey(s.completedAt)));
  const today = effectiveDayKey(new Date());
  const yesterday = effectiveDayKey(new Date(Date.now() - 86_400_000));
  let dayStreak = 0;
  let cursor: Date;
  if (dayKeys.has(today)) {
    cursor = new Date();
  } else if (dayKeys.has(yesterday)) {
    cursor = new Date(Date.now() - 86_400_000);
  } else {
    cursor = new Date(NaN);
  }
  while (!Number.isNaN(cursor.getTime()) && dayKeys.has(effectiveDayKey(cursor))) {
    dayStreak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }

  // ---- Session streak ----
  let sessionStreak = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = new Date(sorted[i].completedAt).getTime();
    const b = new Date(sorted[i + 1].completedAt).getTime();
    if (a - b <= 86_400_000) sessionStreak += 1;
    else break;
  }

  // If the newest session is itself >24h old, the session streak is broken.
  const newest = new Date(sorted[0].completedAt).getTime();
  if (Date.now() - newest > 86_400_000) sessionStreak = 0;

  return {
    dayStreak,
    sessionStreak,
    lastActivity: sorted[0].completedAt,
  };
}

export function getCachedStreaks(): Streaks {
  if (typeof window === "undefined") return emptyStreaks();
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return emptyStreaks();
    return JSON.parse(raw) as Streaks;
  } catch {
    return emptyStreaks();
  }
}

export function refreshStreaks(): Streaks {
  const s = computeStreaks();
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
  return s;
}
