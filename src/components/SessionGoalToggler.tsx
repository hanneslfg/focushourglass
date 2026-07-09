/**
 * Inline goal pills rendered on a completed session row. Tapping a pill
 * assigns that goal (single-select). Tapping the active pill clears it.
 * Updates both the local cache (instant UI + goal-progress recalculation)
 * and Supabase (`goal_id` + legacy `tags[]` mirror).
 */
import { useEffect, useState } from "react";
import { getProjectGoals, type ProjectGoal } from "@/lib/goals";
import { getSessions, updateSession, type Session } from "@/lib/sessions";
import { updateSessionGoalRemote } from "@/lib/supabase";

interface Props {
  session: Session;
  /** Overrides `session.projectId` when the caller wants to force a scope. */
  projectId?: string;
  size?: "xs" | "sm";
}

export function SessionGoalToggler({ session: sessionProp, projectId, size = "xs" }: Props) {
  const pid = projectId ?? sessionProp.projectId;
  const [goals, setGoals] = useState<ProjectGoal[]>([]);
  // Track the live session from storage so `activeId` reflects the latest
  // goalId immediately, regardless of whether the parent re-renders with a
  // fresh session object. This is what guarantees instant pill swap +
  // instant progress-bar re-render across all consumers.
  const [session, setSession] = useState<Session>(sessionProp);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSession(sessionProp), [sessionProp]);

  useEffect(() => {
    const syncGoals = () => setGoals(pid ? getProjectGoals(pid) : []);
    const syncSession = () => {
      const latest = getSessions().find((s) => s.id === sessionProp.id);
      if (latest) setSession(latest);
    };
    syncGoals();
    window.addEventListener("hourglass:goals", syncGoals);
    window.addEventListener("hourglass:sessions", syncSession);
    return () => {
      window.removeEventListener("hourglass:goals", syncGoals);
      window.removeEventListener("hourglass:sessions", syncSession);
    };
  }, [pid, sessionProp.id]);

  if (!pid || goals.length === 0) return null;

  const activeId =
    session.goalId ??
    goals.find(
      (g) =>
        g.text.trim().toLowerCase() ===
        (session.goalText ?? session.tags?.[0] ?? "").trim().toLowerCase(),
    )?.id ??
    null;

  const toggle = (g: ProjectGoal, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const isActive = activeId === g.id;
    const nextId = isActive ? null : g.id;
    const nextText = isActive ? undefined : g.text;
    // Optimistic local update — instantly refreshes progress bars, daily
    // totals, and analytics via the "hourglass:sessions" event.
    updateSession(session.id, {
      goalId: nextId ?? undefined,
      goalText: nextText,
      tags: nextText ? [nextText] : [],
    });
    void updateSessionGoalRemote({
      id: session.id,
      startedAt: session.startedAt,
      taskName: session.task,
      goalId: nextId,
      goalText: nextText ?? null,
    }).finally(() => setBusy(false));
  };

  const dims =
    size === "xs"
      ? { h: "h-5", pad: "pl-1.5 pr-2", text: "text-[10px]", dot: "h-1.5 w-1.5" }
      : { h: "h-6", pad: "pl-2 pr-2.5", text: "text-[11px]", dot: "h-1.5 w-1.5" };

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      {goals.map((g) => {
        const on = activeId === g.id;
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={on}
            title={on ? `Unassign goal · ${g.text}` : `Assign goal · ${g.text}`}
            onClick={(e) => toggle(g, e)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle(g, e);
              }
            }}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-full ${dims.h} ${dims.pad} ${dims.text} tracking-wide transition-all duration-150 disabled:opacity-60`}
            style={
              on
                ? {
                    background: `${g.color}26`,
                    border: `1px solid ${g.color}`,
                    color: g.color,
                    boxShadow: `0 0 10px ${g.color}33`,
                  }
                : {
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.55)",
                  }
            }
          >
            <span
              className={`${dims.dot} rounded-full shrink-0`}
              style={{ background: g.color, opacity: on ? 1 : 0.55 }}
            />
            <span className="truncate max-w-[10rem]">{g.text}</span>
          </button>
        );
      })}
    </div>
  );
}
