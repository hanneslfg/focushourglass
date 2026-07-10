/**
 * Inline goal pills rendered on a completed session row. Supports
 * multi-select: tapping an inactive pill adds that goal's TEXT NAME to the
 * session's `tags` array; tapping an active pill removes it.
 *
 * Goal-to-Tag Bridge: There is no `goal_id` column on the live sessions
 * table. A Goal in the UI is considered "on" for a session iff its exact
 * text name (case-insensitive) appears in `session.tags`. All selected
 * goals share the full focused-minutes of the session in aggregation.
 */
import { useEffect, useState } from "react";
import { getProjectGoals, type ProjectGoal } from "@/lib/goals";
import { getSessions, sessionGoalTexts, updateSession, type Session } from "@/lib/sessions";
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

  // Match Goal (UI object) ↔ tags (text[] in DB) purely by lowercased
  // goal.text — this is the ONLY bridge; goal_id is not persisted.
  const activeTexts = new Set(
    sessionGoalTexts(session).map((t) => t.toLowerCase()),
  );
  const activeIds = new Set<string>();
  for (const g of goals) {
    if (activeTexts.has(g.text.trim().toLowerCase())) activeIds.add(g.id);
  }

  const toggle = (g: ProjectGoal, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const isActive = activeIds.has(g.id);
    const nextIds = new Set(activeIds);
    if (isActive) nextIds.delete(g.id);
    else nextIds.add(g.id);

    // Ordered text list following the current `goals` order for stability.
    const orderedTexts = goals.filter((x) => nextIds.has(x.id)).map((x) => x.text);
    const primaryText = orderedTexts[0];

    // Optimistic local update — writes tags AND clears any stale goalId so
    // toggling off actually rolls the pill back to muted immediately.
    updateSession(session.id, {
      goalId: undefined,
      goalText: primaryText ?? undefined,
      tags: orderedTexts,
    });
    void updateSessionGoalRemote({
      id: session.id,
      startedAt: session.startedAt,
      taskName: session.task,
      goalTexts: orderedTexts,
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
        const on = activeIds.has(g.id);
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
