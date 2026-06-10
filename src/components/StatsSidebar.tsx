import { useEffect, useMemo, useState } from "react";
import { BarChart3, X } from "lucide-react";
import { getSessions, type Session } from "@/lib/sessions";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function startOfWeek(d: Date) {
  // ISO week, Mon = first day
  const day = (d.getDay() + 6) % 7;
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return s.getTime();
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
function fmtHours(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function StatsSidebar() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    const sync = () => setSessions(getSessions());
    sync();
    window.addEventListener("hourglass:sessions", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hourglass:sessions", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const stats = useMemo(() => computeStats(sessions), [sessions]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 right-4 z-40 h-10 w-10 md:h-11 md:w-11 rounded-full border border-border bg-background/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/60 transition-colors touch-manipulation"
        aria-label="Open stats"
      >
        <BarChart3 className="h-4 w-4 md:h-[18px] md:w-[18px]" strokeWidth={1.5} />
      </button>

      {/* Overlay */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px] transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] bg-card border-l border-border shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="h-full flex flex-col">
          <header className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Insights
              </div>
              <h2 className="font-display text-2xl tracking-tight mt-0.5">
                Focus stats
              </h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-10 w-10 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center touch-manipulation"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7"
               style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}>
            {/* Totals */}
            <section className="grid grid-cols-3 gap-2">
              <Stat label="Today" value={fmtHours(stats.todayMin)} />
              <Stat label="Week" value={fmtHours(stats.weekMin)} />
              <Stat label="Month" value={fmtHours(stats.monthMin)} />
            </section>

            {/* Ring chart */}
            <section>
              <SectionTitle>By project · this month</SectionTitle>
              {stats.breakdown.length === 0 ? (
                <EmptyHint>No tagged sessions yet.</EmptyHint>
              ) : (
                <div className="flex items-center gap-5 mt-3">
                  <RingChart segments={stats.breakdown} />
                  <ul className="flex-1 space-y-2 min-w-0">
                    {stats.breakdown.map((s) => (
                      <li
                        key={s.name}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: s.color }}
                        />
                        <span className="truncate flex-1">{s.name}</span>
                        <span className="tabular-nums text-muted-foreground text-xs">
                          {Math.round(s.pct * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Streak + average */}
            <section className="grid grid-cols-2 gap-2">
              <Stat
                label="Streak this week"
                value={`${stats.streak} session${stats.streak === 1 ? "" : "s"}`}
              />
              <Stat
                label="Avg session"
                value={
                  stats.avgMin > 0 ? `${stats.avgMin} min` : "—"
                }
              />
            </section>

            {/* Timeline */}
            <section>
              <SectionTitle>Recent days</SectionTitle>
              {stats.byDay.length === 0 ? (
                <EmptyHint>Complete a session to see it here.</EmptyHint>
              ) : (
                <ol className="mt-3 space-y-4">
                  {stats.byDay.map((day) => (
                    <li key={day.key}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {day.label}
                        </div>
                        <div className="text-[11px] tabular-nums text-muted-foreground">
                          {fmtHours(day.total)}
                        </div>
                      </div>
                      <ul className="divide-y divide-border border border-border rounded-md overflow-hidden">
                        {day.sessions.map((s) => (
                          <li
                            key={s.id}
                            className="px-3 py-2 flex items-center gap-2.5 bg-background/40"
                          >
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{
                                background:
                                  s.projectColor ?? "var(--muted-foreground)",
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm truncate">{s.task}</div>
                              {s.projectName && (
                                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
                                  {s.projectName}
                                </div>
                              )}
                            </div>
                            <div className="text-xs tabular-nums text-muted-foreground shrink-0">
                              {s.focusedMinutes}m
                            </div>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      </aside>
    </>
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

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-xs text-muted-foreground/70 italic">{children}</p>
  );
}

function RingChart({
  segments,
}: {
  segments: { name: string; color: string; pct: number }[];
}) {
  const size = 96;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth={stroke}
      />
      {segments.map((s) => {
        const dash = s.pct * c;
        const offset = c - acc;
        const el = (
          <circle
            key={s.name}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            strokeLinecap="butt"
          />
        );
        acc += dash;
        return el;
      })}
    </svg>
  );
}

interface DayBucket {
  key: string;
  label: string;
  total: number;
  sessions: Session[];
}

function computeStats(sessions: Session[]) {
  const now = new Date();
  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  let todayMin = 0;
  let weekMin = 0;
  let monthMin = 0;
  const projectMap = new Map<
    string,
    { name: string; color: string; minutes: number }
  >();

  for (const s of sessions) {
    const ts = new Date(s.completedAt).getTime();
    if (ts >= dayStart) todayMin += s.focusedMinutes;
    if (ts >= weekStart) weekMin += s.focusedMinutes;
    if (ts >= monthStart) {
      monthMin += s.focusedMinutes;
      const key = s.projectId ?? "__untagged";
      const name = s.projectName ?? "Untagged";
      const color = s.projectColor ?? "#6b7280";
      const cur = projectMap.get(key);
      if (cur) cur.minutes += s.focusedMinutes;
      else projectMap.set(key, { name, color, minutes: s.focusedMinutes });
    }
  }

  const total = Array.from(projectMap.values()).reduce(
    (a, b) => a + b.minutes,
    0
  );
  const breakdown =
    total > 0
      ? Array.from(projectMap.values())
          .map((p) => ({ name: p.name, color: p.color, pct: p.minutes / total }))
          .sort((a, b) => b.pct - a.pct)
      : [];

  // Streak this week: most consecutive sessions (ordered by start time) where
  // the gap between completion of one and start of the next is <= 15 min.
  const weekSessions = sessions
    .filter((s) => new Date(s.completedAt).getTime() >= weekStart)
    .sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );
  let streak = 0;
  let best = 0;
  let prevEnd = -Infinity;
  for (const s of weekSessions) {
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
      ? Math.round(
          sessions.reduce((a, s) => a + s.focusedMinutes, 0) / sessions.length
        )
      : 0;

  // Recent days (last 7 with activity)
  const dayMap = new Map<string, DayBucket>();
  for (const s of sessions) {
    const d = new Date(s.completedAt);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let b = dayMap.get(k);
    if (!b) {
      b = {
        key: k,
        label: d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        total: 0,
        sessions: [],
      };
      dayMap.set(k, b);
    }
    b.total += s.focusedMinutes;
    b.sessions.push(s);
  }
  const byDay = Array.from(dayMap.values())
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .slice(0, 7)
    .map((d) => ({
      ...d,
      sessions: d.sessions.sort((a, b) =>
        a.startedAt < b.startedAt ? 1 : -1
      ),
    }));

  return { todayMin, weekMin, monthMin, breakdown, streak: best, avgMin, byDay };
}
