/** Supabase-backed goals. localStorage is only a read-through mirror. */
import { safeStorage } from "./safeStorage";
import {
  deleteGoalRemote,
  fetchAllGoals,
  insertGoalRemote,
  updateGoalProjectTagRemote,
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
const MASTER_KEY = "__all_goals__";

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

export function getAllGoals(): ProjectGoal[] {
  const bag = readAll();
  const master = bag[MASTER_KEY] ?? [];
  const legacyBuckets = Object.entries(bag)
    .filter(([key]) => key !== MASTER_KEY)
    .flatMap(([, list]) => list);
  const combined = master.length ? master : legacyBuckets;
  return combined.sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt - b.createdAt,
  );
}

export function getProjectGoals(projectId: string): ProjectGoal[] {
  if (!projectId) return [];
  const bag = readAll();
  const master = bag[MASTER_KEY] ?? [];
  const legacy = bag[projectId] ?? [];
  const combined = master.length ? master : legacy;
  const needle = projectId.trim().toLowerCase();
  return combined
    .filter((g) => {
      const tag = (g.projectId ?? "").trim().toLowerCase();
      return !!tag && tag === needle;
    })
    .sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt - b.createdAt,
    );


}

export function getUntaggedGoals(): ProjectGoal[] {
  const bag = readAll();
  const master = bag[MASTER_KEY] ?? [];
  return master
    .filter((g) => !(g.projectId ?? "").trim())
    .sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt - b.createdAt,
    );
}

export function findGoalByText(projectId: string, text: string | undefined | null): ProjectGoal | null {
  if (!projectId || !text) return null;
  const needle = text.trim().toLowerCase();
  if (!needle) return null;
  return getProjectGoals(projectId).find((g) => g.text.trim().toLowerCase() === needle) ?? null;
}


export function isGoalAchieved(goal: ProjectGoal | null | undefined, focusedMinutes: number): boolean {
  if (!goal) return false;
  if (goal.done) return true;
  return goal.targetMinutes > 0 && focusedMinutes >= goal.targetMinutes;
}

export async function addGoal(
  projectId: string,
  text: string,
  opts?: { targetMinutes?: number; color?: string },
): Promise<ProjectGoal | null> {
  const clean = text.trim().slice(0, 140);
  const tagForSave = projectId.trim().toLowerCase();
  if (!tagForSave || !clean) return null;
  const existing = getProjectGoals(tagForSave);
  const maxPos = existing.reduce((m, g) => Math.max(m, g.position ?? 0), -1);
  const draft: ProjectGoal = {
    id: "",
    projectId: tagForSave,
    text: clean,
    targetMinutes: Math.max(0, Math.round(opts?.targetMinutes ?? 0)),
    color: opts?.color || GOAL_COLORS[0],
    done: false,
    position: maxPos + 1,
    createdAt: Date.now(),
  };
  // eslint-disable-next-line no-console
  console.log("[goals] addGoal insert payload", {
    project_tag: draft.projectId,
    text: draft.text,
    target_minutes: draft.targetMinutes,
    color: draft.color,
    position: draft.position,
  });
  const res = await insertGoalRemote(draft);
  if (!res.ok || !res.data) return null;
  const saved = { ...res.data, projectId: res.data.projectId || tagForSave };
  const bag = readAll();
  bag[MASTER_KEY] = [...(bag[MASTER_KEY] ?? []), saved];
  writeAll(bag);
  return saved;
}

export async function backfillUntaggedGoals(projectTag?: string | null): Promise<number> {
  const tagForSave = (projectTag?.trim() || "Uni").toLowerCase();
  const legacyGoals = getUntaggedGoals();
  if (legacyGoals.length === 0) return 0;

  const updated: ProjectGoal[] = [];
  for (const goal of legacyGoals) {
    const res = await updateGoalProjectTagRemote(goal.id, tagForSave);
    if (res.ok && res.data) updated.push({ ...res.data, projectId: tagForSave });
  }
  if (updated.length === 0) return 0;

  const updatesById = new Map(updated.map((g) => [g.id, g]));
  const bag = readAll();
  const master = bag[MASTER_KEY] ?? [];
  bag[MASTER_KEY] = master.map((g) => updatesById.get(g.id) ?? g);
  writeAll(bag);
  return updated.length;
}

export async function updateGoal(
  projectId: string,
  id: string,
  patch: Partial<Omit<ProjectGoal, "id" | "projectId" | "createdAt">>,
): Promise<boolean> {
  const normalizedPatch: Partial<ProjectGoal> = { ...patch };
  if (patch.text !== undefined) normalizedPatch.text = patch.text.trim().slice(0, 140);
  if (patch.targetMinutes !== undefined) {
    normalizedPatch.targetMinutes = Math.max(0, Math.round(Number(patch.targetMinutes) || 0));
  }
  const dbPatch = {
    text: normalizedPatch.text,
    color: normalizedPatch.color,
    done: normalizedPatch.done,
    position: normalizedPatch.position,
    targetMinutes: normalizedPatch.targetMinutes,
  };

  const res = await updateGoalRemote(id, dbPatch);
  if (!res.ok) return false;
  const bag = readAll();
  const key = bag[MASTER_KEY] ? MASTER_KEY : projectId;
  const list = bag[key] ?? [];
  bag[key] = list.map((g) => (g.id === id ? { ...g, ...normalizedPatch } : g));
  writeAll(bag);
  return true;
}

export async function deleteGoal(projectId: string, id: string): Promise<boolean> {
  const res = await deleteGoalRemote(id);
  if (!res.ok) return false;
  const bag = readAll();
  const key = bag[MASTER_KEY] ? MASTER_KEY : projectId;
  bag[key] = (bag[key] ?? []).filter((g) => g.id !== id);
  writeAll(bag);
  return true;
}

/**
 * Reorder active goals — awaits every position update before committing new
 * order to the cache, so a failed write cannot leave a false order on screen.
 */
export async function reorderGoals(projectId: string, orderedIds: string[]): Promise<boolean> {
  const posById = new Map(orderedIds.map((id, i) => [id, i]));
  for (const [id, position] of posById) {
    const res = await updateGoalRemote(id, { position });
    if (!res.ok) return false;
  }
  const bag = readAll();
  const key = bag[MASTER_KEY] ? MASTER_KEY : projectId;
  const list = bag[key] ?? [];
  bag[key] = list.map((g) =>
    posById.has(g.id) ? { ...g, position: posById.get(g.id)! } : g,
  );
  writeAll(bag);
  return true;
}


/**
 * Replace the entire local cache with the authoritative list from Supabase.
 * Safe to call repeatedly; a null result (not signed in / offline) is a
 * no-op so the local cache is preserved for offline use.
 */
export async function hydrateGoalsFromRemote(): Promise<void> {
  const remote = await fetchAllGoals();
  if (!remote) return;
  const bag: Record<string, ProjectGoal[]> = { [MASTER_KEY]: remote };
  writeAll(bag);
}


/** @deprecated no-op — anon broadcasts removed. */
export function ingestRemoteGoals(_projectId: string, _goals: ProjectGoal[]) {}
