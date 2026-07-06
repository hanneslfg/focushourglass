/**
 * Inline goal picker shown right under the project selector on the home
 * screen. When a project is selected, its goals expand as tappable pills.
 * Each pill uses the goal's own color and shows a subtle checkmark when
 * the goal has been achieved (marked done OR focused time ≥ target).
 */
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { ProjectTag } from "@/lib/projects";
import { getProjectGoals, isGoalAchieved, type ProjectGoal } from "@/lib/goals";
import { getSessions } from "@/lib/sessions";

interface Props {
  project: ProjectTag | null;
  goalText: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
}

export function ProjectGoalPicker({ project, goalText, onChange, disabled }: Props) {
  const [goals, setGoals] = useState<ProjectGoal[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const sync = () => setGoals(project ? getProjectGoals(project.id) : []);
    sync();
    window.addEventListener("hourglass:goals", sync);
    window.addEventListener("hourglass:sessions", () => setTick((t) => t + 1));
    return () => {
      window.removeEventListener("hourglass:goals", sync);
    };
  }, [project?.id]);

  // Compute focused minutes per goal for this project (used for achievement).
  const focusedByGoal = useMemo(() => {
    if (!project) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const s of getSessions()) {
      if (s.projectId !== project.id) continue;
      const key = (s.goalText ?? s.tags?.[0] ?? "").trim().toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + (s.focusedMinutes || 0));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, tick]);

  if (!project) return null;
  if (goals.length === 0) return null;

  const activeLower = goalText?.trim().toLowerCase() ?? "";

  function toggle(text: string) {
    if (disabled) return;
    const same = activeLower === text.trim().toLowerCase();
    onChange(same ? null : text);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 animate-in fade-in duration-300">
      {goals.map((g) => {
        const on = activeLower === g.text.toLowerCase();
        const focused = focusedByGoal.get(g.text.toLowerCase()) ?? 0;
        const achieved = isGoalAchieved(g, focused);
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => toggle(g.text)}
            disabled={disabled}
            className="group inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] tracking-wide transition-all duration-150 disabled:opacity-60"
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
  );
}

