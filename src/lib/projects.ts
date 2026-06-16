import { getSessions } from "./sessions";

export interface ProjectTag {
  id: string;
  name: string;
  /** CSS color string (hex). */
  color: string;
}

const KEY = "hourglass.projects.v1";

export const TAG_COLORS = [
  "#d4a373", // sand
  "#e9c46a", // amber
  "#f4a261", // orange
  "#e76f51", // terracotta
  "#9c6644", // umber
  "#a3b18a", // sage
  "#8ecae6", // sky
  "#bc8cff", // lilac
  "#e5989b", // rose
  "#94a3b8", // slate
];

/** Amber / gold accent palette used for auto-assigned project colors. */
const AMBER_PALETTE = [
  "#f4a261", // orange
  "#e9c46a", // amber
  "#d4a373", // sand
  "#e76f51", // terracotta
  "#c98a3c", // dark amber
  "#f5b041", // saffron
  "#b8860b", // dark gold
  "#e0a458", // honey
];

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable id derived from project name so PC/mobile/remote rows agree. */
export function projectIdFromName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
  return slug || `p_${hashString(name).toString(36)}`;
}

/** Deterministic amber/gold color from name hash. */
export function colorForProjectName(name: string): string {
  return AMBER_PALETTE[hashString(name.trim().toLowerCase()) % AMBER_PALETTE.length];
}

function readLocal(): ProjectTag[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ProjectTag[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: ProjectTag[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("hourglass:projects"));
}

/**
 * Returns the union of (a) projects derived from the synced sessions table and
 * (b) locally-created projects that haven't been used yet. Sessions are the
 * source of truth for color/id when both exist — keeps PC and mobile aligned.
 */
export function getProjects(): ProjectTag[] {
  const fromSessions = new Map<string, ProjectTag>();
  for (const s of getSessions()) {
    const name = s.projectName?.trim();
    if (!name) continue;
    const id = projectIdFromName(name);
    if (fromSessions.has(id)) continue;
    fromSessions.set(id, {
      id,
      name,
      color: s.projectColor || colorForProjectName(name),
    });
  }
  // Merge in any local-only projects (not yet used in a session).
  for (const p of readLocal()) {
    const id = projectIdFromName(p.name);
    if (!fromSessions.has(id)) {
      fromSessions.set(id, { ...p, id });
    }
  }
  return [...fromSessions.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function addProject(name: string, color?: string): ProjectTag {
  const trimmed = name.trim().slice(0, 30);
  const id = projectIdFromName(trimmed);
  const existing = getProjects().find((p) => p.id === id);
  if (existing) return existing;
  const tag: ProjectTag = {
    id,
    name: trimmed,
    color: color || colorForProjectName(trimmed),
  };
  writeLocal([...readLocal(), tag]);
  return tag;
}

export function updateProject(id: string, patch: Partial<Omit<ProjectTag, "id">>) {
  writeLocal(readLocal().map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

export function deleteProject(id: string) {
  writeLocal(readLocal().filter((p) => p.id !== id));
}

// Re-broadcast a projects event whenever sessions change so any component
// listening only to `hourglass:projects` still picks up newly-derived tags.
if (typeof window !== "undefined") {
  window.addEventListener("hourglass:sessions", () => {
    window.dispatchEvent(new Event("hourglass:projects"));
  });
}
