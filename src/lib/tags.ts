/**
 * Project-scoped tag system with persistent global memory.
 *
 * The cleanest source of truth that already syncs across devices is the
 * `sessions.tags` column. Every tag the user ever attached to a session
 * lives there, so deriving the global suggestion pool and the
 * per-project pool from sessions gives us automatic cross-device
 * persistence with no extra schema.
 *
 * Two local-only layers extend that base:
 *  - `MANUAL_KEY` — tags the user added to a project pool before ever
 *    running a session with them. These would otherwise be invisible
 *    on the next device until used.
 *  - `REMOVED_KEY` — tombstones for tags the user removed from a project
 *    pool. Without these, removed tags would reappear after a refresh
 *    because they still live in the historical sessions.
 */
import { getSessions } from "./sessions";
import { safeStorage } from "./safeStorage";

const MANUAL_KEY = "hourglass.project_tags.manual.v1";
const REMOVED_KEY = "hourglass.project_tags.removed.v1";

type Bag = Record<string, string[]>;

function readBag(key: string): Bag {
  if (typeof window === "undefined") return {};
  try {
    const raw = safeStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Bag) : {};
  } catch {
    return {};
  }
}

function writeBag(key: string, bag: Bag) {
  safeStorage.setItem(key, JSON.stringify(bag));
  window.dispatchEvent(new Event("hourglass:tags"));
}

const norm = (t: string) => t.trim();
const lower = (t: string) => norm(t).toLowerCase();

/** Unique tags ever used across every logged session, newest first. */
export function getAllUsedTags(): string[] {
  const seen = new Map<string, string>(); // lower -> display
  for (const s of getSessions()) {
    if (!s.tags) continue;
    for (const t of s.tags) {
      const n = norm(t);
      if (!n) continue;
      const k = lower(n);
      if (!seen.has(k)) seen.set(k, n);
    }
  }
  return [...seen.values()];
}

/** The curated pool of tags available for a given project. */
export function getProjectTags(projectId: string): string[] {
  if (!projectId) return [];
  const manual = readBag(MANUAL_KEY)[projectId] ?? [];
  const removed = new Set((readBag(REMOVED_KEY)[projectId] ?? []).map(lower));
  const seen = new Map<string, string>();
  // Derive from historical sessions for this project.
  for (const s of getSessions()) {
    if (s.projectId !== projectId || !s.tags) continue;
    for (const t of s.tags) {
      const n = norm(t);
      if (!n) continue;
      const k = lower(n);
      if (removed.has(k)) continue;
      if (!seen.has(k)) seen.set(k, n);
    }
  }
  // Add manual entries (deduped).
  for (const t of manual) {
    const n = norm(t);
    if (!n) continue;
    const k = lower(n);
    if (removed.has(k)) continue;
    if (!seen.has(k)) seen.set(k, n);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function addProjectTag(projectId: string, tag: string) {
  const n = norm(tag).slice(0, 24);
  if (!projectId || !n) return;
  const removedBag = readBag(REMOVED_KEY);
  const removed = (removedBag[projectId] ?? []).filter(
    (t) => lower(t) !== lower(n),
  );
  if (removed.length !== (removedBag[projectId] ?? []).length) {
    removedBag[projectId] = removed;
    writeBag(REMOVED_KEY, removedBag);
  }
  const manualBag = readBag(MANUAL_KEY);
  const list = manualBag[projectId] ?? [];
  if (!list.some((t) => lower(t) === lower(n))) {
    manualBag[projectId] = [...list, n];
    writeBag(MANUAL_KEY, manualBag);
  } else {
    // Still broadcast so the UI re-checks derived state.
    window.dispatchEvent(new Event("hourglass:tags"));
  }
}

export function removeProjectTag(projectId: string, tag: string) {
  const n = norm(tag);
  if (!projectId || !n) return;
  // 1. Drop from the manual list.
  const manualBag = readBag(MANUAL_KEY);
  const next = (manualBag[projectId] ?? []).filter(
    (t) => lower(t) !== lower(n),
  );
  manualBag[projectId] = next;
  writeBag(MANUAL_KEY, manualBag);
  // 2. Tombstone so it doesn't get re-derived from past sessions.
  const removedBag = readBag(REMOVED_KEY);
  const list = removedBag[projectId] ?? [];
  if (!list.some((t) => lower(t) === lower(n))) {
    removedBag[projectId] = [...list, n];
    writeBag(REMOVED_KEY, removedBag);
  }
}

// Re-broadcast tags when sessions change so derived pools refresh.
if (typeof window !== "undefined") {
  window.addEventListener("hourglass:sessions", () => {
    window.dispatchEvent(new Event("hourglass:tags"));
  });
}
