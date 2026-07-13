/**
 * Supabase-backed CRUD for app configuration:
 *  - public.goals              (per-project milestone list)
 *  - public.custom_rhythms     (user-authored focus block chains)
 *  - public.project_settings   (project color + hidden flag, keyed by project_tag)
 *
 * All mutations return { ok, error, notAuthed } so callers can wait for
 * confirmation from Supabase before committing to their local UI state.
 * Optimistic updates are intentionally NOT performed here.
 */
import { supabase } from "./supabase";
import type { ProjectGoal } from "./goals";
import type { Rhythm, RhythmBlock } from "./rhythms";

export interface RemoteResult {
  ok: boolean;
  error: string | null;
  /** True when there was no signed-in user (RLS would silently reject). */
  notAuthed?: boolean;
}

async function authUid(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function reportError(op: string, msg: string) {
  const line = `[${op}] ${msg}`;
  console.error(line);
  if (typeof window !== "undefined") {
    try { window.alert(`Supabase error — ${line}`); } catch { /* noop */ }
  }
}

/* --------------------------- goals --------------------------- */

interface RemoteGoal {
  id: string;
  user_id: string;
  text: string;
  color: string | null;
  is_completed: boolean | null;
  position: number | null;
}

function goalFromRemote(r: RemoteGoal): ProjectGoal {
  return {
    id: r.id,
    projectId: "",
    text: r.text,
    targetMinutes: 0,
    color: r.color || "#f4a261",
    done: Boolean(r.is_completed),
    position: Number.isFinite(Number(r.position)) ? Number(r.position) : 0,
    createdAt: Date.now(),
  };
}

export async function fetchAllGoals(): Promise<ProjectGoal[] | null> {
  const uid = await authUid();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", uid)
    .order("position", { ascending: true });
  if (error) {
    console.warn("[remoteConfig] fetchAllGoals failed:", error.message);
    return null;
  }
  return (data as RemoteGoal[]).map(goalFromRemote);
}

export async function insertGoalRemote(g: ProjectGoal): Promise<RemoteResult> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const { error } = await supabase.from("goals").insert({
    id: g.id,
    user_id: uid,
    text: g.text,
    color: g.color,
    is_completed: g.done,
    position: g.position ?? 0,
  });
  if (error) {
    reportError("insertGoal", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

export async function updateGoalRemote(
  id: string,
  patch: Partial<Pick<ProjectGoal, "text" | "targetMinutes" | "color" | "done" | "position">>,
): Promise<RemoteResult> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const payload: Record<string, unknown> = {};
  if (patch.text !== undefined) payload.text = patch.text;
  if (patch.color !== undefined) payload.color = patch.color;
  if (patch.done !== undefined) payload.is_completed = patch.done;
  if (patch.position !== undefined) payload.position = patch.position;
  if (Object.keys(payload).length === 0) return { ok: true, error: null };
  const { error } = await supabase
    .from("goals")
    .update(payload)
    .eq("id", id)
    .eq("user_id", uid);
  if (error) {
    reportError("updateGoal", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

export async function deleteGoalRemote(id: string): Promise<RemoteResult> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) {
    reportError("deleteGoal", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

/* --------------------------- custom rhythms --------------------------- */

interface RemoteRhythm {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  focus_duration: number | null;
  break_duration: number | null;
  created_at: string;
}

function rhythmFromRemote(r: RemoteRhythm): Rhythm {
  const focusMin = Math.max(0, Math.round(Number(r.focus_duration ?? 0)));
  const breakMin = Math.max(0, Math.round(Number(r.break_duration ?? 0)));
  const blocks: RhythmBlock[] = [];
  if (focusMin > 0) blocks.push({ id: `${r.id}-f`, kind: "focus", minutes: focusMin });
  if (breakMin > 0) blocks.push({ id: `${r.id}-b`, kind: "break", minutes: breakMin });
  return {
    id: r.id,
    name: r.name,
    description: r.description || undefined,
    blocks,
    builtin: false,
  };
}

function rhythmDurations(r: Rhythm): { focus: number; break: number } {
  const focus = r.blocks.find((b) => b.kind === "focus")?.minutes ?? 0;
  const brk = r.blocks.find((b) => b.kind === "break")?.minutes ?? 0;
  return { focus, break: brk };
}

export async function fetchCustomRhythmsRemote(): Promise<Rhythm[] | null> {
  const uid = await authUid();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("custom_rhythms")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[remoteConfig] fetchCustomRhythms failed:", error.message);
    return null;
  }
  return (data as RemoteRhythm[]).map(rhythmFromRemote);
}

export async function upsertRhythmRemote(r: Rhythm): Promise<RemoteResult> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const { focus, break: brk } = rhythmDurations(r);
  const { error } = await supabase
    .from("custom_rhythms")
    .upsert(
      {
        id: r.id,
        user_id: uid,
        name: r.name,
        description: r.description ?? null,
        focus_duration: focus,
        break_duration: brk,
      },
      { onConflict: "id" },
    );
  if (error) {
    reportError("upsertRhythm", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

export async function deleteRhythmRemote(id: string): Promise<RemoteResult> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const { error } = await supabase
    .from("custom_rhythms")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) {
    reportError("deleteRhythm", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

/* --------------------------- project settings --------------------------- */

export interface ProjectSetting {
  projectTag: string;
  name?: string;
  color?: string;
  hidden: boolean;
}

interface RemoteProjectSetting {
  user_id: string;
  project_tag: string;
  name: string | null;
  color: string | null;
  is_deleted: boolean | null;
}

export async function fetchProjectSettingsRemote(): Promise<ProjectSetting[] | null> {
  const uid = await authUid();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("project_settings")
    .select("*")
    .eq("user_id", uid);
  if (error) {
    console.warn("[remoteConfig] fetchProjectSettings failed:", error.message);
    return null;
  }
  return (data as RemoteProjectSetting[]).map((r) => ({
    projectTag: r.project_tag,
    name: r.name ?? undefined,
    color: r.color ?? undefined,
    hidden: Boolean(r.is_deleted),
  }));
}

export async function upsertProjectSettingRemote(
  s: Partial<ProjectSetting> & { projectTag: string },
): Promise<RemoteResult> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const { error } = await supabase.from("project_settings").upsert(
    {
      user_id: uid,
      project_tag: s.projectTag,
      name: s.name ?? null,
      color: s.color ?? null,
      is_deleted: s.hidden ?? false,
    },
    { onConflict: "user_id,project_tag" },
  );
  if (error) {
    reportError("upsertProjectSetting", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}
