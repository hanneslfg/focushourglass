import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ujksluqzycmbflqdhczo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Sf6MyvFRTIcSYOtGhh21mw_IAjx2cPl";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
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
  try {
    const { error } = await supabase.from("sessions").insert(s);
    if (error) console.error("[supabase] saveSession failed:", error.message);
  } catch (e) {
    console.error("[supabase] saveSession threw:", e);
  }
}
