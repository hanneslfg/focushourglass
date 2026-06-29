import { useEffect } from "react";
import { supabase } from "./supabase";
import { upsertRemoteSession } from "./sessions";
import { projectIdFromName, colorForProjectName } from "./projects";

interface RemoteRow {
  id?: string;
  user_id: string;
  task_name: string;
  project_tag: string | null;
  planned_duration: number;
  actual_duration: number;
  started_at: string;
  completed_at: string;
  was_aborted: boolean;
  tags?: string[] | null;
}

function toLocal(row: RemoteRow) {
  const name = row.project_tag?.trim() || undefined;
  return {
    id: row.id ?? crypto.randomUUID(),
    task: row.task_name,
    plannedMinutes: row.planned_duration,
    focusedMinutes: row.actual_duration,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    projectId: name ? projectIdFromName(name) : undefined,
    projectName: name,
    projectColor: name ? colorForProjectName(name) : undefined,
    tags: Array.isArray(row.tags) ? row.tags.filter(Boolean) : undefined,
  };
}

/**
 * Subscribes to realtime INSERTs on the `sessions` table for the signed-in
 * user and merges new rows into local state. Idempotent against optimistic
 * inserts via `upsertRemoteSession`'s dedup. Resubscribes on auth changes.
 */
export function useRealtimeSessions() {
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function subscribe() {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;

      channel = supabase
        .channel(`public:sessions:${uid}`)
        .on(
          // postgres_changes event name is a string literal at runtime
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "sessions",
            filter: `user_id=eq.${uid}`,
          },
          (payload: { new: RemoteRow }) => {
            try {
              const added = upsertRemoteSession(toLocal(payload.new));
              if (added) console.log("[realtime] merged remote session");
            } catch (e) {
              console.error("[realtime] merge failed:", e);
            }
          },
        )
        .subscribe();
    }

    subscribe();
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        if (channel) {
          supabase.removeChannel(channel);
          channel = null;
        }
        subscribe();
      }
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
}
