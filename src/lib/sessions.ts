import { safeStorage } from "./safeStorage";
import { projectIdFromName, colorForProjectName } from "./projects";

export interface Session {
  id: string;
  task: string;
  /** Planned minutes at start (may grow if extra time added). */
  plannedMinutes: number;
  /** Actually focused minutes (seconds-based, rounded). */
  focusedMinutes: number;
  startedAt: string; // ISO
  completedAt: string; // ISO
  /** Optional project tag (denormalized so renaming/deleting a tag doesn't
   * break historical sessions). */
  projectId?: string;
  projectName?: string;
  projectColor?: string;
  /** Free-form multi-tags chosen by the user for this session. */
  tags?: string[];
}

const KEY = "hourglass.sessions.v1";

function read(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = safeStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session[]) : [];
  } catch {
    return [];
  }
}

function write(list: Session[]) {
  safeStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("hourglass:sessions"));
}

export function getSessions(): Session[] {
  return read().sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
}

export function addSession(s: Session) {
  write([...read(), s]);
}

export function removeSession(id: string) {
  write(read().filter((s) => s.id !== id));
}

/** Patch a stored session in place (optimistic local update). */
export function updateSession(id: string, patch: Partial<Session>) {
  write(read().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

function remoteKey(task: string, startedAt: string, completedAt: string): string {
  return `${task}|${startedAt.slice(0, 19)}|${completedAt.slice(0, 19)}`;
}

/**
 * Insert a session from a remote realtime/sync event. Idempotent: skips if a
 * local session already matches by id or by (task, startedAt, completedAt).
 */
export function upsertRemoteSession(s: Session): boolean {
  const list = read();
  const key = remoteKey(s.task, s.startedAt, s.completedAt);
  const exists = list.some(
    (x) => x.id === s.id || remoteKey(x.task, x.startedAt, x.completedAt) === key,
  );
  if (exists) return false;
  write([...list, s]);
  return true;
}

interface RemoteRow {
  id?: string;
  user_id: string;
  task_name: string;
  project_tag: string | null;
  planned_duration: number;
  actual_duration: number;
  started_at: string;
  completed_at: string;
  was_aborted: boolean;
  tags?: string[] | null;
}

function remoteRowToSession(r: RemoteRow): Session {
  const name = r.project_tag?.trim() || undefined;
  const projectId = name ? projectIdFromName(name) : undefined;
  const projectColor = name ? colorForProjectName(name) : undefined;

  return {
    id: r.id ?? crypto.randomUUID(),
    task: r.task_name,
    plannedMinutes: r.planned_duration,
    focusedMinutes: r.actual_duration,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    projectId,
    projectName: name,
    projectColor,
    tags: Array.isArray(r.tags) ? r.tags.filter(Boolean) : undefined,
  };
}

/**
 * Hydrate the local sessions cache from Supabase when authenticated.
 * When a user is signed in we trust the server completely and OVERWRITE
 * the local cache so cross-device updates (mobile → PC) propagate
 * immediately on mount. When no user is signed in this is a no-op and
 * the local cache continues to be the source of truth.
 */
export async function hydrateFromRemote(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const { supabase, publicSupabase, getActiveSyncUserId } = await import("./supabase");
  const { data: sessionData } = await supabase.auth.getSession().catch(() => ({
    data: { session: null },
  }));
  const uid = await getActiveSyncUserId();
  if (!uid) return false;

  const client = sessionData.session ? supabase : publicSupabase;
  const { data, error } = await client
    .from("sessions")
    .select("*")
    .eq("user_id", uid)
    .order("completed_at", { ascending: false });
  if (error) {
    console.error("[sessions] hydrateFromRemote failed:", error.message);
    return false;
  }

  const rows = (data ?? []) as RemoteRow[];
  // Only count completed sessions (skip aborted) for the local cache the UI reads.
  const merged = rows
    .filter((r) => !r.was_aborted)
    .map(remoteRowToSession);
  write(merged);
  return true;
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
