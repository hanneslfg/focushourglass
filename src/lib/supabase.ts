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

/**
 * Wipes all app-managed state from the browser: localStorage keys owned by
 * this app plus sessionStorage. Used on sign-out and on account-switch so
 * no residual data from the previous user leaks into the next session.
 */
export function clearAllLocalAppState(opts?: { keepAuth?: boolean }) {
  if (typeof window === "undefined") return;
  // On account switch we must KEEP the freshly-issued Supabase auth token,
  // otherwise the reload lands signed-out and the new user's cloud data can
  // never be re-fetched (looks like "all my data is gone" after re-login).
  const prefixes = opts?.keepAuth
    ? ["hourglass.", "hg."]
    : ["hourglass.", "hg.", "sb-", "supabase."];
  try {
    const ls = window.localStorage;
    const kill: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && prefixes.some((p) => k.startsWith(p))) kill.push(k);
    }
    for (const k of kill) ls.removeItem(k);
  } catch (e) {
    console.warn("[supabase] clearAllLocalAppState localStorage failed:", e);
  }
  try {
    window.sessionStorage.clear();
  } catch (e) {
    console.warn("[supabase] clearAllLocalAppState sessionStorage failed:", e);
  }
}

const LAST_USER_KEY = "hourglass.last_auth_user.v1";

/**
 * On every auth state change: if the signed-in user differs from the last
 * one we saw on this device, clear all app state and reload so nothing from
 * the previous account bleeds into the new one.
 */
export function handleAccountSwitchIfNeeded(newUserId: string | null) {
  if (typeof window === "undefined") return;
  let prev: string | null = null;
  try {
    prev = safeStorage.getItem(LAST_USER_KEY);
  } catch {
    prev = null;
  }
  if (newUserId && prev && prev !== newUserId) {
    console.log("[supabase] account switch detected — flushing local state");
    clearAllLocalAppState({ keepAuth: true });
    try {
      safeStorage.setItem(LAST_USER_KEY, newUserId);
    } catch {
      /* ignore */
    }
    window.location.replace("/");
    return;
  }
  if (newUserId && prev !== newUserId) {
    try {
      safeStorage.setItem(LAST_USER_KEY, newUserId);
    } catch {
      /* ignore */
    }
  }
}

export async function signOut() {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn("[supabase] signOut threw:", e);
  }
  clearAllLocalAppState();
  if (typeof window !== "undefined") {
    // Full reload tears down React Query, contexts, timer state and any
    // in-memory caches so nothing from the previous account leaks through.
    window.location.replace("/");
  }
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
  /**
   * Goal-to-Tag bridge: UI Goals are stored here as their exact text names.
   * The `sessions.tags` text[] column is the SOLE source of truth for
   * multi-goal selection. There is no `goal_id` column on the live table.
   */
  tags?: string[];
  /** Focus Score 1–100 computed at finalize time. */
  focus_score?: number | null;
  /** Number of pauses during the session. */
  pause_count?: number | null;
  /** Total seconds spent paused. */
  total_pause_seconds?: number | null;
}

const PENDING_KEY = "hourglass.pending_sessions.v1";
const TAGS_COLUMN_DISABLED_KEY = "hourglass.sessions.tags_column_disabled.v1";
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
  opts: { includeTags?: boolean; includeFocusScore?: boolean } = {},
): SessionInsertPayload {
  const includeTags = opts.includeTags ?? !tagsColumnDisabled();
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
  // Goal-to-Tag bridge: always send an ARRAY (empty when no goals selected)
  // so a toggle-off actually clears the column instead of leaving stale tags.
  if (includeTags) payload.tags = tags ?? [];
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
  if (isMissingColumnError(error, "tags") && "tags" in payload) {
    console.warn("[supabase] sessions.tags column missing; retrying without tags.", error);
    disableTagsColumn();
    payload = buildPayload(session, userId, {
      includeTags: false,
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
const RECENT_WRITES_KEY = "hourglass.recent_session_writes.v1";
const RECENT_WRITE_TTL_MS = 30_000;
const inFlightWrites = new Set<string>();

function writeDedupeKey(s: RemoteSession, userId: string): string {
  return `${userId}|${cleanIso(s.started_at)}|${cleanText(s.task_name)}`;
}

function readRecentWrites(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = safeStorage.getItem(RECENT_WRITES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    const fresh: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && now - v < RECENT_WRITE_TTL_MS) fresh[k] = v;
    }
    return fresh;
  } catch {
    return {};
  }
}

function markRecentWrite(key: string) {
  if (typeof window === "undefined") return;
  const map = readRecentWrites();
  map[key] = Date.now();
  try {
    safeStorage.setItem(RECENT_WRITES_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}

function wasRecentlyWritten(key: string): boolean {
  const map = readRecentWrites();
  const ts = map[key];
  return typeof ts === "number" && Date.now() - ts < RECENT_WRITE_TTL_MS;
}

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

  const dedupeKey = writeDedupeKey(s, authUserId);

  // 1) In-flight lock — another call in this tab is already writing this session.
  if (inFlightWrites.has(dedupeKey)) {
    console.warn("[supabase] saveSession skipped — write already in flight:", dedupeKey);
    return { ok: false, queued: false, error: "in-flight-duplicate" } as const;
  }
  // 2) Cross-tab recent-write cache (localStorage).
  if (wasRecentlyWritten(dedupeKey)) {
    console.warn("[supabase] saveSession skipped — recently written duplicate:", dedupeKey);
    return { ok: true, queued: false, deduped: true } as const;
  }

  inFlightWrites.add(dedupeKey);
  try {
    // 3) DB pre-check — does a row for this (user_id, started_at) already exist?
    try {
      const { data: existing, error: preErr } = await supabase
        .from("sessions")
        .select("id")
        .eq("user_id", authUserId)
        .eq("started_at", cleanIso(s.started_at))
        .limit(1);
      if (!preErr && existing && existing.length > 0) {
        console.warn("[supabase] saveSession aborted — row already exists in DB:", dedupeKey);
        markRecentWrite(dedupeKey);
        return { ok: true, queued: false, deduped: true } as const;
      }
    } catch (e) {
      console.warn("[supabase] pre-insert dedupe check failed (continuing):", e);
    }

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
      // Unique-constraint violation from a concurrent tab → treat as success.
      if (error.code === "23505") {
        console.warn("[supabase] saveSession dedup — unique constraint hit:", error.message);
        markRecentWrite(dedupeKey);
        return { ok: true, queued: false, deduped: true } as const;
      }
      if (isPermanentBadPayloadError(error)) {
        console.error("[supabase] Dropping invalid session payload instead of retrying forever.");
        return { ok: false, queued: false, error: error.message } as const;
      }
      queuePending(s);
      return { ok: false, queued: true, error: error.message } as const;
    }
    markRecentWrite(dedupeKey);
    console.log("[supabase] saveSession OK", data);
    return { ok: true, queued: false } as const;
  } catch (e) {
    console.error("[supabase] saveSession threw:", e);
    queuePending(s);
    return { ok: false, queued: true, error: String(e) } as const;
  } finally {
    inFlightWrites.delete(dedupeKey);
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
 * Assign / unassign one or more goals on a previously saved session.
 *
 * Goal-to-Tag Bridge: The live `public.sessions` table has a single
 * `tags text[]` column and NO `goal_id` column. UI Goals are matched to
 * sessions by their exact TEXT name inside the `tags` array. This function
 * writes the full ordered array of goal names to `tags` (empty array clears
 * all selections). Passing legacy `goalIds` is accepted for backward compat
 * but IGNORED — only the text names are persisted.
 */
export async function updateSessionGoalRemote(opts: {
  id?: string;
  startedAt: string;
  taskName: string;
  /** Present for legacy call sites; ignored — the bridge is text-only. */
  goalIds?: (string | null)[];
  goalTexts?: (string | null)[];
  /** @deprecated use goalTexts */
  goalId?: string | null;
  /** @deprecated use goalTexts */
  goalText?: string | null;
}): Promise<{ ok: boolean }> {
  let authUserId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    authUserId = data.user?.id ?? null;
  } catch (e) {
    console.error("[supabase] updateSessionGoal: auth threw:", e);
  }
  if (!authUserId) return { ok: false };

  const cleanArr = (input: (string | null | undefined)[] | undefined): string[] => {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of input) {
      const s = typeof v === "string" ? v.trim().slice(0, 140) : "";
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  };

  const textList = cleanArr(
    opts.goalTexts ?? (opts.goalText !== undefined ? [opts.goalText] : []),
  );

  if (tagsColumnDisabled()) {
    // Column missing on this deployment — nothing to write.
    return { ok: true };
  }

  // Always send an array (empty = "clear all goals"). This is the whole
  // persistence contract for multi-goal now that goal_id is gone.
  const patch: Record<string, unknown> = { tags: textList };

  const runUpdate = async () => {
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
    const { error } = await runUpdate();
    if (isMissingColumnError(error, "tags")) {
      console.warn("[supabase] sessions.tags missing; multi-goal disabled locally.", error);
      disableTagsColumn();
      return { ok: false };
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

const LOCAL_SESSIONS_KEY = "hourglass.sessions.v1";

interface LocalSessionShape {
  id?: string;
  task?: string;
  plannedMinutes?: number;
  focusedMinutes?: number;
  startedAt?: string;
  completedAt?: string;
  projectName?: string;
  tags?: string[];
  goalText?: string;
  focusScore?: number;
  pauseCount?: number;
  totalPauseSeconds?: number;
}

/**
 * Merge guest sessions saved locally (under `hourglass.sessions.v1`) into
 * the signed-in user's cloud account. Deduplicates against existing remote
 * rows using (task_name, started_at, completed_at). Never clears the local
 * cache — hydrateFromRemote will refresh it from the server after upload.
 *
 * Call this BEFORE any hydrate/overwrite so no guest data is lost on login.
 */
export async function mergeLocalSessionsToCloud(): Promise<{ merged: number; skipped: number }> {
  if (typeof window === "undefined") return { merged: 0, skipped: 0 };

  let authUserId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    authUserId = data.user?.id ?? null;
  } catch {
    // not authenticated — nothing to merge into
  }
  if (!authUserId) return { merged: 0, skipped: 0 };

  let raw: string | null = null;
  try {
    raw = safeStorage.getItem(LOCAL_SESSIONS_KEY);
  } catch {
    return { merged: 0, skipped: 0 };
  }
  if (!raw) return { merged: 0, skipped: 0 };

  let local: LocalSessionShape[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) local = parsed as LocalSessionShape[];
  } catch {
    return { merged: 0, skipped: 0 };
  }
  if (local.length === 0) return { merged: 0, skipped: 0 };

  // Fetch existing remote keys for this user to dedupe.
  const remoteKeys = new Set<string>();
  try {
    const { data: existing } = await supabase
      .from("sessions")
      .select("task_name, started_at, completed_at")
      .eq("user_id", authUserId);
    for (const r of (existing ?? []) as Array<{
      task_name: string;
      started_at: string;
      completed_at: string;
    }>) {
      remoteKeys.add(
        `${r.task_name}|${String(r.started_at).slice(0, 19)}|${String(r.completed_at).slice(0, 19)}`,
      );
    }
  } catch (e) {
    console.warn("[supabase] mergeLocalSessionsToCloud: dedupe fetch failed:", e);
  }

  let merged = 0;
  let skipped = 0;
  for (const s of local) {
    const task = String(s.task ?? "").trim();
    const startedAt = String(s.startedAt ?? "");
    const completedAt = String(s.completedAt ?? "");
    if (!task || !startedAt || !completedAt) {
      skipped += 1;
      continue;
    }
    const key = `${task}|${startedAt.slice(0, 19)}|${completedAt.slice(0, 19)}`;
    if (remoteKeys.has(key)) {
      skipped += 1;
      continue;
    }
    const remote: RemoteSession = {
      user_id: authUserId,
      task_name: task,
      project_tag: s.projectName ?? null,
      planned_duration: Number(s.plannedMinutes ?? 0),
      actual_duration: Number(s.focusedMinutes ?? 0),
      started_at: startedAt,
      completed_at: completedAt,
      was_aborted: false,
      tags: Array.isArray(s.tags) && s.tags.length > 0
        ? s.tags
        : s.goalText
          ? [s.goalText]
          : undefined,
      focus_score: typeof s.focusScore === "number" ? s.focusScore : null,
      pause_count: typeof s.pauseCount === "number" ? s.pauseCount : null,
      total_pause_seconds:
        typeof s.totalPauseSeconds === "number" ? s.totalPauseSeconds : null,
    };
    try {
      const { error } = await insertSessionPayload(supabase, remote, authUserId);
      if (error) {
        console.error("[supabase] mergeLocalSessionsToCloud insert failed:", error.message);
        // Also queue in pending so a later retry picks it up.
        queuePending(remote);
      } else {
        merged += 1;
        remoteKeys.add(key);
      }
    } catch (e) {
      console.error("[supabase] mergeLocalSessionsToCloud threw:", e);
      queuePending(remote);
    }
  }

  if (merged > 0) {
    console.log(`[supabase] merged ${merged} guest session(s) into cloud account (${skipped} already present).`);
  }
  return { merged, skipped };
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

