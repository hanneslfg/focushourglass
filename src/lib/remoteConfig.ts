/** Remote-first CRUD for Supabase-backed app configuration. */
import { supabase } from "./supabase";
import type { ProjectGoal } from "./goals";
import type { Rhythm, RhythmBlock } from "./rhythms";

export interface RemoteResult<T = undefined> {
  ok: boolean;
  error: string | null;
  /** True when there was no signed-in user (RLS would silently reject). */
  notAuthed?: boolean;
  status?: number;
  data?: T;
}

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function describeError(error: SupabaseLikeError | Error | string): string {
  if (typeof error === "string") return error;
  const e = error as SupabaseLikeError;
  return [e.message, e.code && `code=${e.code}`, e.details, e.hint && `hint=${e.hint}`]
    .filter(Boolean)
    .join(" | ") || "Unknown Supabase error";
}

function reportError(op: string, error: SupabaseLikeError | Error | string) {
  const msg = describeError(error);
  console.error(`[remoteConfig] ${op} failed: ${msg}`, error);
  if (typeof window !== "undefined") {
    try {
      window.alert(`Supabase error — ${op}: ${msg}`);
    } catch {
      /* noop */
    }
  }
}

async function currentAuthUid(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user?.id) return data.user.id;
    const session = await supabase.auth.getSession();
    return session.data.session?.user?.id ?? null;
  } catch (error) {
    console.error("[remoteConfig] auth lookup failed", error);
    return null;
  }
}

async function authUid(waitMs = 4000): Promise<string | null> {
  const immediate = await currentAuthUid();
  if (immediate || typeof window === "undefined" || waitMs <= 0) return immediate;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (uid: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
      resolve(uid);
    };
    const timeout = window.setTimeout(() => finish(null), waitMs);
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        finish(null);
        return;
      }
      const uid = session?.user?.id ?? (await currentAuthUid());
      if (uid) finish(uid);
    });
  }).then((uid) => {
    if (!uid) reportError("auth", "No authenticated user loaded; request was not sent");
    return uid;
  });
}

function successStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function firstPositiveBlock(r: Rhythm, kind: "focus" | "break"): number {
  const minutes = r.blocks.find((b) => b.kind === kind)?.minutes ?? 0;
  return Math.max(0, Math.round(Number(minutes) || 0));
}

function isPersistedUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function completedGoal(g: ProjectGoal): ProjectGoal {
  return {
    ...g,
    createdAt: g.createdAt || Date.now(),
  };
}

function rhythmFromDurations(r: RemoteRhythm): Rhythm {
  const focusMin = Math.max(0, Math.round(Number(r.focus_duration ?? 0)));
  const breakMin = Math.max(0, Math.round(Number(r.break_duration ?? 0)));
  const blocks: RhythmBlock[] = [];
  if (focusMin > 0) blocks.push({ id: `${r.id}-focus`, kind: "focus", minutes: focusMin });
  if (breakMin > 0) blocks.push({ id: `${r.id}-break`, kind: "break", minutes: breakMin });
  return { id: r.id, name: r.name, blocks, builtin: false };
}

function goalFromRemote(r: RemoteGoal): ProjectGoal {
  return completedGoal({
    id: r.id,
    projectId: (r.project_tag ?? "").trim(),
    text: r.text,
    targetMinutes: Math.max(0, Math.round(Number(r.target_minutes ?? 0))),
    color: r.color || "#f4a261",
    done: Boolean(r.is_completed),
    position: Number.isFinite(Number(r.position)) ? Number(r.position) : 0,
    createdAt: Date.now(),
    deadline: r.deadline ? String(r.deadline).slice(0, 10) : null,
  });
}

function settingFromRemote(r: RemoteProjectSetting): ProjectSetting {
  return {
    projectTag: r.project_tag,
    color: r.color ?? undefined,
    hidden: Boolean(r.is_deleted),
    longTermGoal: r.long_term_goal ?? null,
  };
}


function goalPayload(
  uid: string,
  g: Pick<ProjectGoal, "text" | "color" | "position" | "done" | "targetMinutes" | "projectId"> & { deadline?: string | null },
) {
  const projectTag = (g.projectId ?? "").trim();
  return {
    user_id: uid,
    text: g.text,
    color: g.color,
    position: Math.max(0, Math.round(Number(g.position) || 0)),
    is_completed: Boolean(g.done),
    target_minutes: Math.max(0, Math.round(Number(g.targetMinutes) || 0)),
    project_tag: projectTag,
    deadline: g.deadline ? String(g.deadline).slice(0, 10) : null,
  };
}

function rhythmPayload(uid: string, r: Rhythm) {
  return {
    user_id: uid,
    name: r.name.trim().slice(0, 80) || "Untitled rhythm",
    focus_duration: firstPositiveBlock(r, "focus"),
    break_duration: firstPositiveBlock(r, "break"),
  };
}

function settingPayload(uid: string, s: Partial<ProjectSetting> & { projectTag: string }) {
  const payload: Record<string, unknown> = {
    user_id: uid,
    project_tag: s.projectTag,
    color: s.color ?? null,
    is_deleted: Boolean(s.hidden),
  };
  if (s.longTermGoal !== undefined) {
    payload.long_term_goal = s.longTermGoal;
  }
  return payload;
}


/* --------------------------- goals --------------------------- */

interface RemoteGoal {
  id: string;
  user_id: string;
  text: string;
  color: string | null;
  position: number | null;
  is_completed: boolean | null;
  target_minutes: number | null;
  project_tag: string | null;
  deadline: string | null;
}


const GOAL_COLUMNS = "id,user_id,text,color,position,is_completed,target_minutes,project_tag,deadline";

export async function fetchAllGoals(): Promise<ProjectGoal[] | null> {
  const uid = await authUid();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("goals")
    .select(GOAL_COLUMNS)
    .eq("user_id", uid)
    .order("position", { ascending: true });
  if (error) {
    reportError("fetchAllGoals", error);
    return null;
  }
  return ((data ?? []) as RemoteGoal[]).map(goalFromRemote);
}

export async function insertGoalRemote(
  g: Pick<ProjectGoal, "text" | "color" | "position" | "done" | "targetMinutes" | "projectId"> & { deadline?: string | null },


): Promise<RemoteResult<ProjectGoal>> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const projectTag = (g.projectId ?? "").trim();
  if (!projectTag) {
    const msg = "Refusing to insert goal without project_tag";
    reportError("insertGoal", msg);
    return { ok: false, error: msg };
  }
  const { data, error, status } = await supabase
    .from("goals")
    .insert(goalPayload(uid, { ...g, projectId: projectTag }))
    .select(GOAL_COLUMNS)
    .single();
  if (error) {
    reportError("insertGoal", error);
    return { ok: false, error: error.message };
  }
  if (!successStatus(status) || !data) {
    const msg = `Unexpected insertGoal status ${status}`;
    reportError("insertGoal", msg);
    return { ok: false, error: msg, status };
  }
  return { ok: true, error: null, status, data: goalFromRemote(data as RemoteGoal) };
}

export async function updateGoalProjectTagRemote(
  id: string,
  projectTag: string,
): Promise<RemoteResult<ProjectGoal>> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const cleanTag = projectTag.trim();
  if (!cleanTag) {
    const msg = "Refusing to update goal with empty project_tag";
    reportError("updateGoalProjectTag", msg);
    return { ok: false, error: msg };
  }
  const { data, error, status } = await supabase
    .from("goals")
    .update({ user_id: uid, project_tag: cleanTag })
    .eq("id", id)
    .eq("user_id", uid)
    .select(GOAL_COLUMNS)
    .maybeSingle();
  if (error) {
    reportError("updateGoalProjectTag", error);
    return { ok: false, error: error.message };
  }
  if (!data) {
    const msg = "No goal row was backfilled; check user_id/RLS for public.goals";
    reportError("updateGoalProjectTag", msg);
    return { ok: false, error: msg, status };
  }
  return { ok: successStatus(status), error: successStatus(status) ? null : `Unexpected status ${status}`, status, data: goalFromRemote(data as RemoteGoal) };
}

export async function updateGoalRemote(
  id: string,
  patch: Partial<Pick<ProjectGoal, "text" | "color" | "done" | "position" | "targetMinutes" | "deadline">>,
): Promise<RemoteResult> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const payload: Record<string, unknown> = {};
  payload.user_id = uid;
  if (patch.text !== undefined) payload.text = patch.text;
  if (patch.color !== undefined) payload.color = patch.color;
  if (patch.done !== undefined) payload.is_completed = patch.done;
  if (patch.position !== undefined) payload.position = patch.position;
  if (patch.targetMinutes !== undefined) {
    payload.target_minutes = Math.max(0, Math.round(Number(patch.targetMinutes) || 0));
  }
  if (patch.deadline !== undefined) {
    payload.deadline = patch.deadline ? String(patch.deadline).slice(0, 10) : null;
  }
  if (Object.keys(payload).length === 1) return { ok: true, error: null };


  const { data, error, status } = await supabase
    .from("goals")
    .update(payload)
    .eq("id", id)
    .eq("user_id", uid)
    .select("id")
    .maybeSingle();
  if (error) {
    reportError("updateGoal", error);
    return { ok: false, error: error.message };
  }
  if (!data) {
    const msg = "No goal row was updated; check user_id/RLS for public.goals";
    reportError("updateGoal", msg);
    return { ok: false, error: msg, status };
  }
  return { ok: successStatus(status), error: successStatus(status) ? null : `Unexpected status ${status}`, status };
}

export async function deleteGoalRemote(id: string): Promise<RemoteResult> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const { data, error, status } = await supabase
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("user_id", uid)
    .select("id")
    .maybeSingle();
  if (error) {
    reportError("deleteGoal", error);
    return { ok: false, error: error.message };
  }
  if (!data) {
    const msg = "No goal row was deleted; check user_id/RLS for public.goals";
    reportError("deleteGoal", msg);
    return { ok: false, error: msg, status };
  }
  return { ok: successStatus(status), error: successStatus(status) ? null : `Unexpected status ${status}`, status };
}

/* --------------------------- custom rhythms --------------------------- */

interface RemoteRhythm {
  id: string;
  user_id: string;
  name: string;
  focus_duration: number | null;
  break_duration: number | null;
}

export async function fetchCustomRhythmsRemote(): Promise<Rhythm[] | null> {
  const uid = await authUid();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("custom_rhythms")
    .select("id,user_id,name,focus_duration,break_duration")
    .eq("user_id", uid)
    .order("name", { ascending: true });
  if (error) {
    reportError("fetchCustomRhythms", error);
    return null;
  }
  return ((data ?? []) as RemoteRhythm[]).map(rhythmFromDurations);
}

export async function upsertRhythmRemote(r: Rhythm): Promise<RemoteResult<Rhythm>> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const payload = rhythmPayload(uid, r);
  if (isPersistedUuid(r.id)) {
    const { data, error, status } = await supabase
      .from("custom_rhythms")
      .update(payload)
      .eq("id", r.id)
      .eq("user_id", uid)
      .select("id,user_id,name,focus_duration,break_duration")
      .maybeSingle();
    if (error) {
      reportError("updateRhythm", error);
      return { ok: false, error: error.message };
    }
    if (data) {
      return { ok: true, error: null, status, data: rhythmFromDurations(data as RemoteRhythm) };
    }
  }

  const { data, error, status } = await supabase
    .from("custom_rhythms")
    .insert(payload)
    .select("id,user_id,name,focus_duration,break_duration")
    .single();
  if (error) {
    reportError("insertRhythm", error);
    return { ok: false, error: error.message };
  }
  if (!successStatus(status) || !data) {
    const msg = `Unexpected insertRhythm status ${status}`;
    reportError("insertRhythm", msg);
    return { ok: false, error: msg, status };
  }
  return { ok: true, error: null, status, data: rhythmFromDurations(data as RemoteRhythm) };
}

export async function deleteRhythmRemote(id: string): Promise<RemoteResult> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const { data, error, status } = await supabase
    .from("custom_rhythms")
    .delete()
    .eq("id", id)
    .eq("user_id", uid)
    .select("id")
    .maybeSingle();
  if (error) {
    reportError("deleteRhythm", error);
    return { ok: false, error: error.message };
  }
  if (!data) {
    const msg = "No rhythm row was deleted; check user_id/RLS for public.custom_rhythms";
    reportError("deleteRhythm", msg);
    return { ok: false, error: msg, status };
  }
  return { ok: successStatus(status), error: successStatus(status) ? null : `Unexpected status ${status}`, status };
}

/* --------------------------- project settings --------------------------- */

export interface ProjectSetting {
  projectTag: string;
  color?: string;
  hidden: boolean;
  longTermGoal?: string | null;
}

interface RemoteProjectSetting {
  user_id: string;
  project_tag: string;
  color: string | null;
  is_deleted: boolean | null;
  long_term_goal?: string | null;
}

const PROJECT_SETTING_COLUMNS = "user_id,project_tag,color,is_deleted,long_term_goal";

export async function fetchProjectSettingsRemote(): Promise<ProjectSetting[] | null> {
  const uid = await authUid();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("project_settings")
    .select(PROJECT_SETTING_COLUMNS)
    .eq("user_id", uid);
  if (error) {
    reportError("fetchProjectSettings", error);
    return null;
  }
  return ((data ?? []) as RemoteProjectSetting[]).map(settingFromRemote);
}


export async function upsertProjectSettingRemote(
  s: Partial<ProjectSetting> & { projectTag: string },
): Promise<RemoteResult<ProjectSetting>> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const { data, error, status } = await supabase
    .from("project_settings")
    .upsert(settingPayload(uid, s), { onConflict: "user_id,project_tag" })
    .select(PROJECT_SETTING_COLUMNS)
    .single();
  if (error) {
    reportError("upsertProjectSetting", error);
    return { ok: false, error: error.message };
  }
  if (!successStatus(status) || !data) {
    const msg = `Unexpected upsertProjectSetting status ${status}`;
    reportError("upsertProjectSetting", msg);
    return { ok: false, error: msg, status };
  }
  return { ok: true, error: null, status, data: settingFromRemote(data as RemoteProjectSetting) };
}
