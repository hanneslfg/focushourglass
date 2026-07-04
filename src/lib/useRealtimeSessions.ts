import { useEffect, useState } from "react";
import { getActiveSyncUserId, syncPendingSessions, supabase } from "./supabase";
import {
  upsertRemoteSession,
  updateSession,
  removeSession,
  hydrateFromRemote,
} from "./sessions";
import { projectIdFromName, colorForProjectName, ingestRemoteDeletion } from "./projects";

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

export type SyncState = "idle" | "syncing" | "offline" | "error";

let listeners = new Set<(s: SyncState) => void>();
let currentState: SyncState = "idle";
function setState(s: SyncState) {
  currentState = s;
  listeners.forEach((l) => l(s));
}

export function useSyncState(): SyncState {
  const [s, setS] = useState<SyncState>(currentState);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

async function refresh() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setState("offline");
    return;
  }
  setState("syncing");
  try {
    await syncPendingSessions().catch(() => {});
    await hydrateFromRemote();
    setState("idle");
  } catch (e) {
    console.error("[realtime] refresh failed:", e);
    setState("error");
  }
}

/**
 * On mount: force a fresh Supabase fetch (overrides stale local cache) and
 * flushes any locally-queued sessions. Then subscribes to realtime INSERT /
 * UPDATE / DELETE on `sessions` for the signed-in user so changes from any
 * device propagate immediately. Reconnect-triggers a full re-hydrate so the
 * cloud always wins as the source of truth.
 */
export function useRealtimeSessions() {
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function subscribe() {
      const uid = await getActiveSyncUserId();
      if (!uid || cancelled) return;

      channel = supabase
        .channel(`public:sessions:${uid}`)
        .on(
          "postgres_changes" as never,
          {
            event: "INSERT",
            schema: "public",
            table: "sessions",
            filter: `user_id=eq.${uid}`,
          },
          (payload: { new: RemoteRow }) => {
            try {
              if (payload.new.was_aborted) return;
              upsertRemoteSession(toLocal(payload.new));
            } catch (e) {
              console.error("[realtime] INSERT merge failed:", e);
            }
          },
        )
        .on(
          "postgres_changes" as never,
          {
            event: "UPDATE",
            schema: "public",
            table: "sessions",
            filter: `user_id=eq.${uid}`,
          },
          (payload: { new: RemoteRow }) => {
            try {
              const local = toLocal(payload.new);
              if (payload.new.was_aborted) {
                if (local.id) removeSession(local.id);
                return;
              }
              // Try id-based patch; if row wasn't in the cache, insert.
              updateSession(local.id, local);
              upsertRemoteSession(local);
            } catch (e) {
              console.error("[realtime] UPDATE merge failed:", e);
            }
          },
        )
        .on(
          "postgres_changes" as never,
          {
            event: "DELETE",
            schema: "public",
            table: "sessions",
            filter: `user_id=eq.${uid}`,
          },
          (payload: { old: RemoteRow }) => {
            try {
              const id = payload.old?.id;
              if (id) removeSession(id);
            } catch (e) {
              console.error("[realtime] DELETE merge failed:", e);
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            refresh();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setState("error");
          }
        });
    }

    // Kick off an immediate refresh so we don't wait for the channel to
    // subscribe before the UI shows fresh cloud data.
    refresh();
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

    const onOnline = () => {
      refresh();
    };
    const onOffline = () => setState("offline");
    const onFocus = () => refresh();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
}
