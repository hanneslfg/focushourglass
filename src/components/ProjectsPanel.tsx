import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Check, X } from "lucide-react";
import {
  addProject,
  deleteProject,
  getProjects,
  TAG_COLORS,
  type ProjectTag,
} from "@/lib/projects";
import { getSessions, dayKey, type Session } from "@/lib/sessions";

function fmtHours(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function ProjectsPanel() {
  const [projects, setProjects] = useState<ProjectTag[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);

  useEffect(() => {
    const syncP = () => setProjects(getProjects());
    const syncS = () => setSessions(getSessions());
    syncP();
    syncS();
    window.addEventListener("hourglass:projects", syncP);
    window.addEventListener("hourglass:sessions", syncS);
    return () => {
      window.removeEventListener("hourglass:projects", syncP);
      window.removeEventListener("hourglass:sessions", syncS);
    };
  }, []);

  const projectStats = useMemo(() => {
    const map = new Map<string, { totalMin: number; count: number; firstAt: number }>();
    for (const s of sessions) {
      if (!s.projectId) continue;
      const cur = map.get(s.projectId) ?? {
        totalMin: 0,
        count: 0,
        firstAt: Date.now(),
      };
      cur.totalMin += s.focusedMinutes || 0;
      cur.count += 1;
      const ts = new Date(s.startedAt || s.completedAt).getTime();
      if (ts < cur.firstAt) cur.firstAt = ts;
      map.set(s.projectId, cur);
    }
    return map;
  }, [sessions]);

  function commitNew() {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      setNewName("");
      return;
    }
    addProject(name, newColor);
    setNewName("");
    setAdding(false);
  }

  if (activeId) {
    const project = projects.find((p) => p.id === activeId);
    if (!project) {
      setActiveId(null);
      return null;
    }
    return (
      <ProjectDetail
        project={project}
        sessions={sessions.filter((s) => s.projectId === project.id)}
        onBack={() => setActiveId(null)}
        onDelete={() => {
          deleteProject(project.id);
          setActiveId(null);
        }}
      />
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          All projects
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" strokeWidth={1.75} /> New
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-md border border-border bg-background/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: newColor }}
            />
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 30))}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNew();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewName("");
                }
              }}
              placeholder="Project name"
              className="flex-1 bg-transparent border-b border-border focus:border-foreground/60 outline-none text-sm py-1"
            />
            <button
              onClick={commitNew}
              className="h-7 w-7 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
              className="h-7 w-7 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`h-5 w-5 rounded-full transition-transform ${
                  newColor === c ? "ring-2 ring-foreground/70 scale-110" : ""
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}

      {projects.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground/70 italic">
          No projects yet. Create one to start tracking long-term goals.
        </p>
      )}

      <ul className="space-y-2">
        {projects.map((p) => {
          const st = projectStats.get(p.id);
          return (
            <li key={p.id}>
              <button
                onClick={() => setActiveId(p.id)}
                className="w-full group flex items-center gap-3 px-3 py-3 rounded-md border border-border bg-background/40 hover:bg-foreground/[0.04] hover:border-foreground/40 transition-colors text-left"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: p.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{p.name}</div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
                    {st ? `${st.count} session${st.count === 1 ? "" : "s"}` : "No sessions"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-sm tracking-tight tabular-nums">
                    {st ? fmtHours(st.totalMin) : "—"}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    total
                  </div>
                </div>
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground/70 group-hover:text-foreground transition-colors shrink-0"
                  strokeWidth={1.5}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProjectDetail({
  project,
  sessions,
  onBack,
  onDelete,
}: {
  project: ProjectTag;
  sessions: Session[];
  onBack: () => void;
  onDelete: () => void;
}) {
  const totalMin = sessions.reduce((s, x) => s + (x.focusedMinutes || 0), 0);
  const firstAt = sessions.reduce(
    (m, x) => Math.min(m, new Date(x.startedAt || x.completedAt).getTime()),
    Date.now(),
  );
  const trackingSince = sessions.length > 0 ? new Date(firstAt) : null;

  // Mini activity grid: last 16 weeks (Mon-Sun cols)
  const weeks = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of sessions) {
      const k = s.completedAt.slice(0, 10);
      totals.set(k, (totals.get(k) ?? 0) + (s.focusedMinutes || 0));
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayIdx = (today.getDay() + 6) % 7;
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() - dayIdx);
    const WEEKS = 16;
    const firstMonday = new Date(currentMonday);
    firstMonday.setDate(currentMonday.getDate() - (WEEKS - 1) * 7);
    const out: Array<Array<{ date: Date; min: number; future: boolean }>> = [];
    for (let w = 0; w < WEEKS; w++) {
      const col: Array<{ date: Date; min: number; future: boolean }> = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(firstMonday);
        date.setDate(firstMonday.getDate() + w * 7 + d);
        col.push({
          date,
          min: totals.get(dayKey(date)) ?? 0,
          future: date.getTime() > today.getTime(),
        });
      }
      out.push(col);
    }
    return out;
  }, [sessions]);

  function intensity(m: number) {
    if (m <= 0) return 0;
    if (m < 30) return 1;
    if (m < 90) return 2;
    if (m < 150) return 3;
    return 4;
  }
  const accent = project.color || "#f4a261";
  const LEVEL_ALPHA: Record<number, number> = { 0: 0, 1: 0.25, 2: 0.45, 3: 0.7, 4: 1 };
  function cellStyle(lvl: number): React.CSSProperties {
    if (lvl === 0) return {};
    return { backgroundColor: accent, opacity: LEVEL_ALPHA[lvl] };
  }

  // Group sessions by day for the task list
  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of [...sessions].sort((a, b) =>
      a.completedAt < b.completedAt ? 1 : -1,
    )) {
      const k = s.completedAt.slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    }
    return [...map.entries()];
  }, [sessions]);

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} /> Projects
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete project "${project.name}"? Sessions stay intact.`)) {
              onDelete();
            }
          }}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3 w-3" strokeWidth={1.75} /> Delete
        </button>
      </div>

      <header className="flex items-center gap-3">
        <span
          className="h-4 w-4 rounded-full shrink-0"
          style={{ background: project.color }}
        />
        <h3 className="font-display text-2xl tracking-tight truncate">
          {project.name}
        </h3>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Total time" value={fmtHours(totalMin)} />
        <Stat label="Sessions" value={String(sessions.length)} />
      </div>
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Tracking since:{" "}
        <span className="text-foreground/80 normal-case tracking-normal">
          {trackingSince ? formatDate(trackingSince) : "—"}
        </span>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
          Last 16 weeks
        </div>
        <div className="rounded-md border border-border bg-background/40 p-3">
          <div className="flex" style={{ gap: 2 }}>
            {weeks.map((col, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: 2 }}>
                {col.map((cell, di) => (
                  <div
                    key={di}
                    title={
                      cell.future
                        ? ""
                        : `${cell.min} min · ${formatDate(cell.date)}`
                    }
                    className={`h-3 w-3 rounded-[2px] ${
                      cell.future || intensity(cell.min) === 0 ? "bg-foreground/[0.06]" : ""
                    }`}
                    style={cell.future ? undefined : cellStyle(intensity(cell.min))}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
          History
        </div>
        {byDay.length === 0 ? (
          <p className="text-xs text-muted-foreground/70 italic">
            No sessions logged for this project yet.
          </p>
        ) : (
          <ol className="space-y-4">
            {byDay.map(([key, list]) => {
              const total = list.reduce((s, x) => s + (x.focusedMinutes || 0), 0);
              const label = formatDate(new Date(key));
              return (
                <li key={key}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {label}
                    </div>
                    <div className="text-[11px] tabular-nums text-muted-foreground">
                      {fmtHours(total)}
                    </div>
                  </div>
                  <ul className="divide-y divide-border border border-border rounded-md overflow-hidden">
                    {list.map((s) => (
                      <li
                        key={s.id}
                        className="px-3 py-2 flex items-center gap-2.5 bg-background/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{s.task || "Untitled"}</div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
                            {formatTime(new Date(s.startedAt || s.completedAt))}
                          </div>
                        </div>
                        <div className="text-xs tabular-nums text-muted-foreground shrink-0">
                          {s.focusedMinutes}m
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-3">
      <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="font-display text-xl tracking-tight mt-1">{value}</div>
    </div>
  );
}
