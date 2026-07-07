/**
 * Retroactive session logger. Lets users add a forgotten focus block
 * with an explicit project, goal, start/end time, and precise focus
 * duration (via a slider bounded by the chosen window). Persists both
 * locally and to Supabase.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { getProjects, type ProjectTag } from "@/lib/projects";
import { getProjectGoals, type ProjectGoal } from "@/lib/goals";
import { addSession } from "@/lib/sessions";
import { saveSessionRemote, getUserId } from "@/lib/supabase";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayIsoAt(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

function defaultStart(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - 30);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function defaultEnd(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function diffMinutes(startHHMM: string, endHHMM: string): number {
  const [sh, sm] = startHHMM.split(":").map(Number);
  const [eh, em] = endHHMM.split(":").map(Number);
  const start = (sh || 0) * 60 + (sm || 0);
  let end = (eh || 0) * 60 + (em || 0);
  if (end <= start) end += 24 * 60; // wrap over midnight
  return end - start;
}

export function AddSessionModal({ open, onOpenChange }: Props) {
  const [projects, setProjects] = useState<ProjectTag[]>([]);
  const [goals, setGoals] = useState<ProjectGoal[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [goalId, setGoalId] = useState<string>("");
  const [goalText, setGoalText] = useState<string>("");
  const [task, setTask] = useState("");
  const [start, setStart] = useState(defaultStart());
  const [end, setEnd] = useState(defaultEnd());
  const [focus, setFocus] = useState<number>(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProjects(getProjects());
    setTask("");
    setProjectId("");
    setGoalId("");
    setGoalText("");
    setStart(defaultStart());
    setEnd(defaultEnd());
    setFocus(30);
    setSaving(false);
  }, [open]);

  useEffect(() => {
    setGoals(projectId ? getProjectGoals(projectId) : []);
    setGoalId("");
    setGoalText("");
  }, [projectId]);


  const windowMinutes = useMemo(() => Math.max(1, diffMinutes(start, end)), [start, end]);

  // Keep focus ≤ window
  useEffect(() => {
    setFocus((f) => Math.min(f, windowMinutes));
  }, [windowMinutes]);

  const project = projects.find((p) => p.id === projectId) ?? null;

  async function handleSave() {
    if (saving) return;
    const cleanTask = task.trim() || "Untitled session";
    const startedAt = todayIsoAt(start);
    // Build completed relative to start to preserve midnight wrap
    const startedDate = new Date(startedAt);
    const completedDate = new Date(startedDate.getTime() + windowMinutes * 60 * 1000);
    const completedAt = completedDate.toISOString();
    const focused = Math.max(1, Math.min(focus, windowMinutes));

    setSaving(true);
    const localId = crypto.randomUUID();
    addSession({
      id: localId,
      task: cleanTask,
      plannedMinutes: windowMinutes,
      focusedMinutes: focused,
      startedAt,
      completedAt,
      projectId: project?.id,
      projectName: project?.name,
      projectColor: project?.color,
      goalText: goalText || undefined,
      tags: goalText ? [goalText] : undefined,
    });

    const res = await saveSessionRemote({
      user_id: getUserId(),
      task_name: cleanTask,
      project_tag: project?.name ?? null,
      planned_duration: windowMinutes,
      actual_duration: focused,
      started_at: startedAt,
      completed_at: completedAt,
      was_aborted: false,
      tags: goalText ? [goalText] : undefined,
    }).catch(() => ({ ok: false as const, queued: true as const }));

    if (res && !res.ok && !("queued" in res && res.queued)) {
      toast.error("Session saved locally", {
        description: "Cloud sync failed. We'll try again later.",
      });
    } else {
      toast.success("Session added", {
        description: `${focused} min · ${cleanTask}`,
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-amber-500/20 bg-[#0e0e0e]/95 backdrop-blur">
        <DialogHeader>
          <DialogTitle className="font-display text-xl tracking-tight text-amber-100">
            Log a session
          </DialogTitle>
          <div className="text-[10px] uppercase tracking-[0.28em] text-amber-400/60 mt-1">
            Retroactive entry · today
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Task */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              One thing
            </div>
            <Input
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="What did you focus on?"
              className="bg-background/40 border-border/60"
              maxLength={140}
            />
          </div>

          {/* Project pills */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Project
            </div>
            {projects.length === 0 ? (
              <div className="text-xs text-muted-foreground/60 italic">
                No projects yet. Create one in Projects first.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {projects.map((p) => {
                  const on = projectId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProjectId(on ? "" : p.id)}
                      className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] tracking-wide transition-all"
                      style={
                        on
                          ? {
                              background: `${p.color}26`,
                              border: `1px solid ${p.color}`,
                              color: p.color,
                              boxShadow: `0 0 12px ${p.color}33`,
                            }
                          : {
                              background: "transparent",
                              border: "1px solid rgba(255,255,255,0.10)",
                              color: "rgba(255,255,255,0.65)",
                            }
                      }
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Goal pills (project-scoped) */}
          {projectId && goals.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Goal · optional
              </div>
              <div className="flex flex-wrap gap-1.5">
                {goals.map((g) => {
                  const on = goalText.trim().toLowerCase() === g.text.trim().toLowerCase();
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGoalText(on ? "" : g.text)}
                      className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] tracking-wide transition-all"
                      style={
                        on
                          ? {
                              background: `${g.color}26`,
                              border: `1px solid ${g.color}`,
                              color: g.color,
                            }
                          : {
                              background: "transparent",
                              border: "1px solid rgba(255,255,255,0.10)",
                              color: "rgba(255,255,255,0.6)",
                            }
                      }
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />
                      <span className="truncate max-w-[10rem]">{g.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time window */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Start
              </label>
              <Input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="bg-background/40 border-border/60 tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                End
              </label>
              <Input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="bg-background/40 border-border/60 tabular-nums"
              />
            </div>
          </div>

          {/* Focus duration slider */}
          <div className="space-y-2 pt-1">
            <div className="flex items-baseline justify-between">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Focus time
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 tabular-nums">
                window {windowMinutes} min
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-3xl tabular-nums tracking-tight text-amber-100">
                {focus}
              </span>
              <span className="text-xs text-muted-foreground">min</span>
              {focus < windowMinutes && (
                <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                  breaks excluded
                </span>
              )}
            </div>
            <Slider
              min={1}
              max={windowMinutes}
              step={1}
              value={[focus]}
              onValueChange={(v) => setFocus(v[0])}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 px-6 h-11 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <Plus className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2} />}
            Save session
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
