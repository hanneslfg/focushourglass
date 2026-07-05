import { useEffect, useMemo, useState } from "react";
import { Plus, Check, X, Trash2, Pencil } from "lucide-react";
import {
  addGoal,
  deleteGoal,
  getProjectGoals,
  updateGoal,
  GOAL_COLORS,
  type ProjectGoal,
} from "@/lib/goals";

function fmtHM(mins: number) {
  if (!mins || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Compact color palette shared between add + edit rows. */
function ColorPalette({
  value,
  onChange,
  size = 5,
}: {
  value: string;
  onChange: (c: string) => void;
  size?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {GOAL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`rounded-full transition-transform ${value === c ? "ring-2 ring-foreground/70 scale-110" : "hover:scale-105"}`}
          style={{ background: c, width: size, height: size, minWidth: size, minHeight: size, padding: 0, borderRadius: "9999px", boxShadow: "0 0 0 1px rgba(0,0,0,0.15) inset" }}
          aria-label={`Pick color ${c}`}
        >
          <span className="block" style={{ width: size, height: size, borderRadius: "9999px" }} />
        </button>
      ))}
    </div>
  );
}

interface Props {
  projectId: string;
  /**
   * Focused minutes for this project, keyed by lowercased goal text.
   * Time spent WITHOUT an active goal selection is not attributed here —
   * goals only accumulate their own, explicitly-selected sessions.
   */
  focusedMinutesByGoal: Map<string, number>;
}

export function ProjectGoalsSection({ projectId, focusedMinutesByGoal }: Props) {

  const [goals, setGoals] = useState<ProjectGoal[]>([]);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newHours, setNewHours] = useState("");
  const [newColor, setNewColor] = useState(GOAL_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setGoals(getProjectGoals(projectId));
    sync();
    window.addEventListener("hourglass:goals", sync);
    return () => window.removeEventListener("hourglass:goals", sync);
  }, [projectId]);

  const sorted = useMemo(() => goals, [goals]);

  function commitNew() {
    const text = newText.trim();
    if (!text) {
      setAdding(false);
      setNewText("");
      setNewHours("");
      return;
    }
    const hrs = Number(newHours);
    const targetMinutes = Number.isFinite(hrs) && hrs > 0 ? Math.round(hrs * 60) : 0;
    addGoal(projectId, text, { targetMinutes, color: newColor });
    setNewText("");
    setNewHours("");
    setNewColor(GOAL_COLORS[0]);
    setAdding(false);
  }

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Goals · milestones
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            Set what "done" looks like. Color-code each milestone to prioritize.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border hover:border-foreground/60 hover:bg-accent/40 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3 w-3" strokeWidth={1.75} /> New goal
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3 rounded-lg border border-border bg-card/60 p-4">
          <div className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: newColor, boxShadow: `0 0 6px ${newColor}55` }}
            />
            <input
              autoFocus
              value={newText}
              onChange={(e) => setNewText(e.target.value.slice(0, 140))}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNew();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewText("");
                  setNewHours("");
                }
              }}
              placeholder="Milestone (e.g. Ship v1 landing page)"
              className="flex-1 bg-transparent border-b border-border focus:border-foreground/60 outline-none text-sm py-1.5"
            />
            <input
              value={newHours}
              onChange={(e) => setNewHours(e.target.value.replace(/[^0-9.]/g, "").slice(0, 5))}
              onKeyDown={(e) => { if (e.key === "Enter") commitNew(); }}
              placeholder="hrs"
              inputMode="decimal"
              className="w-16 bg-transparent border-b border-border focus:border-foreground/60 outline-none text-sm py-1.5 text-right tabular-nums"
            />
            <button
              onClick={commitNew}
              className="h-8 w-8 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
              aria-label="Save goal"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewText("");
                setNewHours("");
              }}
              className="h-8 w-8 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
          <div className="mt-3">
            <ColorPalette value={newColor} onChange={setNewColor} size={18} />
          </div>
        </div>
      )}

      {sorted.length === 0 && !adding ? (
        <div className="rounded-lg border border-dashed border-border/70 py-8 text-center">
          <p className="text-xs text-muted-foreground/70 italic">
            No goals yet. Add one to define the finish line for this project.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((g) => (
            <GoalRow
              key={g.id}
              goal={g}
              editing={editingId === g.id}
              focusedMinutes={focusedMinutes}
              onEdit={() => setEditingId(g.id)}
              onDone={() => setEditingId(null)}
              onSaveText={(text) => updateGoal(projectId, g.id, { text })}
              onSaveTarget={(m) => updateGoal(projectId, g.id, { targetMinutes: m })}
              onSaveColor={(c) => updateGoal(projectId, g.id, { color: c })}
              onToggleDone={() => updateGoal(projectId, g.id, { done: !g.done })}
              onDelete={() => {
                deleteGoal(projectId, g.id);
                if (editingId === g.id) setEditingId(null);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface RowProps {
  goal: ProjectGoal;
  editing: boolean;
  focusedMinutes: number;
  onEdit: () => void;
  onDone: () => void;
  onSaveText: (t: string) => void;
  onSaveTarget: (m: number) => void;
  onSaveColor: (c: string) => void;
  onToggleDone: () => void;
  onDelete: () => void;
}

function GoalRow({
  goal,
  editing,
  focusedMinutes,
  onEdit,
  onDone,
  onSaveText,
  onSaveTarget,
  onSaveColor,
  onToggleDone,
  onDelete,
}: RowProps) {
  const [text, setText] = useState(goal.text);
  const [hours, setHours] = useState(goal.targetMinutes > 0 ? String(goal.targetMinutes / 60) : "");

  useEffect(() => {
    setText(goal.text);
    setHours(goal.targetMinutes > 0 ? String(goal.targetMinutes / 60) : "");
  }, [goal.id, goal.text, goal.targetMinutes]);

  const pct =
    goal.targetMinutes > 0
      ? Math.min(1, focusedMinutes / goal.targetMinutes)
      : 0;

  function commit() {
    const cleanText = text.trim();
    if (cleanText && cleanText !== goal.text) onSaveText(cleanText);
    const hrs = Number(hours);
    const targetMinutes = Number.isFinite(hrs) && hrs > 0 ? Math.round(hrs * 60) : 0;
    if (targetMinutes !== goal.targetMinutes) onSaveTarget(targetMinutes);
    onDone();
  }

  return (
    <li
      className="rounded-lg border border-border bg-card/40 hover:bg-card/60 transition-colors overflow-hidden"
      style={{ borderLeft: `3px solid ${goal.color}` }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={onToggleDone}
          className={`shrink-0 h-5 w-5 rounded-full border flex items-center justify-center transition-colors ${
            goal.done ? "border-transparent" : "border-border hover:border-foreground/60"
          }`}
          style={goal.done ? { background: goal.color } : undefined}
          aria-label={goal.done ? "Mark as not done" : "Mark as done"}
        >
          {goal.done && <Check className="h-3 w-3 text-black/80" strokeWidth={3} />}
        </button>

        {editing ? (
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 140))}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setText(goal.text); onDone(); }
            }}
            className="flex-1 bg-transparent border-b border-border focus:border-foreground/60 outline-none text-sm py-1"
          />
        ) : (
          <button
            onClick={onEdit}
            className={`flex-1 text-left text-sm truncate ${goal.done ? "line-through text-muted-foreground/60" : ""}`}
            title="Click to edit"
          >
            {goal.text}
          </button>
        )}

        {editing ? (
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, "").slice(0, 5))}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setHours(goal.targetMinutes > 0 ? String(goal.targetMinutes / 60) : ""); onDone(); }
            }}
            placeholder="hrs"
            inputMode="decimal"
            className="w-14 bg-transparent border-b border-border focus:border-foreground/60 outline-none text-xs py-1 text-right tabular-nums"
          />
        ) : goal.targetMinutes > 0 ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums shrink-0">
            {fmtHM(Math.min(focusedMinutes, goal.targetMinutes))} / {fmtHM(goal.targetMinutes)}
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">no target</span>
        )}

        {editing ? (
          <>
            <button
              onClick={commit}
              className="h-7 w-7 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
              aria-label="Save"
            >
              <Check className="h-3 w-3" strokeWidth={1.75} />
            </button>
            <button
              onClick={onDelete}
              className="h-7 w-7 rounded-full border border-border hover:border-destructive text-muted-foreground hover:text-destructive flex items-center justify-center"
              aria-label="Delete goal"
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.75} />
            </button>
          </>
        ) : (
          <button
            onClick={onEdit}
            className="h-7 w-7 rounded-full border border-transparent hover:border-border text-muted-foreground/60 hover:text-foreground flex items-center justify-center"
            aria-label="Edit goal"
          >
            <Pencil className="h-3 w-3" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {editing && (
        <div className="px-4 pb-3 pt-1 flex items-center justify-between gap-3 border-t border-border/60">
          <ColorPalette value={goal.color} onChange={onSaveColor} size={16} />
          <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/60">Enter to save · Esc to cancel</span>
        </div>
      )}

      {!editing && goal.targetMinutes > 0 && !goal.done && (
        <div className="h-1 w-full bg-foreground/[0.05]">
          <div
            className="h-full transition-all"
            style={{ width: `${pct * 100}%`, background: goal.color, boxShadow: `0 0 8px ${goal.color}66` }}
          />
        </div>
      )}
    </li>
  );
}
