/** Remote-first CRUD for the daily agenda (public.agenda_items). */
import { supabase } from "./supabase";
import { effectiveDayKey } from "./settings";
import type { RemoteResult } from "./remoteConfig";

export interface AgendaItem {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  title: string;
  estimatedBlocks: number | null;
  completed: boolean;
  sortOrder: number;
  createdAt: string;
}

interface RemoteAgendaItem {
  id: string;
  user_id: string;
  date: string;
  title: string;
  estimated_blocks: number | null;
  completed: boolean;
  sort_order: number;
  created_at: string;
}

const COLUMNS = "id,user_id,date,title,estimated_blocks,completed,sort_order,created_at";

function reportError(op: string, error: unknown) {
  console.error(`[agenda] ${op} failed`, error);
}

function fromRemote(r: RemoteAgendaItem): AgendaItem {
  return {
    id: r.id,
    userId: r.user_id,
    date: r.date,
    title: r.title,
    estimatedBlocks: r.estimated_blocks ?? null,
    completed: !!r.completed,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
  };
}

async function authUid(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user?.id) return data.user.id;
    const session = await supabase.auth.getSession();
    return session.data.session?.user?.id ?? null;
  } catch (error) {
    reportError("auth lookup", error);
    return null;
  }
}

/** "Today" consistent with the rest of the app (honors dayStartHour). */
export function agendaTodayKey(): string {
  return effectiveDayKey(new Date());
}

export async function fetchTodayAgendaItems(): Promise<AgendaItem[] | null> {
  const uid = await authUid();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("agenda_items")
    .select(COLUMNS)
    .eq("user_id", uid)
    .eq("date", agendaTodayKey())
    .order("sort_order", { ascending: true });
  if (error) {
    reportError("fetchTodayAgendaItems", error);
    return null;
  }
  return ((data ?? []) as RemoteAgendaItem[]).map(fromRemote);
}

export async function addAgendaItem(
  title: string,
  estimatedBlocks?: number,
): Promise<RemoteResult<AgendaItem>> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const clean = title.trim();
  if (!clean) return { ok: false, error: "Empty title" };

  const date = agendaTodayKey();
  const { count } = await supabase
    .from("agenda_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("date", date);

  const { data, error, status } = await supabase
    .from("agenda_items")
    .insert({
      user_id: uid,
      date,
      title: clean,
      estimated_blocks:
        estimatedBlocks == null ? null : Math.max(0, Math.round(estimatedBlocks)),
      completed: false,
      sort_order: count ?? 0,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    reportError("addAgendaItem", error);
    return { ok: false, error: error?.message ?? "unknown", status };
  }
  return { ok: true, error: null, status, data: fromRemote(data as RemoteAgendaItem) };
}

export async function toggleAgendaItem(
  id: string,
  completed: boolean,
): Promise<RemoteResult> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const { error, status } = await supabase
    .from("agenda_items")
    .update({ completed })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) {
    reportError("toggleAgendaItem", error);
    return { ok: false, error: error.message ?? "unknown", status };
  }
  return { ok: true, error: null, status };
}

export async function deleteAgendaItem(id: string): Promise<RemoteResult> {
  const uid = await authUid();
  if (!uid) return { ok: false, error: "Not signed in", notAuthed: true };
  const { error, status } = await supabase
    .from("agenda_items")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) {
    reportError("deleteAgendaItem", error);
    return { ok: false, error: error.message ?? "unknown", status };
  }
  return { ok: true, error: null, status };
}
