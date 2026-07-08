import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { safeStorage } from "./safeStorage";

const SUPABASE_URL = "https://ujksluqzycmbflqdhczo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Sf6MyvFRTIcSYOtGhh21mw_IAjx2cPl";

// Probe whether the host browser actually allows persistent storage. In some
// in-app browsers (WhatsApp / Instagram / restricted iOS WebViews) accessing
// `window.localStorage` throws synchronously, which would otherwise crash the
// Supabase client at construction time and take the whole React tree down.
function storageAvailable(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const k = "__hg_ls_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

const canPersist = storageAvailable();

// Stash the client on globalThis so HMR reloads, duplicate module resolutions,
// and any lingering imports all share ONE GoTrueClient. Multiple instances
// share the same storage key and race each other, wiping in-progress state
// (like project color overrides) right after a session sync.
const GLOBAL_KEY = "__hourglass_supabase_client__";
type GlobalWithSupabase = typeof globalThis & { [GLOBAL_KEY]?: SupabaseClient };
const g = globalThis as GlobalWithSupabase;

export const supabase: SupabaseClient =
  g[GLOBAL_KEY] ??
  (g[GLOBAL_KEY] = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: safeStorage as unknown as Storage,
      persistSession: canPersist,
      autoRefreshToken: canPersist,
      detectSessionInUrl: true,
      storageKey: "hourglass.sb.auth.v1",
    },
  }));

/**
 * Public/sessionless reads previously used a second GoTrue client, which
 * triggered "Multiple GoTrueClient instances detected" and fought the main
 * client for the same storage key. It's the same anon key either way, so
 * alias to the single global instance.
 */
export const publicSupabase: SupabaseClient = supabase;

const USER_KEY = "hourglass.user_id.v1";

export function getUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = safeStorage.getItem(USER_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `anon_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      safeStorage.setItem(USER_KEY, id);
    }
    return id;
  } catch (e) {
    console.warn("[supabase] getUserId fell back to ephemeral anon id:", e);
    return `anon_${Math.random().toString(36).slice(2)}`;
  }
}

export function setUserId(id: string) {
  if (typeof window === "undefined") return;
  safeStorage.setItem(USER_KEY, id);
}


/** Reassign all rows owned by `fromId` to `toId`. Safe to call repeatedly. */
export async function migrateSessions(fromId: string, toId: string) {
  if (!fromId || !toId || fromId === toId) return;
  const { error, data } = await supabase
    .from("sessions")
    .update({ user_id: toId })
    .eq("user_id", fromId)
    .select();
  if (error) {
    console.error("[supabase] migrateSessions failed:", error);
  } else {
    console.log(`[supabase] migrated ${data?.length ?? 0} sessions ${fromId} → ${toId}`);
  }
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) console.error("[supabase] signInWithGoogle failed:", error);
}

export async function signOut() {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn("[supabase] signOut threw:", e);
  }
  // Generate a fresh anon id so the next session isn't attributed to the
  // previous user.
  safeStorage.removeItem(USER_KEY);
  getUserId();
}

export interface RemoteSession {
  user_id: string;
  task_name: string;
  project_tag: string | null;
  planned_duration: number; // minutes
  actual_duration: number; // minutes
  started_at: string; // ISO
  completed_at: string; // ISO
  was_aborted: boolean;
  /** Free-form multi-tags for this session. Stored as text[] in Supabase. */
  tags?: string[];
  /** UUID of the selected ProjectGoal, or null if none. */
  goal_id?: string | null;
  /** Focus Score 1–100 computed at finalize time. */
  focus_score?: number | null;
  /** Number of pauses during the session. */
  pause_count?: number | null;
  /** Total seconds spent paused. */
  total_pause_seconds?: number | null;
}

const PENDING_KEY = "hourglass.pending_sessions.v1";
const TAGS_COLUMN_DISABLED_KEY = "hourglass.sessions.tags_column_disabled.v1";
const GOAL_ID_COLUMN_DISABLED_KEY = "hourglass.sessions.goal_id_column_disabled.v1";
const FOCUS_SCORE_COLUMN_DISABLED_KEY = "hourglass.sessions.focus_score_column_disabled.v1";

type SessionInsertPayload = {
  user_id: string;
  task_name: string;
  project_tag: string | null;
  planned_duration: number;
  actual_duration: number;
  started_at: string;
  completed_at: string;
  was_aborted: boolean;
  tags?: string[];
  goal_id?: string | null;
  focus_score?: number | null;
  pause_count?: number | null;
  total_pause_seconds?: number | null;
};




function cleanText(value: unknown, fallback = "Untitled session"): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text.slice(0, 240) : fallback;
}

function cleanIso(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function cleanMinutes(value: unknown, min = 0): number {
  const rounded = Math.round(Number(value));
  return Number.isFinite(rounded) ? Math.max(min, rounded) : min;
}

function cleanTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const tags = value
    .map((tag) => String(tag ?? "").trim())
    .filter((tag) => {
      if (!tag || seen.has(tag.toLowerCase())) return false;
      seen.add(tag.toLowerCase());
      return true;
    })
    .slice(0, 24);
  return tags.length > 0 ? tags : undefined;
}

function tagsColumnDisabled(): boolean {
  if (typeof window === "undefined") return false;
  return safeStorage.getItem(TAGS_COLUMN_DISABLED_KEY) === "1";
}

function disableTagsColumn() {
  if (typeof window === "undefined") return;
  safeStorage.setItem(TAGS_COLUMN_DISABLED_KEY, "1");
}

function goalIdColumnDisabled(): boolean {
  if (typeof window === "undefined") return false;
  return safeStorage.getItem(GOAL_ID_COLUMN_DISABLED_KEY) === "1";
}

function disableGoalIdColumn() {
  if (typeof window === "undefined") return;
  safeStorage.setItem(GOAL_ID_COLUMN_DISABLED_KEY, "1");
}

function focusScoreColumnDisabled(): boolean {
  if (typeof window === "undefined") return false;
  return safeStorage.getItem(FOCUS_SCORE_COLUMN_DISABLED_KEY) === "1";
}

function disableFocusScoreColumn() {
  if (typeof window === "undefined") return;
  safeStorage.setItem(FOCUS_SCORE_COLUMN_DISABLED_KEY, "1");
}

function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined,
  column: string,
) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "PGRST204" && message.includes(column) && message.includes("column");
}

function isPermanentBadPayloadError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  // Missing-column errors are handled by retry-without-column, so exclude them here.
  if (
    isMissingColumnError(error, "tags") ||
    isMissingColumnError(error, "goal_id") ||
    isMissingColumnError(error, "focus_score") ||
    isMissingColumnError(error, "pause_count") ||
    isMissingColumnError(error, "total_pause_seconds")
  )
    return false;
  return error.code === "PGRST204" || error.code === "22P02" || error.code === "23502";
}


function readPending(): RemoteSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = safeStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as RemoteSession[]) : [];
  } catch {
    return [];
  }
}

function writePending(list: RemoteSession[]) {
  if (typeof window === "undefined") return;
  try {
    safeStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("[supabase] writePending failed:", e);
  }
}


function queuePending(s: RemoteSession) {
  const list = readPending();
  list.push(s);
  writePending(list);
  console.warn(
    `[supabase] queued session in localStorage (pending=${list.length}). Will sync on next auth.`,
  );
}

function buildPayload(
  s: RemoteSession,
  userId: string,
  opts: { includeTags?: boolean; includeGoalId?: boolean; includeFocusScore?: boolean } = {},
): SessionInsertPayload {
  const includeTags = opts.includeTags ?? !tagsColumnDisabled();
  const includeGoalId = opts.includeGoalId ?? !goalIdColumnDisabled();
  const includeFocusScore = opts.includeFocusScore ?? !focusScoreColumnDisabled();
  const projectTag = typeof s.project_tag === "string" && s.project_tag.trim()
    ? s.project_tag.trim().slice(0, 120)
    : null;
  const payload: SessionInsertPayload = {
    user_id: cleanText(userId, getUserId()),
    task_name: cleanText(s.task_name),
    // The current sessions table stores the denormalized project label here;
    // if a project was deleted or its id is stale, keep this nullable.
    project_tag: projectTag,
    planned_duration: cleanMinutes(s.planned_duration, 1),
    actual_duration: cleanMinutes(s.actual_duration, 0),
    started_at: cleanIso(s.started_at),
    completed_at: cleanIso(s.completed_at),
    was_aborted: Boolean(s.was_aborted),
  };
  const tags = cleanTags(s.tags);
  if (includeTags && tags) payload.tags = tags;
  if (includeGoalId) {
    // Explicit null when no goal is selected — never undefined or "".
    const raw = typeof s.goal_id === "string" ? s.goal_id.trim() : "";
    payload.goal_id = raw.length > 0 ? raw : null;
  }
  if (includeFocusScore) {
    payload.focus_score =
      typeof s.focus_score === "number" && Number.isFinite(s.focus_score)
        ? Math.max(1, Math.min(100, Math.round(s.focus_score)))
        : null;
    payload.pause_count =
      typeof s.pause_count === "number" && Number.isFinite(s.pause_count)
        ? Math.max(0, Math.round(s.pause_count))
        : null;
    payload.total_pause_seconds =
      typeof s.total_pause_seconds === "number" && Number.isFinite(s.total_pause_seconds)
        ? Math.max(0, Math.round(s.total_pause_seconds))
        : null;
  }
  return payload;
}

async function insertSessionPayload(
  client: typeof supabase,
  session: RemoteSession,
  userId: string,
  options: { select?: boolean } = {},
) {
  let payload = buildPayload(session, userId);
  const query = () => {
    const request = client.from("sessions").insert(payload);
    return options.select ? request.select() : request;
  };

  let { data, error } = await query();
  // Gracefully degrade if the sessions table hasn't been migrated to include
  // one or more of the optional columns yet. Retry per missing column.
  for (const col of ["focus_score", "pause_count", "total_pause_seconds"] as const) {
    if (isMissingColumnError(error, col) && col in payload) {
      console.warn(`[supabase] sessions.${col} column missing; retrying without focus-score columns.`, error);
      disableFocusScoreColumn();
      payload = buildPayload(session, userId, { includeFocusScore: false });
      ({ data, error } = await query());
      break;
    }
  }
  if (isMissingColumnError(error, "goal_id") && "goal_id" in payload) {
    console.warn("[supabase] sessions.goal_id column missing; retrying without goal_id.", error);
    disableGoalIdColumn();
    payload = buildPayload(session, userId, { includeGoalId: false });
    ({ data, error } = await query());
  }
  if (isMissingColumnError(error, "tags") && "tags" in payload) {
    console.warn("[supabase] sessions.tags column missing; retrying without tags.", error);
    disableTagsColumn();
    payload = buildPayload(session, userId, {
      includeTags: false,
      includeGoalId: !goalIdColumnDisabled(),
      includeFocusScore: !focusScoreColumnDisabled(),
    });
    ({ data, error } = await query());
  }

  return { data, error, payload };
}



export async function getActiveSyncUserId(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const sessionUserId = data.session?.user?.id;
    if (sessionUserId) {
      setUserId(sessionUserId);
      return sessionUserId;
    }
  } catch {
    // Session restoration may be temporarily unavailable; fall back below.
  }
  return getUserId();
}

/**
 * Save a session to Supabase if the user is authenticated, otherwise queue
 * it in localStorage so it can be flushed once the user signs in.
 *
 * If inserts always fail with an RLS error like
 *   "new row violates row-level security policy"
 * add this policy in the Supabase dashboard (Database → sessions → Policies):
 *
 *   CREATE POLICY "Users can insert their own sessions"
 *     ON public.sessions FOR INSERT TO authenticated
 *     WITH CHECK (auth.uid() = user_id);
 *
 * (Plus matching SELECT/UPDATE/DELETE policies scoped to auth.uid() = user_id.)
 */
export async function saveSessionRemote(s: RemoteSession) {
  let authUserId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    authUserId = data.user?.id ?? null;
  } catch {
    // fall through — treat as unauthenticated
  }

  if (!authUserId) {
    // Anonymous / signed-out users no longer write to Supabase. The public
    // anon client would let anyone pick a `user_id` and insert rows for it,
    // so queue locally and flush after real sign-in when auth.uid() ==
    // user_id is enforced by RLS.
    queuePending(s);
    return { ok: false, queued: true, error: "not-authenticated" } as const;
  }

  try {
    const { data, error, payload } = await insertSessionPayload(supabase, s, authUserId, { select: true });
    if (error) {
      console.error("Failing payload:", payload);
      console.error("[supabase] saveSession failed:", error.message, error);
      if (
        error.message?.toLowerCase().includes("row-level security") ||
        error.code === "42501"
      ) {
        console.error(
          "[supabase] ⚠ RLS BLOCKER: Add an INSERT policy on public.sessions for authenticated users (see saveSessionRemote docs).",
        );
      }
      if (isPermanentBadPayloadError(error)) {
        console.error("[supabase] Dropping invalid session payload instead of retrying forever.");
        return { ok: false, queued: false, error: error.message } as const;
      }
      queuePending(s);
      return { ok: false, queued: true, error: error.message } as const;
    }
    console.log("[supabase] saveSession OK", data);
    return { ok: true, queued: false } as const;
  } catch (e) {
    console.error("[supabase] saveSession threw:", e);
    queuePending(s);
    return { ok: false, queued: true, error: String(e) } as const;
  }
}


/**
 * Update a previously saved session's `actual_duration`. Matches by row id
 * first; falls back to (user_id, started_at, task_name) when the local id
 * predates a Supabase round-trip (newly added sessions hold a local UUID
 * until the next hydrate).
 */
export async function updateSessionMinutesRemote(opts: {
  id?: string;
  startedAt: string;
  taskName: string;
  actualMinutes: number;
}): Promise<{ ok: boolean }> {
  let authUserId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    authUserId = data.user?.id ?? null;
  } catch (e) {
    console.error("[supabase] updateSessionMinutes: auth threw:", e);
  }
  if (!authUserId) return { ok: false };

  const patch = { actual_duration: Math.max(1, Math.round(opts.actualMinutes)) };
  try {
    if (opts.id) {
      const { data, error } = await supabase
        .from("sessions")
        .update(patch)
        .eq("id", opts.id)
        .eq("user_id", authUserId)
        .select();
      if (!error && data && data.length > 0) return { ok: true };
    }
    const { error: err2 } = await supabase
      .from("sessions")
      .update(patch)
      .eq("user_id", authUserId)
      .eq("started_at", opts.startedAt)
      .eq("task_name", opts.taskName);
    if (err2) {
      console.error("[supabase] updateSessionMinutes fallback failed:", err2.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error("[supabase] updateSessionMinutes threw:", e);
    return { ok: false };
  }
}

/**
 * Assign / unassign a goal on a previously saved session. Sets both the
 * canonical `goal_id` column (when the schema has it) and the legacy `tags`
 * text[] mirror so historical rows and older clients stay in sync. Passing
 * `goalId: null` (with `goalText: null`) clears the goal. Match strategy
 * mirrors `updateSessionMinutesRemote`.
 */
export async function updateSessionGoalRemote(opts: {
  id?: string;
  startedAt: string;
  taskName: string;
  goalId: string | null;
  goalText: string | null;
}): Promise<{ ok: boolean }> {
  let authUserId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    authUserId = data.user?.id ?? null;
  } catch (e) {
    console.error("[supabase] updateSessionGoal: auth threw:", e);
  }
  if (!authUserId) return { ok: false };

  const cleanText =
    typeof opts.goalText === "string" && opts.goalText.trim()
      ? opts.goalText.trim().slice(0, 140)
      : null;
  const cleanId =
    typeof opts.goalId === "string" && opts.goalId.trim() ? opts.goalId.trim() : null;

  const buildPatch = (includeGoalId: boolean, includeTags: boolean) => {
    const patch: Record<string, unknown> = {};
    if (includeGoalId && !goalIdColumnDisabled()) patch.goal_id = cleanId;
    if (includeTags && !tagsColumnDisabled()) patch.tags = cleanText ? [cleanText] : [];
    return patch;
  };

  const runUpdate = async (patch: Record<string, unknown>) => {
    if (opts.id) {
      const { data, error } = await supabase
        .from("sessions")
        .update(patch)
        .eq("id", opts.id)
        .eq("user_id", authUserId!)
        .select();
      if (error) return { error, data: null };
      if (data && data.length > 0) return { error: null, data };
    }
    const { data, error } = await supabase
      .from("sessions")
      .update(patch)
      .eq("user_id", authUserId!)
      .eq("started_at", opts.startedAt)
      .eq("task_name", opts.taskName)
      .select();
    return { data, error };
  };

  try {
    let patch = buildPatch(true, true);
    if (Object.keys(patch).length === 0) return { ok: true };
    let { error } = await runUpdate(patch);
    if (isMissingColumnError(error, "goal_id")) {
      console.warn("[supabase] sessions.goal_id missing; retrying goal update without it.", error);
      disableGoalIdColumn();
      patch = buildPatch(false, true);
      if (Object.keys(patch).length === 0) return { ok: true };
      ({ error } = await runUpdate(patch));
    }
    if (isMissingColumnError(error, "tags")) {
      console.warn("[supabase] sessions.tags missing; retrying goal update without it.", error);
      disableTagsColumn();
      patch = buildPatch(true, false);
      if (Object.keys(patch).length === 0) return { ok: true };
      ({ error } = await runUpdate(patch));
    }
    if (error) {
      console.error("[supabase] updateSessionGoal failed:", error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error("[supabase] updateSessionGoal threw:", e);
    return { ok: false };
  }
}

/**
 * Delete a previously saved session. Matches by row id first, then falls
 * back to (user_id, started_at, task_name) for rows whose local id hasn't
 * been reconciled with Supabase yet. Requires an authenticated user; RLS
 * scopes the DELETE to `auth.uid() = user_id`.
 */
export async function deleteSessionRemote(opts: {
  id?: string;
  startedAt: string;
  taskName: string;
}): Promise<{ ok: boolean }> {
  let authUserId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    authUserId = data.user?.id ?? null;
  } catch (e) {
    console.error("[supabase] deleteSession: auth threw:", e);
  }
  if (!authUserId) return { ok: false };

  try {
    if (opts.id) {
      const { data, error } = await supabase
        .from("sessions")
        .delete()
        .eq("id", opts.id)
        .eq("user_id", authUserId)
        .select();
      if (!error && data && data.length > 0) return { ok: true };
    }
    const { error: err2 } = await supabase
      .from("sessions")
      .delete()
      .eq("user_id", authUserId)
      .eq("started_at", opts.startedAt)
      .eq("task_name", opts.taskName);
    if (err2) {
      console.error("[supabase] deleteSession fallback failed:", err2.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error("[supabase] deleteSession threw:", e);
    return { ok: false };
  }
}

/**
 * Push any sessions queued in localStorage to Supabase. Safe to call on
 * component mount or after sign-in. Falls back to the public client for
 * anon-writable deployments and keeps unsynced rows queued if writes fail.
 */
export async function syncPendingSessions(): Promise<{ synced: number; remaining: number }> {
  const pending = readPending();
  if (pending.length === 0) return { synced: 0, remaining: 0 };

  let authUserId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    authUserId = data.user?.id ?? null;
  } catch {
    // treat as unauthenticated
  }

  if (!authUserId) {
    // No verified identity — do not push queued rows through the anon client
    // under a client-picked user_id. Keep them queued for a real sign-in.
    return { synced: 0, remaining: pending.length };
  }

  const failed: RemoteSession[] = [];
  let synced = 0;
  let dropped = 0;
  for (const s of pending) {
    try {
      const { error, payload } = await insertSessionPayload(supabase, s, authUserId);
      if (error) {
        console.error("Failing payload:", payload);
        if (isPermanentBadPayloadError(error)) {
          dropped += 1;
          console.error("[supabase] Dropping invalid queued session so sync can continue:", error);
        } else {
          failed.push(s);
        }
      } else {
        synced += 1;
      }
    } catch (e) {
      console.error("Failing payload:", buildPayload(s, authUserId));
      failed.push(s);
    }
  }
  writePending(failed);
  if (dropped > 0) {
    console.warn(`[supabase] dropped ${dropped} invalid queued session(s) after schema mismatch.`);
  }
  return { synced, remaining: failed.length };
}

