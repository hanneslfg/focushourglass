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
  /** ISO date string (YYYY-MM-DD) or null. */
  deadline?: string | null;
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

export function getProjectGoals(projectId: string, activeProjectTag?: string): ProjectGoal[] {
  const bag = readAll();
  const master = bag[MASTER_KEY] ?? [];
  const legacy = bag[projectId] ?? [];
  const combined = master.length ? master : legacy;
  const aliases = new Set(
    [activeProjectTag, projectId]
      .map((v) => (v ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (aliases.size === 0) return [];
  return combined
    .filter((g) => {
      const tag = (g.projectId ?? "").trim().toLowerCase();
      return !!tag && aliases.has(tag);
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

export function findGoalByText(projectId: string, text: string | undefined | null, activeProjectTag?: string): ProjectGoal | null {
  if (!projectId || !text) return null;
  const needle = text.trim().toLowerCase();
  if (!needle) return null;
  return getProjectGoals(projectId, activeProjectTag).find((g) => g.text.trim().toLowerCase() === needle) ?? null;
}


export function isGoalAchieved(goal: ProjectGoal | null | undefined, focusedMinutes: number): boolean {
  if (!goal) return false;
  if (goal.done) return true;
  return goal.targetMinutes > 0 && focusedMinutes >= goal.targetMinutes;
}

export async function addGoal(
  projectId: string,
  text: string,
  opts?: { targetMinutes?: number; color?: string; deadline?: string | null },
): Promise<ProjectGoal | null> {
  const clean = text.trim().slice(0, 140);
  const tagForSave = (projectId ?? "").trim();
  if (!tagForSave) {
    // Hard block: a goal without a project association corrupts every
    // project-scoped view. Never let this reach Supabase.
    console.error("[goals] BLOCKED addGoal — missing project id/tag", { text: clean });
    return null;
  }
  if (!clean) return null;
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
    deadline: opts?.deadline?.trim() || null,
  };
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[goals] mutation: insert", {
      projectId: draft.projectId,
      updatedFields: { text: draft.text, targetMinutes: draft.targetMinutes, deadline: draft.deadline },
    });
  }
  const res = await insertGoalRemote(draft);
  if (!res.ok || !res.data) return null;
  const savedTag = (res.data.projectId || "").trim();
  if (!savedTag) {
    console.error("[goals] insert returned a row without project_tag", { goalId: res.data.id });
  }
  const saved = { ...res.data, projectId: savedTag || tagForSave };
  const bag = readAll();
  bag[MASTER_KEY] = [...(bag[MASTER_KEY] ?? []), saved];
  writeAll(bag);
  return saved;
}



/**
 * One-time safety net (app load only): goals that genuinely have NO
 * project_tag get attached to the user's default (first) active project.
 * Never touches goals that already carry a tag, so it can't bundle goals
 * from several projects into whichever project is currently on screen.
 */
export async function repairUntaggedGoals(explicitTarget?: string | null): Promise<number> {
  const legacyGoals = getUntaggedGoals();
  if (legacyGoals.length === 0) return 0;

  let target = (explicitTarget ?? "").trim();
  if (!target) {
    const { getProjects } = await import("./projects");
    target = getProjects()[0]?.name?.trim() ?? "";
  }
  if (!target) {
    console.warn("[goals] untagged goals found but no default project to assign them to", {
      count: legacyGoals.length,
    });
    return 0;
  }
  console.warn("[goals] repairing untagged goals → default project", {
    count: legacyGoals.length,
    project_tag: target,
  });

  const updated: ProjectGoal[] = [];
  for (const goal of legacyGoals) {
    const res = await updateGoalProjectTagRemote(goal.id, target);
    if (res.ok && res.data) updated.push({ ...res.data, projectId: target });
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
  // Defensive: a project re-assignment must never ride along with a
  // content/status update (session end, done toggle, deadline edit…).
  delete (normalizedPatch as Partial<ProjectGoal>).projectId;
  if (patch.text !== undefined) normalizedPatch.text = patch.text.trim().slice(0, 140);
  if (patch.targetMinutes !== undefined) {
    normalizedPatch.targetMinutes = Math.max(0, Math.round(Number(patch.targetMinutes) || 0));
  }
  if (patch.deadline !== undefined) {
    normalizedPatch.deadline = patch.deadline ? String(patch.deadline).trim() || null : null;
  }
  // Targeted, column-scoped patch only — undefined keys are dropped downstream
  // so project_tag / user_id are never rewritten.
  const dbPatch = {
    text: normalizedPatch.text,
    color: normalizedPatch.color,
    done: normalizedPatch.done,
    position: normalizedPatch.position,
    targetMinutes: normalizedPatch.targetMinutes,
    deadline: normalizedPatch.deadline,
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[goals] mutation: update", {
      goalId: id,
      projectId,
      updatedFields: Object.fromEntries(
        Object.entries(dbPatch).filter(([, v]) => v !== undefined),
      ),
    });
  }

  const res = await updateGoalRemote(id, dbPatch);
  if (!res.ok) return false;
  const bag = readAll();
  const key = bag[MASTER_KEY] ? MASTER_KEY : projectId;
  const list = bag[key] ?? [];
  // Preserve the existing projectId explicitly on every local merge.
  bag[key] = list.map((g) => (g.id === id ? { ...g, ...normalizedPatch, projectId: g.projectId } : g));
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

/**
 * Retroactive cascade: after project rename bugs, some goals may still be
 * tagged with a project's slug id (e.g. "uni") or a legacy label that no
 * active project claims. When the tag matches an active project's slug id
 * (case-insensitive), remap it to that project's canonical name so the
 * goal reappears in the UI.
 */
export async function reclaimOrphanedGoals(): Promise<number> {
  const { getProjects, projectIdFromName } = await import("./projects");
  const projects = getProjects();
  if (projects.length === 0) return 0;
  const byNameLower = new Map(projects.map((p) => [p.name.trim().toLowerCase(), p]));
  const byIdLower = new Map(projects.map((p) => [p.id.toLowerCase(), p]));

  const goals = getAllGoals();
  let fixed = 0;
  for (const g of goals) {
    const tag = (g.projectId ?? "").trim();
    if (!tag) continue;
    const lower = tag.toLowerCase();
    if (byNameLower.has(lower) || byIdLower.has(lower)) continue;
    // ONLY a slug-id match is safe. No "sole project" fallback: pulling every
    // unmatched goal into one project is exactly the data-loss bug.
    const match = byIdLower.get(projectIdFromName(tag).toLowerCase());
    if (!match) {
      console.warn("[goals] orphaned goal kept as-is (no safe project match)", {
        goalId: g.id,
        projectId: tag,
      });
      continue;
    }
    const ok = await updateGoalProjectTagRemote(g.id, match.name);
    if (ok.ok) fixed++;
  }
  if (fixed > 0) await hydrateGoalsFromRemote();
  return fixed;
}

/**
 * Manual reclaim: assign every orphaned goal (whose project_tag does not
 * match any active project) to the given target project. Called from the
 * project details view when the user's goals went missing after a rename.
 */
export async function reclaimOrphanedGoalsInto(targetProjectName: string): Promise<number> {
  const target = targetProjectName.trim();
  if (!target) return 0;
  const { getProjects } = await import("./projects");
  const projects = getProjects();
  const byNameLower = new Map(projects.map((p) => [p.name.trim().toLowerCase(), p]));
  const byIdLower = new Map(projects.map((p) => [p.id.toLowerCase(), p]));

  const goals = getAllGoals();
  let fixed = 0;
  for (const g of goals) {
    const tag = (g.projectId ?? "").trim();
    if (!tag) continue;
    const lower = tag.toLowerCase();
    if (byNameLower.has(lower) || byIdLower.has(lower)) continue;
    const ok = await updateGoalProjectTagRemote(g.id, target);
    if (ok.ok) fixed++;
  }
  if (fixed > 0) await hydrateGoalsFromRemote();
  return fixed;
}



/** @deprecated no-op — anon broadcasts removed. */
export function ingestRemoteGoals(_projectId: string, _goals: ProjectGoal[]) {}
