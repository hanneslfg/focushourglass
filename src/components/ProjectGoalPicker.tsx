/**
 * Inline multi-goal picker shown right under the project selector on the
 * home screen. Selection is fully optional — pick zero, one, several, or
 * all of the active goals. Each pill uses the goal's own color and shows
 * a subtle checkmark when the goal has already been achieved.
 */
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { ProjectTag } from "@/lib/projects";
import { getProjectGoals, isGoalAchieved, type ProjectGoal } from "@/lib/goals";
import { getSessions } from "@/lib/sessions";
import { useTimer } from "@/lib/TimerContext";


interface Props {
  project: ProjectTag | null;
  selectedIds: string[];
  onToggle: (goal: { id: string; text: string }) => void;
  disabled?: boolean;
}

export function ProjectGoalPicker({ project, selectedIds, onToggle, disabled }: Props) {
  const [goals, setGoals] = useState<ProjectGoal[]>([]);
  const [tick, setTick] = useState(0);
  const { phase } = useTimer();
  const sessionActive = phase === "running" || phase === "paused";

  useEffect(() => {
    const sync = () => setGoals(project ? getProjectGoals(project.id, project.name) : []);
    sync();
    window.addEventListener("hourglass:goals", sync);
    window.addEventListener("hourglass:sessions", () => setTick((t) => t + 1));
    return () => {
      window.removeEventListener("hourglass:goals", sync);
    };
  }, [project?.id, project?.name]);

  const focusedByGoal = useMemo(() => {
    if (!project) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const s of getSessions()) {
      if (s.projectId !== project.id) continue;
      const key =
        s.goalId ??
        (s.goalText ?? s.tags?.[0] ?? "").trim().toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + (s.focusedMinutes || 0));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, tick]);

  // Completed goals are hidden from the pre-session picker so only what's
  // still pending competes for attention. A goal that is already picked stays
  // visible even if it completes mid-session.
  const pendingGoals = goals.filter((g) => {
    if (selectedIds.includes(g.id)) return true;
    const focused =
      (focusedByGoal.get(g.id) ?? 0) + (focusedByGoal.get(g.text.toLowerCase()) ?? 0);
    return !isGoalAchieved(g, focused);
  });

  // While a session is running (or paused) only the picked goals stay on
  // screen — everything else collapses away to reduce visual clutter.
  const visibleGoals =
    sessionActive && selectedIds.length > 0
      ? pendingGoals.filter((g) => selectedIds.includes(g.id))
      : pendingGoals;

  if (!project) return null;
  if (visibleGoals.length === 0) return null;

  const allSelected = selectedIds.length > 0 && selectedIds.length === goals.length;

  return (
    <div className="flex flex-col items-center gap-2 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {visibleGoals.map((g) => {
          const on = selectedIds.includes(g.id);
          const focused =
            (focusedByGoal.get(g.id) ?? 0) +
            (focusedByGoal.get(g.text.toLowerCase()) ?? 0);
          const achieved = isGoalAchieved(g, focused);
          const dimmed = false;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => !disabled && onToggle({ id: g.id, text: g.text })}
              disabled={disabled}
              className={`group inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] tracking-wide transition-all duration-150 disabled:opacity-60 ${
                dimmed ? "opacity-40" : ""
              }`}
              style={
                on
                  ? {
                      background: `${g.color}26`,
                      border: `1px solid ${g.color}`,
                      color: g.color,
                      boxShadow: `0 0 12px ${g.color}33`,
                    }
                  : {
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.10)",
                      color: "rgba(255,255,255,0.60)",
                    }
              }
              title={achieved ? "Goal achieved" : g.text}
            >
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: g.color, opacity: on ? 1 : 0.7 }}
              />
              <span className="truncate max-w-[10rem]">{g.text}</span>
              {achieved && (
                <Check
                  className="h-3 w-3 shrink-0"
                  strokeWidth={2.5}
                  style={{ color: on ? g.color : "rgba(163,177,138,0.9)" }}
                />
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}
