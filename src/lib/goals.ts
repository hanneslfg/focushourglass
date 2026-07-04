/**
 * Per-project goals / milestones.
 *
 * Each goal has its own color (independent from the project accent) so
 * the user can visually prioritize milestones. Goals are stored locally
 * for instant, offline-safe reads, and cross-device sync piggybacks on
 * the same Supabase Realtime broadcast pattern used for project deletions
 * (see `projects.ts`). Every mutation broadcasts the full goal list for
 * the project so peers converge on the latest state without needing a
 * dedicated table.
 */
import { safeStorage } from "./safeStorage";
import { supabase, getActiveSyncUserId } from "./supabase";

export interface ProjectGoal {
  id: string;
  projectId: string;
  text: string;
  /** Target focus minutes for this milestone (0 = no numeric target). */
  targetMinutes: number;
  /** CSS color (hex) picked from GOAL_COLORS. */
  color: string;
  done: boolean;
  createdAt: number;
}

const KEY = "hourglass.project_goals.v1";

export const GOAL_COLORS = [
  "#f4a261", // orange (default sand)
  "#e9c46a", // amber
  "#2dd4bf", // turquoise
  "#8ecae6", // sky
  "#a3b18a", // sage
  "#bc8cff", // lilac
  "#f472b6", // pink
  "#e5989b", // rose
  "#94a3b8", // slate
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
  return [...list].sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt);
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `g_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function addGoal(projectId: string, text: string, opts?: { targetMinutes?: number; color?: string }): ProjectGoal | null {
  const clean = text.trim().slice(0, 140);
  if (!projectId || !clean) return null;
  const bag = readAll();
  const goal: ProjectGoal = {
    id: newId(),
    projectId,
    text: clean,
    targetMinutes: Math.max(0, Math.round(opts?.targetMinutes ?? 0)),
    color: opts?.color || GOAL_COLORS[0],
    done: false,
    createdAt: Date.now(),
  };
  bag[projectId] = [...(bag[projectId] ?? []), goal];
  writeAll(bag);
  broadcastGoals(projectId, bag[projectId]).catch(() => {});
  return goal;
}

export function updateGoal(projectId: string, id: string, patch: Partial<Omit<ProjectGoal, "id" | "projectId" | "createdAt">>) {
  const bag = readAll();
  const list = bag[projectId] ?? [];
  const next = list.map((g) =>
    g.id === id
      ? {
          ...g,
          ...patch,
          text: patch.text !== undefined ? patch.text.trim().slice(0, 140) : g.text,
          targetMinutes:
            patch.targetMinutes !== undefined
              ? Math.max(0, Math.round(patch.targetMinutes))
              : g.targetMinutes,
        }
      : g,
  );
  bag[projectId] = next;
  writeAll(bag);
  broadcastGoals(projectId, next).catch(() => {});
}

export function deleteGoal(projectId: string, id: string) {
  const bag = readAll();
  const next = (bag[projectId] ?? []).filter((g) => g.id !== id);
  bag[projectId] = next;
  writeAll(bag);
  broadcastGoals(projectId, next).catch(() => {});
}

/** Merge a peer's goal list for a project into local storage. */
export function ingestRemoteGoals(projectId: string, goals: ProjectGoal[]) {
  if (!projectId || !Array.isArray(goals)) return;
  const bag = readAll();
  const clean = goals
    .filter((g) => g && typeof g.id === "string" && typeof g.text === "string")
    .map((g) => ({
      id: String(g.id),
      projectId,
      text: String(g.text).slice(0, 140),
      targetMinutes: Math.max(0, Math.round(Number(g.targetMinutes) || 0)),
      color: typeof g.color === "string" ? g.color : GOAL_COLORS[0],
      done: Boolean(g.done),
      createdAt: Number(g.createdAt) || Date.now(),
    }));
  bag[projectId] = clean;
  writeAll(bag);
}

async function broadcastGoals(projectId: string, goals: ProjectGoal[]) {
  if (typeof window === "undefined") return;
  const uid = await getActiveSyncUserId();
  if (!uid) return;
  const channel = supabase.channel(`hg:goals:${uid}`);
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve();
    });
  });
  await channel.send({
    type: "broadcast",
    event: "goals_updated",
    payload: { projectId, goals, at: Date.now() },
  });
  window.setTimeout(() => supabase.removeChannel(channel), 400);
}
