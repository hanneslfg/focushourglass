import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, Plus, Trash2, Check, X, FolderKanban, Pencil } from "lucide-react";
import {
  addProject,
  deleteProject,
  getProjects,
  updateProject,
  TAG_COLORS,
  type ProjectTag,
} from "@/lib/projects";
import { getSessions, dayKey, type Session } from "@/lib/sessions";
import { SessionDetailModal } from "./SessionDetailModal";
import { ProjectTagsManager } from "./ProjectTagsManager";
import { ProjectGoalsSection } from "./ProjectGoalsSection";

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

export function ProjectsView() {
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
    const map = new Map<
      string,
      { totalMin: number; count: number; firstAt: number; lastAt: number }
    >();
    for (const s of sessions) {
      if (!s.projectId) continue;
      const cur =
        map.get(s.projectId) ?? {
          totalMin: 0,
          count: 0,
          firstAt: Date.now(),
          lastAt: 0,
        };
      cur.totalMin += s.focusedMinutes || 0;
      cur.count += 1;
      const ts = new Date(s.startedAt || s.completedAt).getTime();
      if (ts < cur.firstAt) cur.firstAt = ts;
      if (ts > cur.lastAt) cur.lastAt = ts;
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
      <ProjectDetailFull
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
    <div className="w-full max-w-6xl mx-auto px-5 sm:px-8 md:px-12 py-10 md:py-16">
      <header className="mb-10 md:mb-14 flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground mb-2">
            Long-term focus
          </div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tight">
            Projects
          </h1>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-full border border-border hover:border-foreground/60 hover:bg-accent/40 transition-colors text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} /> New project
          </button>
        )}
      </header>

      {adding && (
        <div className="mb-8 rounded-xl border border-border bg-card/60 p-5 max-w-xl">
          <div className="flex items-center gap-3">
            <span
              className="h-3 w-3 rounded-full shrink-0"
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
              className="flex-1 bg-transparent border-b border-border focus:border-foreground/60 outline-none text-base py-2"
            />
            <button
              onClick={commitNew}
              className="h-9 w-9 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
            >
              <Check className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
              className="h-9 w-9 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`h-6 w-6 rounded-full transition-transform ${
                  newColor === c ? "ring-2 ring-foreground/70 scale-110" : ""
                }`}
                style={{ background: c }}
                aria-label={`Pick color ${c}`}
              />
            ))}
          </div>
        </div>
      )}

      {projects.length === 0 && !adding ? (
        <div className="border border-dashed border-border rounded-xl py-16 text-center">
          <FolderKanban
            className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3"
            strokeWidth={1.25}
          />
          <p className="text-sm text-muted-foreground">
            No projects yet. Create one to start tracking long-term goals.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const st = projectStats.get(p.id);
            return (
              <li key={p.id}>
                <button
                  onClick={() => setActiveId(p.id)}
                  className="group w-full text-left rounded-xl border border-border bg-card/50 hover:bg-card hover:border-foreground/40 transition-colors p-6 h-full flex flex-col justify-between min-h-[180px]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className="h-3 w-3 mt-2 rounded-full shrink-0"
                      style={{ background: p.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-xl tracking-tight truncate">
                        {p.name}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
                        {st ? `${st.count} session${st.count === 1 ? "" : "s"}` : "No sessions"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <div className="font-display text-3xl tracking-tight tabular-nums">
                        {st ? fmtHours(st.totalMin) : "0m"}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
                        total focused
                      </div>
                    </div>
                    {st && st.lastAt > 0 && (
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          last
                        </div>
                        <div className="text-xs text-foreground/70 mt-0.5">
                          {formatDate(new Date(st.lastAt))}
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProjectDetailFull({
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
  const [openSession, setOpenSession] = useState<Session | null>(null);
  const totalMin = sessions.reduce((s, x) => s + (x.focusedMinutes || 0), 0);
  const firstAt = sessions.reduce(
    (m, x) => Math.min(m, new Date(x.startedAt || x.completedAt).getTime()),
    Date.now(),
  );
  const trackingSince = sessions.length > 0 ? new Date(firstAt) : null;
  const avgMin =
    sessions.length > 0 ? Math.round(totalMin / sessions.length) : 0;

  // Activity grid: last 26 weeks (Mon-Sun cols), bigger cells for full-screen
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
    const WEEKS = 26;
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
    <div className="w-full max-w-6xl mx-auto px-5 sm:px-8 md:px-12 py-10 md:py-14">
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Back to all projects
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete project "${project.name}"? Sessions stay intact.`)) {
              onDelete();
            }
          }}
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Delete
        </button>
      </div>

      <ProjectHeaderEditable project={project} />

      <ProjectTagsManager projectId={project.id} accent={project.color} />




      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
        <BigStat label="Total focused" value={fmtHours(totalMin)} />
        <BigStat label="Sessions" value={String(sessions.length)} />
        <BigStat
          label="Avg session"
          value={avgMin > 0 ? `${avgMin}m` : "—"}
        />
        <BigStat
          label="Tracking since"
          value={trackingSince ? formatDate(trackingSince) : "—"}
        />
      </section>

      <section className="mb-12">
        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground mb-3">
          Last 26 weeks
        </div>
        <div className="rounded-xl border border-border bg-card/40 p-5 overflow-x-auto">
          <div className="flex" style={{ gap: 3 }}>
            {weeks.map((col, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: 3 }}>
                {col.map((cell, di) => (
                  <div
                    key={di}
                    title={
                      cell.future
                        ? ""
                        : `${cell.min} min · ${formatDate(cell.date)}`
                    }
                    className={`h-3.5 w-3.5 md:h-4 md:w-4 rounded-[3px] ${
                      cell.future || intensity(cell.min) === 0 ? "bg-foreground/[0.06]" : ""
                    }`}
                    style={cell.future ? undefined : cellStyle(intensity(cell.min))}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground mb-4">
          Task history
        </div>
        {byDay.length === 0 ? (
          <p className="text-sm text-muted-foreground/70 italic">
            No sessions logged for this project yet.
          </p>
        ) : (
          <ol className="space-y-6">
            {byDay.map(([key, list]) => {
              const total = list.reduce((s, x) => s + (x.focusedMinutes || 0), 0);
              return (
                <li key={key}>
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      {formatDate(new Date(key))}
                    </div>
                    <div className="text-[11px] tabular-nums text-muted-foreground">
                      {fmtHours(total)}
                    </div>
                  </div>
                  <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                    {list.map((s) => (
                      <li
                        key={s.id}
                        onClick={() => setOpenSession(s)}
                        className="px-4 py-3 flex items-center gap-3 bg-card/40 cursor-pointer hover:bg-card/70 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">
                            {s.task || "Untitled"}
                          </div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
                            {formatTime(new Date(s.startedAt || s.completedAt))}
                          </div>
                          {s.tags && s.tags.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {s.tags.map((t) => (
                                <span
                                  key={t}
                                  className="inline-block px-1.5 py-px rounded text-[9px] tracking-wide uppercase"
                                  style={{
                                    background: "rgba(245,158,11,0.10)",
                                    color: "rgba(252,211,77,0.95)",
                                    border: "1px solid rgba(245,158,11,0.28)",
                                  }}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-sm tabular-nums text-muted-foreground shrink-0">
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
      </section>

      <SessionDetailModal
        session={openSession}
        open={!!openSession}
        onOpenChange={(o) => !o && setOpenSession(null)}
      />
    </div>
  );
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 px-4 py-5">
      <div className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="font-display text-2xl md:text-3xl tracking-tight mt-1.5 truncate">
        {value}
      </div>
    </div>
  );
}

function ProjectHeaderEditable({ project }: { project: ProjectTag }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color);

  useEffect(() => {
    setName(project.name);
    setColor(project.color);
  }, [project.id, project.name, project.color]);

  function save() {
    const trimmed = name.trim().slice(0, 30);
    if (!trimmed) {
      setName(project.name);
      setEditing(false);
      return;
    }
    updateProject(project.id, { name: trimmed, color });
    setEditing(false);
  }

  if (!editing) {
    return (
      <header className="flex items-center gap-4 mb-10 group">
        <span
          className="h-5 w-5 rounded-full shrink-0"
          style={{ background: project.color }}
        />
        <h1 className="font-display text-4xl md:text-5xl tracking-tight truncate">
          {project.name}
        </h1>
        <button
          onClick={() => setEditing(true)}
          className="ml-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
          aria-label="Edit project"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} /> Edit
        </button>
      </header>
    );
  }

  return (
    <header className="mb-10 rounded-xl bg-card/40 p-5">
      <div className="flex items-center gap-3">
        <span
          className="h-4 w-4 rounded-full shrink-0"
          style={{ background: color }}
        />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 30))}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setName(project.name);
              setColor(project.color);
              setEditing(false);
            }
          }}
          className="flex-1 bg-transparent border-b border-border focus:border-foreground/60 outline-none font-display text-2xl md:text-3xl tracking-tight py-1"
        />
        <button
          onClick={save}
          className="h-9 w-9 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
          aria-label="Save"
        >
          <Check className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          onClick={() => {
            setName(project.name);
            setColor(project.color);
            setEditing(false);
          }}
          className="h-9 w-9 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {TAG_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`h-6 w-6 rounded-full transition-transform ${
              color === c ? "ring-2 ring-foreground/70 scale-110" : ""
            }`}
            style={{ background: c }}
            aria-label={`Pick color ${c}`}
          />
        ))}
      </div>
    </header>
  );
}
