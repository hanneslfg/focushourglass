import { createClient } from "@supabase/supabase-js";
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

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Use our wrapped storage so any future setItem/getItem failure can't bubble.
    storage: safeStorage as unknown as Storage,
    // Disable persistence entirely when the browser blocks storage — the
    // client otherwise tries to write tokens and throws.
    persistSession: canPersist,
    autoRefreshToken: canPersist,
    detectSessionInUrl: true,
  },
});

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

function buildPayload(s: RemoteSession, userId: string) {
  return {
    user_id: userId,
    task_name: String(s.task_name),
    project_tag: s.project_tag ?? null,
    planned_duration: Math.round(Number(s.planned_duration)),
    actual_duration: Math.round(Number(s.actual_duration)),
    started_at: s.started_at,
    completed_at: s.completed_at,
    was_aborted: Boolean(s.was_aborted),
    tags: Array.isArray(s.tags) && s.tags.length > 0 ? s.tags : null,
  };
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
  } catch (e) {
    console.error("[supabase] saveSession: auth.getUser threw:", e);
  }

  if (!authUserId) {
    console.warn(
      "[supabase] saveSession: user not authenticated → saving to localStorage queue",
    );
    queuePending(s);
    return { ok: false, queued: true } as const;
  }

  const payload = buildPayload(s, authUserId);
  console.log("[supabase] saveSession → inserting", payload);
  try {
    const { data, error } = await supabase
      .from("sessions")
      .insert(payload)
      .select();
    if (error) {
      console.error("[supabase] saveSession failed:", error.message, error);
      if (
        error.message?.toLowerCase().includes("row-level security") ||
        error.code === "42501"
      ) {
        console.error(
          "[supabase] ⚠ RLS BLOCKER: Add an INSERT policy on public.sessions for authenticated users (see saveSessionRemote docs).",
        );
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
 * Push any sessions queued in localStorage to Supabase. Safe to call on
 * component mount or after sign-in. No-op when the user isn't authenticated.
 */
export async function syncPendingSessions(): Promise<{ synced: number; remaining: number }> {
  const pending = readPending();
  if (pending.length === 0) return { synced: 0, remaining: 0 };

  let authUserId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    authUserId = data.user?.id ?? null;
  } catch (e) {
    console.error("[supabase] syncPending: auth.getUser threw:", e);
  }
  if (!authUserId) {
    console.log(
      `[supabase] syncPending: ${pending.length} queued, but no auth user — skipping.`,
    );
    return { synced: 0, remaining: pending.length };
  }

  console.log(`[supabase] syncPending: attempting to flush ${pending.length} sessions…`);
  const failed: RemoteSession[] = [];
  let synced = 0;
  for (const s of pending) {
    const payload = buildPayload(s, authUserId);
    try {
      const { error } = await supabase.from("sessions").insert(payload);
      if (error) {
        console.error("[supabase] syncPending: insert failed:", error.message, error);
        failed.push(s);
      } else {
        synced += 1;
      }
    } catch (e) {
      console.error("[supabase] syncPending: insert threw:", e);
      failed.push(s);
    }
  }
  writePending(failed);
  console.log(
    `[supabase] syncPending: synced=${synced}, remaining=${failed.length}`,
  );
  return { synced, remaining: failed.length };
}
