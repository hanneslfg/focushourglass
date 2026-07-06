import { safeStorage } from "./safeStorage";
import { getSessions } from "./sessions";


export interface ProjectTag {
  id: string;
  name: string;
  /** CSS color string (hex). */
  color: string;
}

const KEY = "hourglass.projects.v1";
const DELETED_KEY = "hourglass.projects.deleted.v1";

export const TAG_COLORS = [
  "#e9c46a", // amber
  "#f4a261", // orange
  "#e76f51", // terracotta
  "#d4a373", // sand
  "#2dd4bf", // turquoise
  "#5eead4", // mint
  "#a3b18a", // sage
  "#8ecae6", // sky
  "#bc8cff", // lilac
  "#e5989b", // rose
  "#f472b6", // pink
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
    const raw = safeStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ProjectTag[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: ProjectTag[]) {
  safeStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("hourglass:projects"));
}

function readDeleted(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = safeStorage.getItem(DELETED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeDeleted(ids: Set<string>) {
  safeStorage.setItem(DELETED_KEY, JSON.stringify([...ids]));
  window.dispatchEvent(new Event("hourglass:projects"));
}

/**
 * Returns the union of (a) projects derived from the synced sessions table and
 * (b) locally-created projects that haven't been used yet, minus any tags the
 * user has explicitly deleted (tombstones persist so deletions survive refresh
 * and re-derivation from historical sessions).
 */
export function getProjects(): ProjectTag[] {
  const deleted = readDeleted();
  const locals = new Map<string, ProjectTag>();
  for (const p of readLocal()) {
    const id = projectIdFromName(p.name);
    if (deleted.has(id)) continue;
    locals.set(id, { ...p, id });
  }
  const fromSessions = new Map<string, ProjectTag>();
  for (const s of getSessions()) {
    const name = s.projectName?.trim();
    if (!name) continue;
    const id = projectIdFromName(name);
    if (deleted.has(id)) continue;
    if (fromSessions.has(id)) continue;
    // Local (user-edited) color ALWAYS wins over the session-derived one,
    // otherwise a fresh session sync overwrites the user's custom color with
    // whatever color was denormalized on the row (often the deterministic
    // default).
    const localColor = locals.get(id)?.color;
    fromSessions.set(id, {
      id,
      name,
      color: localColor || s.projectColor || colorForProjectName(name),
    });
  }
  // Merge in any local-only projects (not yet used in a session).
  for (const [id, p] of locals) {
    if (!fromSessions.has(id)) fromSessions.set(id, p);
  }
  return [...fromSessions.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function addProject(name: string, color?: string): ProjectTag {
  const trimmed = name.trim().slice(0, 30);
  const id = projectIdFromName(trimmed);
  // Re-adding a previously-deleted tag should resurrect it.
  const deleted = readDeleted();
  if (deleted.has(id)) {
    deleted.delete(id);
    writeDeleted(deleted);
  }
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
  const list = readLocal();
  const existing = list.find((p) => p.id === id);
  if (existing) {
    writeLocal(list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    return;
  }
  // Project was only derived from sessions; materialize a local record so
  // the user's edits (like a custom color) persist across session syncs.
  const derived = getProjects().find((p) => p.id === id);
  if (!derived) return;
  writeLocal([...list, { ...derived, ...patch, id }]);
}

export function deleteProject(id: string) {
  // 1. Remove from the local-only list so it disappears immediately.
  writeLocal(readLocal().filter((p) => p.id !== id));
  // 2. Tombstone the id so it doesn't get re-derived from historical
  //    sessions on the next render / refresh / sync.
  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
  // Cross-device sync via unsigned anon broadcasts was removed because
  // any client holding the public anon key could forge deletions on
  // another user's channel. Peers will pick up the change on next
  // refresh/hydrate from Supabase.
}

/**
 * @deprecated Kept as a no-op for backward compatibility. Cross-device
 * project deletion sync via anon Realtime broadcasts was removed because
 * the payloads were unauthenticated and forgeable.
 */
export function ingestRemoteDeletion(_id: string) {
  // no-op: do not trust unauthenticated broadcast payloads.
}

// Re-broadcast a projects event whenever sessions change so any component
// listening only to `hourglass:projects` still picks up newly-derived tags.
if (typeof window !== "undefined") {
  window.addEventListener("hourglass:sessions", () => {
    window.dispatchEvent(new Event("hourglass:projects"));
  });
}
