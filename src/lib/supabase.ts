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
}

const PENDING_KEY = "hourglass.pending_sessions.v1";
const TAGS_COLUMN_DISABLED_KEY = "hourglass.sessions.tags_column_disabled.v1";

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

function isMissingTagsColumnError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "PGRST204" && message.includes("tags") && message.includes("column");
}

function isPermanentBadPayloadError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  // These indicate the row shape does not match the current table schema and
  // retrying the same queued object would freeze the sync loop forever.
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

function buildPayload(s: RemoteSession, userId: string, includeTags = !tagsColumnDisabled()): SessionInsertPayload {
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
  if (isMissingTagsColumnError(error) && "tags" in payload) {
    console.error("Failing payload:", payload);
    console.error("[supabase] sessions.tags column missing; retrying without tags.", error);
    disableTagsColumn();
    payload = buildPayload(session, userId, false);
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
    const { data } = await supabase.auth.getSession();
    authUserId = data.session?.user?.id ?? null;
  } catch {
    // Public insert fallback below keeps guest/offline sessions from blocking.
  }

  const syncUserId = authUserId ?? s.user_id ?? getUserId();
  const client = authUserId ? supabase : publicSupabase;
  try {
    const { data, error, payload } = await insertSessionPayload(client, s, syncUserId, { select: true });
    if (error) {
      console.error("Failing payload:", payload);
      if (!authUserId) {
        if (!isPermanentBadPayloadError(error)) {
          queuePending(s);
          return { ok: false, queued: true, error: error.message } as const;
        }
        console.error("[supabase] Dropping invalid anonymous session payload from retry queue:", error);
        return { ok: false, queued: false, error: error.message } as const;
      }
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
 * Push any sessions queued in localStorage to Supabase. Safe to call on
 * component mount or after sign-in. Falls back to the public client for
 * anon-writable deployments and keeps unsynced rows queued if writes fail.
 */
export async function syncPendingSessions(): Promise<{ synced: number; remaining: number }> {
  const pending = readPending();
  if (pending.length === 0) return { synced: 0, remaining: 0 };

  let authUserId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    authUserId = data.session?.user?.id ?? null;
  } catch {
    // Continue with the public client. If the table is not public-writable,
    // items remain queued without blocking the UI or clearing local work.
  }

  const fallbackUserId = authUserId ?? getUserId();
  const client = authUserId ? supabase : publicSupabase;
  const failed: RemoteSession[] = [];
  let synced = 0;
  let dropped = 0;
  for (const s of pending) {
    try {
      const { error, payload } = await insertSessionPayload(client, s, authUserId ?? s.user_id ?? fallbackUserId);
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
      console.error("Failing payload:", buildPayload(s, authUserId ?? s.user_id ?? fallbackUserId));
      failed.push(s);
    }
  }
  writePending(failed);
  if (dropped > 0) {
    console.warn(`[supabase] dropped ${dropped} invalid queued session(s) after schema mismatch.`);
  }
  return { synced, remaining: failed.length };
}
