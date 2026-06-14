import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ujksluqzycmbflqdhczo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Sf6MyvFRTIcSYOtGhh21mw_IAjx2cPl";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const USER_KEY = "hourglass.user_id.v1";

export function getUserId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(USER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(USER_KEY, id);
  }
  return id;
}

export function setUserId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, id);
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
  await supabase.auth.signOut();
  // Generate a fresh anon id so the next session isn't attributed to the
  // previous user.
  window.localStorage.removeItem(USER_KEY);
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
}

export async function saveSessionRemote(s: RemoteSession) {
  const payload = {
    user_id: String(s.user_id),
    task_name: String(s.task_name),
    project_tag: s.project_tag ?? null,
    planned_duration: Math.round(Number(s.planned_duration)),
    actual_duration: Math.round(Number(s.actual_duration)),
    started_at: s.started_at,
    completed_at: s.completed_at,
    was_aborted: Boolean(s.was_aborted),
  };
  console.log("[supabase] saveSession → inserting", payload);
  try {
    const { data, error } = await supabase
      .from("sessions")
      .insert(payload)
      .select();
    if (error) {
      console.error("[supabase] saveSession failed:", error);
    } else {
      console.log("[supabase] saveSession OK", data);
    }
  } catch (e) {
    console.error("[supabase] saveSession threw:", e);
  }
}
