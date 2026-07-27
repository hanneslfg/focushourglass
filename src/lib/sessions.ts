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
  /**
   * Selected goal for this session (denormalized text so historical
   * sessions still show it if the goal is later deleted). Persisted via
   * the legacy `sessions.tags` text[] column as a single-element array
   * for backward compatibility.
   */
  goalText?: string;
  /** UUID of the selected ProjectGoal at save time. Stable across renames. */
  goalId?: string;
  /** @deprecated Legacy multi-tag storage. Use `goalText`. */
  tags?: string[];
  /** Focus Score 1–100 computed at the moment the session finalized. */
  focusScore?: number;
  /** Number of times the user paused during this session. */
  pauseCount?: number;
  /** Total seconds spent paused during this session. */
  totalPauseSeconds?: number;
}



const KEY = "hourglass.sessions.v1";

function dedupe(list: Session[]): Session[] {
  const byId = new Map<string, Session>();
  const byKey = new Map<string, Session>();
  for (const s of list) {
    if (s.id && byId.has(s.id)) continue;
    const key = `${s.task}|${(s.startedAt ?? "").slice(0, 19)}|${(s.completedAt ?? "").slice(0, 19)}`;
    if (byKey.has(key)) continue;
    if (s.id) byId.set(s.id, s);
    byKey.set(key, s);
  }
  return Array.from(byKey.values());
}

function read(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = safeStorage.getItem(KEY);
    return raw ? dedupe(JSON.parse(raw) as Session[]) : [];
  } catch {
    return [];
  }
}

function write(list: Session[]) {
  safeStorage.setItem(KEY, JSON.stringify(dedupe(list)));
  window.dispatchEvent(new Event("hourglass:sessions"));
}

export function getSessions(): Session[] {
  return dedupe(read()).sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
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

/**
 * All goal texts attributed to a session (may be multi-goal). Falls back to
 * the legacy single `goalText` when `tags` is empty. Deduplicated,
 * case-insensitive.
 */
export function sessionGoalTexts(s: Session): string[] {
  const source = (s.tags && s.tags.length > 0
    ? s.tags
    : s.goalText
      ? [s.goalText]
      : []) as string[];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of source) {
    const clean = String(t ?? "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
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
  goal_id?: string | null;
  focus_score?: number | null;
  pause_count?: number | null;
  total_pause_seconds?: number | null;
}


function remoteRowToSession(r: RemoteRow): Session {
  const name = r.project_tag?.trim() || undefined;
  const projectId = name ? projectIdFromName(name) : undefined;
  const projectColor = name ? colorForProjectName(name) : undefined;

  const cleanTags = Array.isArray(r.tags) ? r.tags.filter(Boolean) : undefined;
  const goalText = cleanTags && cleanTags.length > 0 ? String(cleanTags[0]) : undefined;
  const goalId = typeof r.goal_id === "string" && r.goal_id ? r.goal_id : undefined;

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
    goalText,
    goalId,
    tags: cleanTags,
    focusScore: typeof r.focus_score === "number" ? r.focus_score : undefined,
    pauseCount: typeof r.pause_count === "number" ? r.pause_count : undefined,
    totalPauseSeconds:
      typeof r.total_pause_seconds === "number" ? r.total_pause_seconds : undefined,
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
  const { supabase } = await import("./supabase");
  const { data: userData } = await supabase.auth.getUser().catch(() => ({
    data: { user: null },
  }));
  const authUid = userData?.user?.id;
  if (!authUid) {
    // Without a verified session we cannot safely query by a client-picked
    // user_id via the anon client, so skip remote hydration entirely and
    // let the local cache stand.
    return false;
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", authUid)
    .order("completed_at", { ascending: false });
  if (error) {
    console.error("[sessions] hydrateFromRemote failed:", error.message);
    return false;
  }

  const rows = (data ?? []) as RemoteRow[];
  // Keep completed rows AND any aborted rows that still captured real focus
  // time — auto-saved / auto-completed sessions must not vanish from history.
  const merged = rows
    .filter((r) => !r.was_aborted || (r.actual_duration ?? 0) > 0)
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
