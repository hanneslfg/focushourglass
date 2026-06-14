import { getSessions } from "./sessions";

const KEY = "hourglass.settings.v1";
const OVERRIDE_KEY = "hourglass.dailyOverride.v1";
const NOTIFIED_KEY = "hourglass.goalNotified.v1";

export interface Settings {
  soundsEnabled: boolean;
  defaultDailyGoal: number; // minutes
}

const DEFAULTS: Settings = {
  soundsEnabled: true,
  defaultDailyGoal: 180,
};

export function getSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

export function setSettings(patch: Partial<Settings>) {
  const next = { ...getSettings(), ...patch };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("hourglass:settings"));
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface DailyOverride {
  date: string;
  minutes: number;
}

export function getTodayOverride(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(OVERRIDE_KEY);
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
  window.localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o));
  window.dispatchEvent(new Event("hourglass:settings"));
}

export function clearTodayOverride() {
  window.localStorage.removeItem(OVERRIDE_KEY);
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
    .filter((s) => s.completedAt.slice(0, 10) === tk)
    .reduce((sum, s) => sum + s.focusedMinutes, 0);
}

/** Returns true if a notification was actually fired for today's goal. */
export function maybeNotifyGoalReached(): boolean {
  if (typeof window === "undefined") return false;
  const goal = getTodayGoal();
  const total = getTodayFocusedMinutes();
  if (total < goal) return false;

  const alreadyNotified = window.localStorage.getItem(NOTIFIED_KEY) === todayKey();
  if (alreadyNotified) return false;

  window.localStorage.setItem(NOTIFIED_KEY, todayKey());

  const hours = Math.floor(goal / 60);
  const mins = goal % 60;
  const label = mins === 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours}h ${mins}m`;
  const body = `You've unlocked ${label} of deep focus today.`;

  if (!("Notification" in window)) return false;
  const send = () => {
    try {
      new Notification("Daily Goal Reached!", { body });
    } catch {
      // ignore
    }
  };
  if (Notification.permission === "granted") {
    send();
    return true;
  }
  if (Notification.permission !== "denied") {
    Notification.requestPermission().then((p) => {
      if (p === "granted") send();
    });
  }
  return true;
}

export function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
