import { useEffect, useMemo, useState } from "react";
import { RotateCcw, ChevronDown } from "lucide-react";
import { ActivityGraph, type View as ActivityView } from "@/components/ActivityGraph";
import { getSessions, type Session } from "@/lib/sessions";
import { getProjects, type ProjectTag } from "@/lib/projects";
import { weekColumnIndex } from "@/lib/settings";

type TimePreset = "today" | "week" | "month" | "year" | "ytd" | "custom";

const PRESET_LABELS: Record<TimePreset, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
  ytd: "YTD",
  custom: "Custom range",
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}
function startOfWeek(d: Date) {
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1).getTime();
}
function fmtHours(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function toInputDate(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function presetRange(preset: TimePreset, customFrom: string, customTo: string): [number, number] {
  const now = new Date();
  const end = endOfDay(now);
  switch (preset) {
    case "today":
      return [startOfDay(now), end];
    case "week":
      return [startOfWeek(now), end];
    case "month":
      return [startOfMonth(now), end];
    case "year":
    case "ytd":
      return [startOfYear(now), end];
    case "custom": {
      const from = customFrom ? new Date(customFrom).getTime() : 0;
      const to = customTo ? endOfDay(new Date(customTo)) : end;
      return [from, to];
    }
  }
}

export function AnalyticsView({
  activityView,
  onActivityViewChange,
}: {
  activityView: ActivityView;
  onActivityViewChange: (v: ActivityView) => void;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<ProjectTag[]>([]);
  const [preset, setPreset] = useState<TimePreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [showProjectFilter, setShowProjectFilter] = useState(false);

  useEffect(() => {
    const sync = () => setSessions(getSessions());
    const syncP = () => setProjects(getProjects());
    sync();
    syncP();
    window.addEventListener("hourglass:sessions", sync);
    window.addEventListener("hourglass:projects", syncP);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hourglass:sessions", sync);
      window.removeEventListener("hourglass:projects", syncP);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const [from, to] = useMemo(
    () => presetRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const filtered = useMemo(
    () =>
      sessions.filter((s) => {
        const ts = new Date(s.completedAt).getTime();
        if (ts < from || ts > to) return false;
        if (selectedProjectIds.size > 0) {
          if (!s.projectId || !selectedProjectIds.has(s.projectId)) return false;
        }
        return true;
      }),
    [sessions, from, to, selectedProjectIds],
  );

  const stats = useMemo(() => computeStats(filtered), [filtered]);

  const filtersActive =
    preset !== "month" || selectedProjectIds.size > 0 || customFrom || customTo;

  function resetFilters() {
    setPreset("month");
    setSelectedProjectIds(new Set());
    setCustomFrom("");
    setCustomTo("");
  }

  function toggleProject(id: string) {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rangeLabel =
    preset === "custom"
      ? `${customFrom || "…"} → ${customTo || "…"}`
      : PRESET_LABELS[preset];

  const selectedProjectsList = projects.filter((p) => selectedProjectIds.has(p.id));

  return (
    <div className="mx-auto w-full max-w-5xl px-5 md:px-10 py-8 md:py-12 space-y-10">
      <header>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Insights
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight mt-1">
          Analytics
        </h1>
      </header>

      <ActivityGraph view={activityView} onViewChange={onActivityViewChange} />

      <section className="rounded-md border border-border bg-background/40 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Viewing
          </div>
          {filtersActive ? (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={1.75} /> Reset
            </button>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-foreground/90">{rangeLabel}</span>
          {selectedProjectsList.length > 0 ? (
            <>
              <span className="text-muted-foreground">·</span>
              {selectedProjectsList.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1.5 px-2 h-6 rounded-full border border-border"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                  {p.name}
                </span>
              ))}
            </>
          ) : (
            <span className="text-muted-foreground">· All projects</span>
          )}
        </div>
      </section>

      <section>
        <SectionTitle>Time range</SectionTitle>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(Object.keys(PRESET_LABELS) as TimePreset[]).map((p) => {
            const active = preset === p;
            return (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-2.5 h-8 rounded-full text-xs border transition-colors ${
                  active
                    ? "border-foreground/70 bg-foreground/5 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                }`}
              >
                {PRESET_LABELS[p]}
              </button>
            );
          })}
        </div>
        {preset === "custom" && (
          <div className="mt-3 flex items-center gap-2 max-w-md">
            <input
              type="date"
              value={customFrom || toInputDate(Date.now() - 7 * 86400000)}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="flex-1 bg-background border border-border rounded-md px-2 py-1.5 text-xs outline-none focus:border-foreground/60"
            />
            <span className="text-muted-foreground text-xs">→</span>
            <input
              type="date"
              value={customTo || toInputDate(Date.now())}
              onChange={(e) => setCustomTo(e.target.value)}
              className="flex-1 bg-background border border-border rounded-md px-2 py-1.5 text-xs outline-none focus:border-foreground/60"
            />
          </div>
        )}
      </section>

      {projects.length > 0 && (
        <section>
          <button
            onClick={() => setShowProjectFilter((v) => !v)}
            className="w-full flex items-center justify-between text-left"
            aria-expanded={showProjectFilter}
          >
            <SectionTitle>Filter by project</SectionTitle>
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                showProjectFilter ? "rotate-180" : ""
              }`}
              strokeWidth={1.75}
            />
          </button>
          {showProjectFilter && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedProjectIds(new Set())}
                className={`px-2.5 h-8 rounded-full text-xs border transition-colors ${
                  selectedProjectIds.size === 0
                    ? "border-foreground/70 bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                }`}
              >
                All projects
              </button>
              {projects.map((p) => {
                const active = selectedProjectIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleProject(p.id)}
                    className="inline-flex items-center gap-1.5 pl-2 pr-2.5 h-8 rounded-full text-xs border transition-colors"
                    style={
                      active
                        ? { background: p.color, borderColor: p.color, color: "#1a1208" }
                        : { borderColor: "var(--border)" }
                    }
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: active ? "#1a1208" : p.color }}
                    />
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Total" value={fmtHours(stats.totalMin)} />
        <Stat label="Sessions" value={String(stats.count)} />
        <Stat
          label="Longest streak"
          value={`${stats.streak} session${stats.streak === 1 ? "" : "s"}`}
        />
        <Stat
          label="Avg session"
          value={stats.avgMin > 0 ? `${stats.avgMin} min` : "—"}
        />
      </section>

    </div>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
      {children}
    </h3>
  );
}



function computeStats(sessions: Session[]) {
  const totalMin = sessions.reduce((a, s) => a + s.focusedMinutes, 0);
  const ordered = [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  let streak = 0;
  let best = 0;
  let prevEnd = -Infinity;
  for (const s of ordered) {
    const start = new Date(s.startedAt).getTime();
    const end = new Date(s.completedAt).getTime();
    const gap = (start - prevEnd) / 60000;
    if (gap <= 15) streak += 1;
    else streak = 1;
    if (streak > best) best = streak;
    prevEnd = end;
  }
  const avgMin =
    sessions.length > 0
      ? Math.round(sessions.reduce((a, s) => a + s.focusedMinutes, 0) / sessions.length)
      : 0;
  return { totalMin, count: sessions.length, streak: best, avgMin };
}
