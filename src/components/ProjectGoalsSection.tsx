import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Check,
  X,
  Trash2,
  Pencil,
  GripVertical,
  ChevronDown,
  Undo2,
} from "lucide-react";
import {
  addGoal,
  deleteGoal,
  getProjectGoals,
  reorderGoals,
  updateGoal,
  GOAL_COLORS,
  type ProjectGoal,
} from "@/lib/goals";

const GRACE_MS = 5000;

function fmtHM(mins: number) {
  if (!mins || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

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
  activeProjectTag?: string;
  focusedMinutesByGoal: Map<string, number>;
}

export function ProjectGoalsSection({ projectId, activeProjectTag, focusedMinutesByGoal }: Props) {
  const activeTag = (activeProjectTag ?? projectId ?? "").trim();
  const activeTagLower = activeTag.toLowerCase();

  const [goals, setGoals] = useState<ProjectGoal[]>([]);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newHours, setNewHours] = useState("");
  const [newColor, setNewColor] = useState(GOAL_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());

  // Goals in "5-second grace" mode: still is_completed=false in DB, but
  // visually collapsing. Value = timestamp when the row was clicked done.
  const [pending, setPending] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [, forceTick] = useState(0);
  useEffect(() => {
    const sync = () => setGoals(getProjectGoals(projectId));
    const bump = () => forceTick((t) => t + 1);
    sync();
    window.addEventListener("hourglass:goals", sync);
    window.addEventListener("hourglass:sessions", bump);
    return () => {
      window.removeEventListener("hourglass:goals", sync);
      window.removeEventListener("hourglass:sessions", bump);
    };
  }, [projectId]);

  // Cleanup any pending timers on unmount / project switch
  useEffect(() => {
    return () => {
      for (const t of Object.values(timers.current)) clearTimeout(t);
      timers.current = {};
    };
  }, [projectId]);

  const { active, completed } = useMemo(() => {
    const a: ProjectGoal[] = [];
    const c: ProjectGoal[] = [];
    // Strict client-side project filter: goals with no project_tag are
    // treated as general/fallback and shown everywhere; tagged goals only
    // appear in the matching project (case-insensitive).
    const filtered = goals.filter((g) => {
      const tag = (g.projectId ?? "").trim().toLowerCase();
      if (!tag) return true;
      return tag === activeTagLower || tag === (projectId ?? "").trim().toLowerCase();
    });
    for (const g of filtered) {
      if (g.done) c.push(g);
      else a.push(g);
    }
    return { active: a, completed: c };
  }, [goals, activeTagLower, projectId]);


  async function commitNew() {
    const text = newText.trim();
    if (!text) {
      setAdding(false);
      setNewText("");
      setNewHours("");
      return;
    }
    const hrs = Number(newHours);
    const targetMinutes = Number.isFinite(hrs) && hrs > 0 ? Math.round(hrs * 60) : 0;
    const tagForSave = activeTag || projectId;
    const saved = await addGoal(tagForSave, text, { targetMinutes, color: newColor });

    if (!saved) return;
    setNewText("");
    setNewHours("");
    setNewColor(GOAL_COLORS[0]);
    setAdding(false);
  }

  async function withBusy(id: string, action: () => Promise<boolean>) {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      return await action();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function startDone(id: string) {
    if (pending[id]) return;
    setPending((p) => ({ ...p, [id]: Date.now() }));
    timers.current[id] = setTimeout(() => {
      void withBusy(id, () => updateGoal(projectId, id, { done: true }));
      setPending((p) => {
        const { [id]: _, ...rest } = p;
        return rest;
      });
      delete timers.current[id];
    }, GRACE_MS);
  }

  function cancelDone(id: string) {
    const t = timers.current[id];
    if (t) clearTimeout(t);
    delete timers.current[id];
    setPending((p) => {
      const { [id]: _, ...rest } = p;
      return rest;
    });
  }

  function reopenCompleted(id: string) {
    void withBusy(id, () => updateGoal(projectId, id, { done: false }));
  }

  function handleDragStart(id: string) {
    setDragId(id);
  }
  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragId && dragId !== id) setDragOverId(id);
  }
  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const ids = active.map((g) => g.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    void reorderGoals(projectId, ids);
    setDragId(null);
    setDragOverId(null);
  }
  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Goals · milestones
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            Drag to reorder. Set what "done" looks like.
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

      {active.length === 0 && !adding ? (
        <div className="rounded-lg border border-dashed border-border/70 py-8 text-center">
          <p className="text-xs text-muted-foreground/70 italic">
            No active goals. Add one to define the finish line for this project.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {active.map((g) => (
            <GoalRow
              key={g.id}
              goal={g}
              editing={editingId === g.id}
              focusedMinutes={focusedMinutesByGoal.get(g.text.trim().toLowerCase()) ?? 0}
              isDragging={dragId === g.id}
              isDragOver={dragOverId === g.id && dragId !== g.id}
              pendingSince={pending[g.id] ?? null}
              busy={busyIds.has(g.id)}
              onEdit={() => setEditingId(g.id)}
              onDone={() => setEditingId(null)}
              onSaveText={(text) => withBusy(g.id, () => updateGoal(projectId, g.id, { text }))}
              onSaveTarget={(m) => withBusy(g.id, () => updateGoal(projectId, g.id, { targetMinutes: m }))}
              onSaveColor={(c) => withBusy(g.id, () => updateGoal(projectId, g.id, { color: c }))}
              onStartDone={() => startDone(g.id)}
              onCancelDone={() => cancelDone(g.id)}
              onDelete={() => {
                void withBusy(g.id, () => deleteGoal(projectId, g.id)).then((ok) => {
                  if (ok && editingId === g.id) setEditingId(null);
                });
              }}
              onDragStart={() => handleDragStart(g.id)}
              onDragOver={(e) => handleDragOver(e, g.id)}
              onDrop={() => handleDrop(g.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </ul>
      )}

      {completed.length > 0 && (
        <div className="mt-6 rounded-lg border border-border/60 bg-card/30 overflow-hidden">
          <button
            onClick={() => setShowCompleted((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-accent/30 transition-colors"
            aria-expanded={showCompleted}
          >
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Completed · {completed.length}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showCompleted ? "rotate-180" : ""}`}
              strokeWidth={1.75}
            />
          </button>
          {showCompleted && (
            <ul className="border-t border-border/50 divide-y divide-border/40 animate-fade-in">
              {completed.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{ borderLeft: `3px solid ${g.color}` }}
                >
                  <button
                    onClick={() => reopenCompleted(g.id)}
                    disabled={busyIds.has(g.id)}
                    className="shrink-0 h-5 w-5 rounded-full flex items-center justify-center"
                    style={{ background: g.color }}
                    aria-label="Reopen goal"
                    title="Reopen"
                  >
                    <Check className="h-3 w-3 text-black/80" strokeWidth={3} />
                  </button>
                  <span className="flex-1 text-sm truncate line-through text-muted-foreground/70">
                    {g.text}
                  </span>
                  {g.targetMinutes > 0 && (
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 tabular-nums">
                      {fmtHM(g.targetMinutes)}
                    </span>
                  )}
                  <button
                    onClick={() => void withBusy(g.id, () => deleteGoal(projectId, g.id))}
                    disabled={busyIds.has(g.id)}
                    className="h-7 w-7 rounded-full border border-transparent hover:border-destructive text-muted-foreground/50 hover:text-destructive flex items-center justify-center"
                    aria-label="Delete goal"
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

interface RowProps {
  goal: ProjectGoal;
  editing: boolean;
  focusedMinutes: number;
  isDragging: boolean;
  isDragOver: boolean;
  pendingSince: number | null;
  busy: boolean;
  onEdit: () => void;
  onDone: () => void;
  onSaveText: (t: string) => Promise<boolean>;
  onSaveTarget: (m: number) => Promise<boolean>;
  onSaveColor: (c: string) => Promise<boolean>;
  onStartDone: () => void;
  onCancelDone: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function GoalRow({
  goal,
  editing,
  focusedMinutes,
  isDragging,
  isDragOver,
  pendingSince,
  busy,
  onEdit,
  onDone,
  onSaveText,
  onSaveTarget,
  onSaveColor,
  onStartDone,
  onCancelDone,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: RowProps) {
  const [text, setText] = useState(goal.text);
  const [hours, setHours] = useState(goal.targetMinutes > 0 ? String(goal.targetMinutes / 60) : "");

  useEffect(() => {
    setText(goal.text);
    setHours(goal.targetMinutes > 0 ? String(goal.targetMinutes / 60) : "");
  }, [goal.id, goal.text, goal.targetMinutes]);

  // Live-updating countdown for the 5s grace period.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (pendingSince == null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [pendingSince]);
  const remainingMs =
    pendingSince != null ? Math.max(0, GRACE_MS - (now - pendingSince)) : 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const gracePct = pendingSince != null ? 1 - remainingMs / GRACE_MS : 0;
  const isPending = pendingSince != null;

  const pct =
    goal.targetMinutes > 0 ? Math.min(1, focusedMinutes / goal.targetMinutes) : 0;

  async function commit() {
    const cleanText = text.trim();
    if (cleanText && cleanText !== goal.text) {
      const ok = await onSaveText(cleanText);
      if (!ok) return;
    }
    const hrs = Number(hours);
    const targetMinutes = Number.isFinite(hrs) && hrs > 0 ? Math.round(hrs * 60) : 0;
    if (targetMinutes !== goal.targetMinutes) {
      const ok = await onSaveTarget(targetMinutes);
      if (!ok) return;
    }
    onDone();
  }

  return (
    <li
      draggable={!editing && !isPending && !busy}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`relative rounded-lg border bg-card/40 hover:bg-card/60 transition-all overflow-hidden ${
        isDragging ? "opacity-40" : ""
      } ${isDragOver ? "border-foreground/60 ring-1 ring-foreground/40" : "border-border"} ${
        isPending || busy ? "opacity-70" : ""
      }`}
      style={{ borderLeft: `3px solid ${goal.color}` }}
    >
      {/* Progress fill */}
      {goal.targetMinutes > 0 && !isPending && (
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 pointer-events-none transition-all duration-500"
          style={{ width: `${pct * 100}%`, background: goal.color, opacity: 0.12 }}
        />
      )}
      {/* Grace period sweep */}
      {isPending && (
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 pointer-events-none"
          style={{
            width: `${gracePct * 100}%`,
            background: goal.color,
            opacity: 0.28,
            transition: "width 100ms linear",
          }}
        />
      )}

      <div className="relative flex items-center gap-3 px-4 py-3">
        {!editing && (
          <span
            className={`shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors ${isPending ? "opacity-30 pointer-events-none" : ""}`}
            aria-hidden
          >
            <GripVertical className="h-4 w-4" strokeWidth={1.5} />
          </span>
        )}

        <button
          onClick={isPending ? onCancelDone : onStartDone}
          disabled={busy}
          className={`shrink-0 h-5 w-5 rounded-full border flex items-center justify-center transition-colors ${
            isPending ? "border-transparent" : "border-border hover:border-foreground/60"
          }`}
          style={isPending ? { background: goal.color } : undefined}
          aria-label={isPending ? "Undo complete" : "Mark as done"}
          title={isPending ? "Undo" : "Mark as done"}
        >
          {isPending && <Check className="h-3 w-3 text-black/80" strokeWidth={3} />}
        </button>

        {editing ? (
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 140))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") { setText(goal.text); onDone(); }
            }}
            className="flex-1 bg-transparent border-b border-border focus:border-foreground/60 outline-none text-sm py-1"
          />
        ) : (
          <button
            onClick={isPending ? onCancelDone : onEdit}
            className={`flex-1 text-left text-sm truncate ${isPending ? "line-through text-muted-foreground/70" : ""}`}
            title={isPending ? "Undo complete" : "Click to edit"}
          >
            {goal.text}
          </button>
        )}

        {isPending ? (
          <button
            onClick={onCancelDone}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border hover:border-foreground/60 text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors tabular-nums"
            aria-label="Undo complete"
          >
            <Undo2 className="h-3 w-3" strokeWidth={1.75} />
            Undo · {remainingSec}s
          </button>
        ) : editing ? (
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, "").slice(0, 5))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
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

        {!isPending && (editing ? (
          <>
            <button
              onClick={() => void commit()}
              disabled={busy}
              className="h-7 w-7 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
              aria-label="Save"
            >
              <Check className="h-3 w-3" strokeWidth={1.75} />
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
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
        ))}
      </div>

      {editing && (
        <div className="relative px-4 pb-3 pt-1 flex items-center justify-between gap-3 border-t border-border/60">
          <ColorPalette value={goal.color} onChange={onSaveColor} size={16} />
          <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/60">Enter to save · Esc to cancel</span>
        </div>
      )}
    </li>
  );
}
