/**
 * Per-project goals / milestones — Supabase-backed with a localStorage
 * cache so getters stay synchronous for React components.
 *
 * When signed in:
 *   - `hydrateGoalsFromRemote()` loads the authoritative list from public.goals
 *     and overwrites the local cache.
 *   - Mutations optimistically update the cache and fire-and-forget to
 *     public.goals (insert / update / delete scoped by RLS to auth.uid()).
 *
 * When signed out: cache-only, so the app still works offline.
 */
import { safeStorage } from "./safeStorage";
import {
  deleteGoalRemote,
  fetchAllGoals,
  insertGoalRemote,
  updateGoalRemote,
} from "./remoteConfig";

export interface ProjectGoal {
  id: string;
  projectId: string;
  text: string;
  targetMinutes: number;
  color: string;
  done: boolean;
  position: number;
  createdAt: number;
}


const KEY = "hourglass.project_goals.v1";

export const GOAL_COLORS = [
  "#f4a261", "#e9c46a", "#2dd4bf", "#8ecae6", "#a3b18a",
  "#bc8cff", "#f472b6", "#e5989b", "#94a3b8",
];

function readAll(): Record<string, ProjectGoal[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = safeStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, ProjectGoal[]>) : {};
  } catch {
    return {};
  }
}

function writeAll(bag: Record<string, ProjectGoal[]>) {
  try {
    safeStorage.setItem(KEY, JSON.stringify(bag));
  } catch (e) {
    console.warn("[goals] write failed:", e);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("hourglass:goals"));
  }
}

export function getProjectGoals(projectId: string): ProjectGoal[] {
  if (!projectId) return [];
  const list = readAll()[projectId] ?? [];
  return [...list].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt - b.createdAt,
  );
}

export function findGoalByText(projectId: string, text: string | undefined | null): ProjectGoal | null {
  if (!projectId || !text) return null;
  const needle = text.trim().toLowerCase();
  if (!needle) return null;
  const list = readAll()[projectId] ?? [];
  return list.find((g) => g.text.trim().toLowerCase() === needle) ?? null;
}

export function isGoalAchieved(goal: ProjectGoal | null | undefined, focusedMinutes: number): boolean {
  if (!goal) return false;
  if (goal.done) return true;
  return goal.targetMinutes > 0 && focusedMinutes >= goal.targetMinutes;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `g_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

/**
 * Remote-first: builds the goal locally, awaits Supabase confirmation, and
 * only THEN commits to the cache. Returns the constructed goal synchronously
 * so callers with a stable ID can proceed; UI updates fire on the async
 * success path (or an alert on failure).
 */
export function addGoal(
  projectId: string,
  text: string,
  opts?: { targetMinutes?: number; color?: string },
): ProjectGoal | null {
  const clean = text.trim().slice(0, 140);
  if (!projectId || !clean) return null;
  const existing = readAll()[projectId] ?? [];
  const maxPos = existing.reduce((m, g) => Math.max(m, g.position ?? 0), -1);
  const goal: ProjectGoal = {
    id: newId(),
    projectId,
    text: clean,
    targetMinutes: Math.max(0, Math.round(opts?.targetMinutes ?? 0)),
    color: opts?.color || GOAL_COLORS[0],
    done: false,
    position: maxPos + 1,
    createdAt: Date.now(),
  };
  void (async () => {
    const res = await insertGoalRemote(goal);
    if (res.notAuthed) {
      // Offline / signed-out fallback: keep local write so the app still works.
      const bag = readAll();
      bag[projectId] = [...(bag[projectId] ?? []), goal];
      writeAll(bag);
      return;
    }
    if (!res.ok) return;
    const bag = readAll();
    bag[projectId] = [...(bag[projectId] ?? []), goal];
    writeAll(bag);
  })();
  return goal;
}

export function updateGoal(
  projectId: string,
  id: string,
  patch: Partial<Omit<ProjectGoal, "id" | "projectId" | "createdAt">>,
) {
  const normalizedPatch: Partial<ProjectGoal> = { ...patch };
  if (patch.text !== undefined) normalizedPatch.text = patch.text.trim().slice(0, 140);
  if (patch.targetMinutes !== undefined)
    normalizedPatch.targetMinutes = Math.max(0, Math.round(patch.targetMinutes));
  void (async () => {
    const res = await updateGoalRemote(id, {
      text: normalizedPatch.text,
      targetMinutes: normalizedPatch.targetMinutes,
      color: normalizedPatch.color,
      done: normalizedPatch.done,
      position: normalizedPatch.position,
    });
    if (!res.ok && !res.notAuthed) return;
    const bag = readAll();
    const list = bag[projectId] ?? [];
    bag[projectId] = list.map((g) => (g.id === id ? { ...g, ...normalizedPatch } : g));
    writeAll(bag);
  })();
}

export function deleteGoal(projectId: string, id: string) {
  void (async () => {
    const res = await deleteGoalRemote(id);
    if (!res.ok && !res.notAuthed) return;
    const bag = readAll();
    bag[projectId] = (bag[projectId] ?? []).filter((g) => g.id !== id);
    writeAll(bag);
  })();
}

/**
 * Reorder active goals — awaits every position update before committing new
 * order to the cache, so a failed write cannot leave a false order on screen.
 */
export function reorderGoals(projectId: string, orderedIds: string[]) {
  const posById = new Map(orderedIds.map((id, i) => [id, i]));
  void (async () => {
    let anyFail = false;
    let notAuthed = false;
    for (const [id, position] of posById) {
      const res = await updateGoalRemote(id, { position });
      if (res.notAuthed) notAuthed = true;
      else if (!res.ok) anyFail = true;
    }
    if (anyFail && !notAuthed) return;
    const bag = readAll();
    const list = bag[projectId] ?? [];
    bag[projectId] = list.map((g) =>
      posById.has(g.id) ? { ...g, position: posById.get(g.id)! } : g,
    );
    writeAll(bag);
  })();
}


/**
 * Replace the entire local cache with the authoritative list from Supabase.
 * Safe to call repeatedly; a null result (not signed in / offline) is a
 * no-op so the local cache is preserved for offline use.
 */
export async function hydrateGoalsFromRemote(): Promise<void> {
  const remote = await fetchAllGoals();
  if (!remote) return;
  // Safety net: if the remote returned an empty list but we have local data,
  // treat it as a transient auth/network hiccup (e.g. tab-focus refetch
  // before the session is fully restored) and keep the cached UI intact.
  const local = readAll();
  const localCount = Object.values(local).reduce((n, arr) => n + arr.length, 0);
  if (remote.length === 0 && localCount > 0) return;
  const bag: Record<string, ProjectGoal[]> = {};
  for (const g of remote) {
    (bag[g.projectId] ??= []).push(g);
  }
  writeAll(bag);
}


/** @deprecated no-op — anon broadcasts removed. */
export function ingestRemoteGoals(_projectId: string, _goals: ProjectGoal[]) {}
