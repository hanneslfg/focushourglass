/**
 * Project tags — colors and hidden (deleted) flags are Supabase-backed via
 * public.project_settings keyed by (user_id, project_tag). The tag list
 * itself is still derived from synced sessions + any explicit new tags the
 * user creates, but visibility and color are authoritative in the DB.
 */
import { safeStorage } from "./safeStorage";
import { getSessions } from "./sessions";
import {
  fetchProjectSettingsRemote,
  upsertProjectSettingRemote,
  type ProjectSetting,
} from "./remoteConfig";

export interface ProjectTag {
  id: string;
  name: string;
  color: string;
}

const KEY = "hourglass.projects.v1";
const SETTINGS_KEY = "hourglass.project_settings.v1";

export const TAG_COLORS = [
  "#e9c46a", "#f4a261", "#e76f51", "#d4a373", "#2dd4bf", "#5eead4",
  "#a3b18a", "#8ecae6", "#bc8cff", "#e5989b", "#f472b6", "#94a3b8",
];

const AMBER_PALETTE = [
  "#f4a261", "#e9c46a", "#d4a373", "#e76f51",
  "#c98a3c", "#f5b041", "#b8860b", "#e0a458",
];

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function projectIdFromName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
  return slug || `p_${hashString(name).toString(36)}`;
}

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

/** Local cache mirror of public.project_settings (keyed by project_tag id). */
function readSettings(): Record<string, ProjectSetting> {
  if (typeof window === "undefined") return {};
  try {
    const raw = safeStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ProjectSetting>) : {};
  } catch {
    return {};
  }
}

function writeSettings(bag: Record<string, ProjectSetting>) {
  safeStorage.setItem(SETTINGS_KEY, JSON.stringify(bag));
  window.dispatchEvent(new Event("hourglass:projects"));
}

async function patchSetting(id: string, patch: Partial<ProjectSetting>): Promise<ProjectSetting | null> {
  const prev = readSettings()[id] ?? { projectTag: id, hidden: false };
  const next: ProjectSetting = { ...prev, ...patch, projectTag: id };
  const res = await upsertProjectSettingRemote(next);
  if (!res.ok || !res.data) return null;
  const bag = readSettings();
  bag[id] = res.data;
  writeSettings(bag);
  return res.data;
}

/**
 * Returns the derived tag list, applying project_settings overrides for
 * color and hidden flag. Rows flagged `hidden = true` are filtered out.
 */
export function getProjects(): ProjectTag[] {
  const settings = readSettings();
  const locals = new Map<string, ProjectTag>();
  for (const p of readLocal()) {
    const id = projectIdFromName(p.name);
    if (settings[id]?.hidden) continue;
    locals.set(id, { ...p, id });
  }
  const merged = new Map<string, ProjectTag>();
  for (const s of getSessions()) {
    const name = s.projectName?.trim();
    if (!name) continue;
    const id = projectIdFromName(name);
    if (settings[id]?.hidden) continue;
    if (merged.has(id)) continue;
    const settingColor = settings[id]?.color;
    const localColor = locals.get(id)?.color;
    merged.set(id, {
      id,
      name,
      color: settingColor || localColor || s.projectColor || colorForProjectName(name),
    });
  }
  for (const [id, p] of locals) {
    if (merged.has(id)) continue;
    const settingColor = settings[id]?.color;
    merged.set(id, settingColor ? { ...p, color: settingColor } : p);
  }
  for (const [id, setting] of Object.entries(settings)) {
    if (setting.hidden || merged.has(id)) continue;
    merged.set(id, {
      id,
      name: id.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      color: setting.color || colorForProjectName(id),
    });
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function addProject(name: string, color?: string): Promise<ProjectTag | null> {
  const trimmed = name.trim().slice(0, 30);
  if (!trimmed) return null;
  const id = projectIdFromName(trimmed);
  const existing = getProjects().find((p) => p.id === id);
  if (existing && !color) return existing;
  const finalColor = color || existing?.color || colorForProjectName(trimmed);
  const tag: ProjectTag = { id, name: trimmed, color: finalColor };
  const saved = await patchSetting(id, { hidden: false, color: finalColor });
  if (!saved) return null;
  const list = readLocal();
  if (!list.some((p) => projectIdFromName(p.name) === id)) {
    writeLocal([...list, tag]);
  }
  return tag;
}

export async function updateProject(id: string, patch: Partial<Omit<ProjectTag, "id">>): Promise<boolean> {
  const saved = await patchSetting(id, { color: patch.color, hidden: false });
  if (!saved) return false;
  const list = readLocal();
  const existing = list.find((p) => projectIdFromName(p.name) === id);
  if (existing) {
    writeLocal(
      list.map((p) =>
        projectIdFromName(p.name) === id ? { ...p, ...patch, id } : p,
      ),
    );
  } else {
    const derived = getProjects().find((p) => p.id === id);
    if (derived) writeLocal([...list, { ...derived, ...patch, id }]);
  }
  return true;
}

export async function deleteProject(id: string): Promise<boolean> {
  const saved = await patchSetting(id, { hidden: true });
  if (!saved) return false;
  writeLocal(readLocal().filter((p) => projectIdFromName(p.name) !== id));
  return true;
}

/** @deprecated anon broadcast removed. */
export function ingestRemoteDeletion(_id: string) {}

/**
 * Replace the local project_settings cache with the authoritative rows
 * from public.project_settings so colors + hidden flags persist across
 * cache clears and devices.
 */
export async function hydrateProjectSettingsFromRemote(): Promise<void> {
  const remote = await fetchProjectSettingsRemote();
  if (!remote) return;
  const bag: Record<string, ProjectSetting> = {};
  for (const r of remote) bag[r.projectTag] = r;
  writeSettings(bag);
}


if (typeof window !== "undefined") {
  window.addEventListener("hourglass:sessions", () => {
    window.dispatchEvent(new Event("hourglass:projects"));
  });
}
