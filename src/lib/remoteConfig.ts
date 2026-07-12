/**
 * Supabase-backed CRUD for app configuration:
 *  - public.goals              (per-project milestone list)
 *  - public.custom_rhythms     (user-authored focus block chains)
 *  - public.project_settings   (project color + hidden flag, keyed by project_tag)
 *
 * Assumed schemas (created out-of-band in production):
 *   goals(id uuid pk default gen_random_uuid(), user_id uuid, project_id text,
 *         text text, target_minutes int4 default 0, color text, done bool default false,
 *         created_at timestamptz default now())
 *   custom_rhythms(id text pk, user_id uuid, name text, description text,
 *                  blocks jsonb, created_at timestamptz default now())
 *   project_settings(user_id uuid, project_tag text, name text, color text,
 *                    hidden bool default false, primary key (user_id, project_tag))
 *
 * RLS: each table gates read/write by auth.uid() = user_id.
 *
 * All exports are safe to call unauthenticated: they resolve to no-ops so
 * the app still runs in offline / signed-out mode against localStorage.
 */
import { supabase } from "./supabase";
import type { ProjectGoal } from "./goals";
import type { Rhythm, RhythmBlock } from "./rhythms";
import type { ProjectTag } from "./projects";

async function authUid(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/* --------------------------- goals --------------------------- */

interface RemoteGoal {
  id: string;
  user_id: string;
  project_id: string;
  text: string;
  target_minutes: number | null;
  color: string | null;
  done: boolean | null;
  created_at: string;
}

function goalFromRemote(r: RemoteGoal): ProjectGoal {
  return {
    id: r.id,
    projectId: r.project_id,
    text: r.text,
    targetMinutes: Math.max(0, Math.round(Number(r.target_minutes ?? 0))),
    color: r.color || "#f4a261",
    done: Boolean(r.done),
    createdAt: Date.parse(r.created_at) || Date.now(),
  };
}

export async function fetchAllGoals(): Promise<ProjectGoal[] | null> {
  const uid = await authUid();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", uid);
  if (error) {
    console.warn("[remoteConfig] fetchAllGoals failed:", error.message);
    return null;
  }
  return (data as RemoteGoal[]).map(goalFromRemote);
}

export async function insertGoalRemote(g: ProjectGoal): Promise<void> {
  const uid = await authUid();
  if (!uid) return;
  const { error } = await supabase.from("goals").insert({
    id: g.id,
    user_id: uid,
    project_id: g.projectId,
    text: g.text,
    target_minutes: g.targetMinutes,
    color: g.color,
    done: g.done,
  });
  if (error) console.warn("[remoteConfig] insertGoal failed:", error.message);
}

export async function updateGoalRemote(
  id: string,
  patch: Partial<Pick<ProjectGoal, "text" | "targetMinutes" | "color" | "done">>,
): Promise<void> {
  const uid = await authUid();
  if (!uid) return;
  const payload: Record<string, unknown> = {};
  if (patch.text !== undefined) payload.text = patch.text;
  if (patch.targetMinutes !== undefined) payload.target_minutes = patch.targetMinutes;
  if (patch.color !== undefined) payload.color = patch.color;
  if (patch.done !== undefined) payload.done = patch.done;
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase
    .from("goals")
    .update(payload)
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.warn("[remoteConfig] updateGoal failed:", error.message);
}

export async function deleteGoalRemote(id: string): Promise<void> {
  const uid = await authUid();
  if (!uid) return;
  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.warn("[remoteConfig] deleteGoal failed:", error.message);
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

export async function upsertRhythmRemote(r: Rhythm): Promise<void> {
  const uid = await authUid();
  if (!uid) return;
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
  if (error) console.warn("[remoteConfig] upsertRhythm failed:", error.message);
}


export async function deleteRhythmRemote(id: string): Promise<void> {
  const uid = await authUid();
  if (!uid) return;
  const { error } = await supabase
    .from("custom_rhythms")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.warn("[remoteConfig] deleteRhythm failed:", error.message);
}

/* --------------------------- project settings --------------------------- */

export interface ProjectSetting {
  projectTag: string;   // stable slug id
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
): Promise<void> {
  const uid = await authUid();
  if (!uid) return;
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
  if (error) console.warn("[remoteConfig] upsertProjectSetting failed:", error.message);
}

