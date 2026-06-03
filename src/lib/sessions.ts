export interface Session {
  id: string;
  task: string;
  /** Planned minutes at start (may grow if extra time added). */
  plannedMinutes: number;
  /** Actually focused minutes (seconds-based, rounded). */
  focusedMinutes: number;
  startedAt: string; // ISO
  completedAt: string; // ISO
}

const KEY = "hourglass.sessions.v1";

function read(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session[]) : [];
  } catch {
    return [];
  }
}

function write(list: Session[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("hourglass:sessions"));
}

export function getSessions(): Session[] {
  return read().sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
}

export function addSession(s: Session) {
  write([...read(), s]);
}

export function sessionsByDay(): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const s of read()) {
    const key = s.completedAt.slice(0, 10);
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }
  return map;
}

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
