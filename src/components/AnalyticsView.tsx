import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { getSessions, hydrateFromRemote, dayKey, removeSession, sessionGoalTexts, type Session } from "@/lib/sessions";
import { getProjects, type ProjectTag } from "@/lib/projects";
import { getProjectGoals, findGoalByText, isGoalAchieved } from "@/lib/goals";
import { supabase, deleteSessionRemote } from "@/lib/supabase";
import {
  effectiveDayKey,
  effectiveToday,
  orderedDowLabels,
  weekColumnIndex,
} from "@/lib/settings";
import { type View as ActivityView } from "@/components/ActivityGraph";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SessionDetailModal } from "./SessionDetailModal";
import { FocusScoreBadge } from "./FocusScoreBadge";
import { SessionGoalToggler } from "./SessionGoalToggler";
import { SessionTimeBreakdown } from "./SessionTimeBreakdown";

/* =================== Helpers =================== */

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtHM(mins: number) {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtClock(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** End-of-block clock derived from start + focused minutes (NOT completedAt),
 * so a session left on the "Complete" screen overnight still shows the real
 * focus window instead of the moment the user pressed Done. */
function fmtClockFromStart(startedAtIso: string, focusedMinutes: number) {
  const end = new Date(new Date(startedAtIso).getTime() + focusedMinutes * 60_000);
  return `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
}

function formatLongDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function intensity(min: number): 0 | 1 | 2 | 3 | 4 {
  if (min <= 0) return 0;
  if (min < 60) return 1;
  if (min < 120) return 2;
  if (min < 180) return 3;
  return 4;
}

const CELL_BG: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "rgba(255,255,255,0.05)",
  1: "rgba(245,158,11,0.28)",
  2: "rgba(245,158,11,0.50)",
  3: "rgba(245,158,11,0.75)",
  4: "rgba(251,191,36,1)",
};

const CELL_GLOW: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "none",
  1: "0 0 6px rgba(245,158,11,0.18)",
  2: "0 0 8px rgba(245,158,11,0.35)",
  3: "0 0 10px rgba(245,158,11,0.55)",
  4: "0 0 14px rgba(251,191,36,0.75)",
};

interface DayTotal {
  min: number;
  count: number;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fromIsoDate(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

/* =================== Sessions hook =================== */

function useSessions(): Session[] {
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    const sync = () => setSessions(getSessions());
    sync();
    hydrateFromRemote().then((ok) => { if (ok) sync(); }).catch(() => {});
    window.addEventListener("hourglass:sessions", sync);
    window.addEventListener("storage", sync);
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        hydrateFromRemote().then((ok) => { if (ok) sync(); }).catch(() => {});
      }
    });
    return () => {
      window.removeEventListener("hourglass:sessions", sync);
      window.removeEventListener("storage", sync);
      authSub.subscription.unsubscribe();
    };
  }, []);
  return sessions;
}

/* =================== Date range =================== */

type RangeMode = "today" | "week" | "month" | "year" | "all" | "custom";


interface Range {
  start: Date;
  end: Date;
}

/** Start-of-week (00:00) for the week containing `d`, honoring weekStartsOn. */
function startOfWeek(d: Date): Date {
  const offset = weekColumnIndex(d); // 0 = configured first day
  const s = startOfDay(d);
  return addDays(s, -offset);
}

function computeRange(
  mode: RangeMode,
  sessions: Session[],
  custom: Range,
  weekOffset: number,
): Range {
  const today = effectiveToday();
  if (mode === "today") {
    return { start: startOfDay(today), end: endOfDay(today) };
  }
  if (mode === "week") {

    const thisWeekStart = startOfWeek(today);
    const start = addDays(thisWeekStart, weekOffset * 7);
    const end = endOfDay(addDays(start, 6));
    return { start, end };
  }
  if (mode === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = endOfDay(today);
    return { start, end };
  }
  if (mode === "year") {
    const start = new Date(today.getFullYear(), 0, 1);
    const end = endOfDay(today);
    return { start, end };
  }
  if (mode === "all") {
    let earliest = today;
    for (const s of sessions) {
      const d = new Date(s.completedAt);
      if (d < earliest) earliest = d;
    }
    return { start: startOfDay(earliest), end: endOfDay(today) };
  }
  return {
    start: startOfDay(custom.start),
    end: endOfDay(custom.end),
  };
}

/* =================== Range Activity Grid (fluid) =================== */

interface RangeGridProps {
  sessions: Session[];
  range: Range;
  selectedDayKey: string | null;
  onSelect: (key: string, date: Date) => void;
}

function RangeGrid({ sessions, range, selectedDayKey, onSelect }: RangeGridProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [hover, setHover] = useState<{
    x: number; y: number; date: Date; min: number; count: number;
  } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onSettings = () => setTick((t) => t + 1);
    window.addEventListener("hourglass:settings", onSettings);
    return () => window.removeEventListener("hourglass:settings", onSettings);
  }, []);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totals = useMemo(() => {
    const m = new Map<string, DayTotal>();
    for (const s of sessions) {
      const k = effectiveDayKey(s.completedAt);
      const cur = m.get(k) ?? { min: 0, count: 0 };
      cur.min += s.focusedMinutes || 0;
      cur.count += 1;
      m.set(k, cur);
    }
    return m;
  }, [sessions, tick]);

  const { weeks, monthLabels, totalWeeks, todayMs } = useMemo(() => {
    const today = effectiveToday();
    // Align grid to week columns. Find the start-of-week containing range.start.
    const firstDow = weekColumnIndex(range.start);
    const gridStart = addDays(range.start, -firstDow);
    // total days from gridStart to range.end
    const diffDays = Math.ceil((range.end.getTime() - gridStart.getTime()) / 86400000) + 1;
    const totalWeeks = Math.max(1, Math.ceil(diffDays / 7));

    const weeks: Array<Array<{ date: Date; future: boolean; outOfRange: boolean }>> = [];
    for (let w = 0; w < totalWeeks; w++) {
      const col: Array<{ date: Date; future: boolean; outOfRange: boolean }> = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(gridStart, w * 7 + d);
        const future = date.getTime() > today.getTime();
        const outOfRange = date < range.start || date > range.end;
        col.push({ date, future, outOfRange });
      }
      weeks.push(col);
    }

    const monthLabels: Array<{ col: number; label: string }> = [];
    let lastMonth = -1;
    for (let w = 0; w < totalWeeks; w++) {
      const m = weeks[w][0].date.getMonth();
      if (m !== lastMonth) {
        const prev = monthLabels[monthLabels.length - 1];
        if (!prev || w - prev.col >= 2) {
          monthLabels.push({ col: w, label: MONTH_SHORT[m] });
        }
        lastMonth = m;
      }
    }
    return { weeks, monthLabels, totalWeeks, todayMs: today.getTime() };
  }, [range.start, range.end, tick]);

  const leftLabelW = 28;
  const topLabelH = 18;
  const usable = Math.max(width - leftLabelW - 4, 200);

  // Fluid cell sizing: bigger cells when fewer weeks; cap to keep it tasteful.
  let cell = Math.floor(usable / Math.max(totalWeeks, 1));
  for (let c = cell + 4; c >= 6; c--) {
    const g = Math.max(1, Math.round(c / 8));
    const w = totalWeeks * c + (totalWeeks - 1) * g;
    if (w <= usable) { cell = c; break; }
  }
  cell = Math.min(cell, 48);
  const gap = Math.max(1, Math.round(cell / 8));
  const gridWidth = totalWeeks * cell + (totalWeeks - 1) * gap;
  const gridHeight = 7 * cell + 6 * gap;
  const dow = orderedDowLabels(true);

  return (
    <div ref={wrapRef} className="w-full select-none overflow-hidden">
      <div className="relative" style={{ width: "100%", height: gridHeight + topLabelH + 6 }}>
        <div className="absolute" style={{ left: leftLabelW, top: 0, width: gridWidth, height: topLabelH }}>
          {monthLabels.map((m) => (
            <span
              key={`${m.col}-${m.label}`}
              className="absolute top-0 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70"
              style={{ left: m.col * (cell + gap) }}
            >
              {m.label}
            </span>
          ))}
        </div>

        <div className="absolute flex flex-col" style={{ left: 0, top: topLabelH, width: leftLabelW, height: gridHeight }}>
          {dow.map((d, i) => (
            <div
              key={i}
              className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/55"
              style={{ height: cell, marginBottom: i < 6 ? gap : 0, lineHeight: `${cell}px` }}
            >
              {i % 2 === 1 ? d : ""}
            </div>
          ))}
        </div>

        <div className="absolute flex" style={{ left: leftLabelW, top: topLabelH, gap }}>
          {weeks.map((col, wi) => (
            <div key={wi} className="flex flex-col" style={{ gap }}>
              {col.map((c, di) => {
                if (c.future || c.outOfRange) {
                  return <div key={di} style={{ width: cell, height: cell, opacity: c.outOfRange && !c.future ? 0.15 : 0 }} />;
                }
                const k = dayKey(c.date);
                const t = totals.get(k);
                const min = t?.min ?? 0;
                const count = t?.count ?? 0;
                const lvl = intensity(min);
                const isToday = c.date.getTime() === todayMs;
                const isSelected = selectedDayKey === k;
                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => onSelect(k, c.date)}
                    onMouseEnter={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setHover({ x: r.left + r.width / 2, y: r.top, date: c.date, min, count });
                    }}
                    onMouseLeave={() => setHover(null)}
                    className="rounded-[3px] transition-all hover:scale-[1.35]"
                    style={{
                      width: cell,
                      height: cell,
                      background: CELL_BG[lvl],
                      boxShadow: isSelected
                        ? "0 0 0 1.5px rgba(251,191,36,0.95)"
                        : isToday
                          ? "0 0 0 1px rgba(251,191,36,0.7)"
                          : CELL_GLOW[lvl],
                    }}
                    aria-label={`${c.date.toDateString()}: ${min} min`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-1.5 text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">
        <span>Less</span>
        {([0, 1, 2, 3, 4] as const).map((l) => (
          <span
            key={l}
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: CELL_BG[l], boxShadow: CELL_GLOW[l] }}
          />
        ))}
        <span>More</span>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-[90] -translate-x-1/2 -translate-y-full px-3 py-1.5 rounded-md border border-amber-500/40 bg-card/95 backdrop-blur text-[11px] text-foreground shadow-lg whitespace-nowrap"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          {hover.count === 0
            ? `${formatLongDate(hover.date)} — 0 minutes across 0 sessions`
            : `${formatLongDate(hover.date)} — ${hover.min} minutes across ${hover.count} session${hover.count === 1 ? "" : "s"}`}
        </div>
      )}
    </div>
  );
}

/* =================== Charts =================== */

function Sparkline({
  data,
  variant = "line",
  height = 64,
}: { data: number[]; variant?: "line" | "area" | "wave" | "bar"; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const m = () => setW(el.clientWidth);
    m();
    const ro = new ResizeObserver(m); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = Math.max(1, ...data);
  const n = Math.max(1, data.length);
  const stepX = w / Math.max(1, n - 1);
  const py = 6;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = py + (height - py * 2) * (1 - v / max);
    return [x, y] as const;
  });

  let path = "";
  if (variant === "wave") {
    // Smooth catmull-rom-ish to cubic
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i];
      if (i === 0) { path += `M ${x} ${y} `; continue; }
      const [px, py2] = points[i - 1];
      const cx = (px + x) / 2;
      path += `C ${cx} ${py2} ${cx} ${y} ${x} ${y} `;
    }
  } else {
    path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  }

  const areaPath = `${path} L ${w} ${height} L 0 ${height} Z`;

  return (
    <div ref={wrapRef} className="w-full">
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`}>
        <defs>
          <linearGradient id="amberFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(251,191,36,0.45)" />
            <stop offset="100%" stopColor="rgba(245,158,11,0)" />
          </linearGradient>
        </defs>
        {variant === "bar" ? (
          data.map((v, i) => {
            const bw = Math.max(2, (w / n) * 0.7);
            const x = i * (w / n) + (w / n - bw) / 2;
            const h = (height - py * 2) * (v / max);
            const y = height - py - h;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={bw}
                height={h}
                rx={1.5}
                fill="rgba(251,191,36,0.85)"
                style={{ filter: v > 0 ? "drop-shadow(0 0 4px rgba(251,191,36,0.45))" : "none" }}
              />
            );
          })
        ) : (
          <>
            <path d={areaPath} fill="url(#amberFill)" />
            <path d={path} fill="none" stroke="rgba(251,191,36,0.95)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.4))" }} />
          </>
        )}
      </svg>
    </div>
  );
}

/* =================== Timer block card =================== */

function TimerBlockCard({ s, onClick, onDelete }: { s: Session; onClick?: (s: Session) => void; onDelete?: (s: Session) => void }) {
  return (
    <article
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick ? () => onClick(s) : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(s); } } : undefined}
      className={`group relative w-full rounded-lg px-5 py-4 md:px-6 md:py-5 flex items-center justify-between gap-6 transition-all duration-300 ${onClick ? "cursor-pointer" : ""}`}
      style={{
        background: "rgba(26,26,26,0.95)",
        border: "1px solid rgba(245,158,11,0.20)",
        boxShadow: "0 0 0 rgba(245,158,11,0)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          "0 0 24px rgba(245,158,11,0.18), inset 0 0 0 1px rgba(245,158,11,0.45)";
        e.currentTarget.style.borderColor = "rgba(245,158,11,0.55)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 0 0 rgba(245,158,11,0)";
        e.currentTarget.style.borderColor = "rgba(245,158,11,0.20)";
      }}
    >
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-base md:text-lg tracking-tight text-foreground truncate">
          {s.task || "Untitled session"}
        </h3>
        {s.projectName && (
          <div className="mt-2 inline-flex items-center gap-1.5 pl-1.5 pr-2.5 h-5 rounded-full text-[10px] uppercase tracking-[0.18em]"
            style={{
              background: `${s.projectColor ?? "#666"}22`,
              border: `1px solid ${s.projectColor ?? "#666"}55`,
              color: s.projectColor ?? "var(--muted-foreground)",
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.projectColor ?? "#888" }} />
            {s.projectName}
          </div>
        )}
        <div className="mt-2">
          <SessionGoalToggler session={s} />
        </div>

        <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/55 tabular-nums">
          <span>{effectiveDayKey(s.completedAt)}</span>
          <FocusScoreBadge score={s.focusScore} size="xs" />
        </div>
      </div>


      <div className="shrink-0 text-right flex items-start gap-3">
        <div>
          <div
            className="text-2xl md:text-3xl text-amber-200 tabular-nums tracking-tight"
            style={{ fontFamily: "'JetBrains Mono','SF Mono',ui-monospace,monospace" }}
          >
            {fmtDuration(s.focusedMinutes)}
          </div>
          <div
            className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70 tabular-nums"
            style={{ fontFamily: "'JetBrains Mono','SF Mono',ui-monospace,monospace" }}
          >
            {fmtClock(s.startedAt)} — {fmtClockFromStart(s.startedAt, s.focusedMinutes)}
          </div>
          <SessionTimeBreakdown session={s} className="mt-1" />
        </div>
        {onDelete && (
          <button
            type="button"
            aria-label="Delete session"
            title="Delete session"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(s);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-60 focus:opacity-90 hover:opacity-100 transition-opacity text-muted-foreground/70 hover:text-destructive p-1 -mr-1 rounded"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </article>
  );
}

/* =================== Stat card =================== */

function StatCard({
  label,
  value,
  sub,
  children,
}: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-5 md:p-6 flex flex-col gap-3 min-w-0"
      style={{
        background: "rgba(26,26,26,0.85)",
        border: "1px solid rgba(245,158,11,0.18)",
      }}
    >
      <div className="text-[10px] uppercase tracking-[0.28em] text-amber-400/60">{label}</div>
      <div className="flex items-baseline gap-2">
        <div
          className="font-display tracking-tight tabular-nums text-amber-100"
          style={{ fontSize: "clamp(1.75rem,3.4vw,2.6rem)", lineHeight: 1, textShadow: "0 0 24px rgba(245,158,11,0.2)" }}
        >
          {value}
        </div>
        {sub && <div className="text-[11px] text-muted-foreground/70 tabular-nums">{sub}</div>}
      </div>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

/* =================== Main view =================== */

export function AnalyticsView({
  activityView: _activityView,
  onActivityViewChange: _onActivityViewChange,
}: {
  activityView: ActivityView;
  onActivityViewChange: (v: ActivityView) => void;
}) {
  const sessions = useSessions();
  const handleDelete = (s: Session) => {
    // Optimistic local remove — updates goal bars, daily totals, and charts instantly
    // through the "hourglass:sessions" event dispatched by `removeSession`.
    removeSession(s.id);
    void deleteSessionRemote({ id: s.id, startedAt: s.startedAt, taskName: s.task }).then((res) => {
      if (!res.ok) {
        console.warn("[analytics] deleteSessionRemote did not confirm; local removal stands.");
      }
    });
  };
  const [mode, setMode] = useState<RangeMode>("month");
  const [weekOffset, setWeekOffset] = useState(0);
  const today = useMemo(() => effectiveToday(), []);
  const [customStart, setCustomStart] = useState<string>(isoDate(addDays(today, -29)));
  const [customEnd, setCustomEnd] = useState<string>(isoDate(today));

  const customRange = useMemo<Range>(
    () => ({ start: fromIsoDate(customStart), end: fromIsoDate(customEnd) }),
    [customStart, customEnd],
  );
  const range = useMemo(
    () => computeRange(mode, sessions, customRange, weekOffset),
    [mode, sessions, customRange, weekOffset],
  );

  // Sessions in range (before tag filter — used to compute available tags)
  const rawInRange = useMemo(() => {
    const a = range.start.getTime();
    const b = range.end.getTime();
    return sessions.filter((s) => {
      const t = new Date(s.completedAt).getTime();
      return t >= a && t <= b;
    });
  }, [sessions, range.start, range.end]);

  // -------- Project + goal filters --------
  // Every project the user has, plus every project name that appears in a
  // session (so historical rows for deleted projects still filter cleanly).
  const [projects, setProjects] = useState<ProjectTag[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [selectedGoals, setSelectedGoals] = useState<Set<string>>(new Set());
  const [dataTick, setDataTick] = useState(0);
  useEffect(() => {
    const syncP = () => setProjects(getProjects());
    const bump = () => setDataTick((t) => t + 1);
    syncP();
    window.addEventListener("hourglass:projects", syncP);
    window.addEventListener("hourglass:goals", bump);
    window.addEventListener("hourglass:sessions", bump);
    return () => {
      window.removeEventListener("hourglass:projects", syncP);
      window.removeEventListener("hourglass:goals", bump);
      window.removeEventListener("hourglass:sessions", bump);
    };
  }, []);

  const availableProjects = useMemo(() => {
    // Only active (non-deleted) projects. Deleted projects must not appear
    // in the filter bar, even if historical sessions still reference them.
    const list = projects
      .map((p) => ({ id: p.id, name: p.name, color: p.color }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const activeIds = new Set(projects.map((p) => p.id));
    let hasNoProject = false;
    for (const s of sessions) {
      if (!s.projectId || !s.projectName || !activeIds.has(s.projectId)) {
        hasNoProject = true;
        break;
      }
    }
    return { list, hasNoProject };
  }, [projects, sessions]);

  // Goals derived from BOTH project.goal store and historical session.goalText.
  // Restricted to the currently selected project(s) — goals are only meaningful
  // in the context of a chosen project.
  const availableGoals = useMemo(() => {
    const map = new Map<string, { key: string; projectId: string; projectName: string; projectColor: string; text: string; color: string; targetMinutes: number }>();
    const activeProjects = projects.filter(
      (p) => selectedProjects.size === 0 || selectedProjects.has(p.id),
    );
    for (const p of activeProjects) {
      for (const g of getProjectGoals(p.id, p.name)) {
        const key = `${p.id}::${g.text.toLowerCase()}`;
        map.set(key, {
          key,
          projectId: p.id,
          projectName: p.name,
          projectColor: p.color,
          text: g.text,
          color: g.color,
          targetMinutes: g.targetMinutes,
        });
      }
    }
    // Fold in goals seen on sessions but not defined in the goal store —
    // only for the selected projects.
    for (const s of sessions) {
      if (!s.projectId) continue;
      if (selectedProjects.size > 0 && !selectedProjects.has(s.projectId)) continue;
      for (const gt of sessionGoalTexts(s)) {
        const key = `${s.projectId}::${gt.toLowerCase()}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            projectId: s.projectId,
            projectName: s.projectName ?? "Project",
            projectColor: s.projectColor ?? "#94a3b8",
            text: gt,
            color: s.projectColor ?? "#94a3b8",
            targetMinutes: 0,
          });
        }
      }
    }
    let hasNoGoal = false;
    for (const s of rawInRange) {
      if (selectedProjects.size > 0 && (!s.projectId || !selectedProjects.has(s.projectId))) continue;
      if (sessionGoalTexts(s).length === 0) { hasNoGoal = true; break; }
    }
    const list = [...map.values()].sort((a, b) =>
      a.projectName.localeCompare(b.projectName) || a.text.localeCompare(b.text),
    );
    return { list, hasNoGoal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, sessions, rawInRange, dataTick, selectedProjects]);


  const sessionMatchesProject = (s: Session, sel: Set<string>) => {
    if (sel.size === 0) return true;
    if (!s.projectId) return sel.has("__none");
    return sel.has(s.projectId);
  };
  const sessionMatchesGoal = (s: Session, sel: Set<string>) => {
    if (sel.size === 0) return true;
    const texts = sessionGoalTexts(s);
    if (texts.length === 0 || !s.projectId) return sel.has("__none");
    return texts.some((t) => sel.has(`${s.projectId}::${t.toLowerCase()}`));
  };


  const inRange = useMemo(() => {
    return rawInRange
      .filter((s) => sessionMatchesProject(s, selectedProjects))
      .filter((s) => sessionMatchesGoal(s, selectedGoals))
      .sort((x, y) => (x.completedAt < y.completedAt ? 1 : -1));
  }, [rawInRange, selectedProjects, selectedGoals]);

  // Goal → minutes breakdown for the current range (ignores the goal filter
  // so users always see the full distribution).
  const goalBreakdown = useMemo(() => {
    const totals = new Map<string, { key: string; text: string; projectId: string; projectName: string; projectColor: string; color: string; min: number; targetMinutes: number }>();
    let untracked = 0;
    for (const s of rawInRange) {
      if (!sessionMatchesProject(s, selectedProjects)) continue;
      const mins = s.focusedMinutes || 0;
      const texts = sessionGoalTexts(s);
      if (texts.length === 0 || !s.projectId) { untracked += mins; continue; }
      // Multi-goal: each selected goal receives the FULL session minutes
      // so progress toward each independent goal reflects reality.
      for (const gt of texts) {
        const key = `${s.projectId}::${gt.toLowerCase()}`;
        const goal = findGoalByText(s.projectId, gt);
        const cur = totals.get(key) ?? {
          key,
          text: gt,
          projectId: s.projectId,
          projectName: s.projectName ?? "Project",
          projectColor: s.projectColor ?? "#94a3b8",
          color: goal?.color ?? s.projectColor ?? "#94a3b8",
          min: 0,
          targetMinutes: goal?.targetMinutes ?? 0,
        };
        cur.min += mins;
        totals.set(key, cur);
      }
    }

    const rows = [...totals.values()]
      .map((v) => ({ ...v, min: Math.round(v.min) }))
      .sort((a, b) => b.min - a.min);
    if (untracked > 0) {
      rows.push({
        key: "__none",
        text: "No goal",
        projectId: "",
        projectName: "",
        projectColor: "#94a3b8",
        color: "#94a3b8",
        min: Math.round(untracked),
        targetMinutes: 0,
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawInRange, selectedProjects, dataTick]);



  // Per-day series across range (inclusive)
  const daily = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of inRange) {
      const k = effectiveDayKey(s.completedAt);
      totals.set(k, (totals.get(k) ?? 0) + (s.focusedMinutes || 0));
    }
    const days: { date: Date; key: string; min: number }[] = [];
    const start = startOfDay(range.start);
    const end = startOfDay(range.end);
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const k = dayKey(d);
      days.push({ date: new Date(d), key: k, min: totals.get(k) ?? 0 });
    }
    return days;
  }, [inRange, range.start, range.end]);

  const totalMinutes = useMemo(() => daily.reduce((a, d) => a + d.min, 0), [daily]);
  const totalDays = Math.max(1, daily.length);
  const avgDaily = Math.round(totalMinutes / totalDays);




  // 7-day moving average
  const wave = useMemo(() => {
    const arr: number[] = [];
    const N = 7;
    for (let i = 0; i < daily.length; i++) {
      let sum = 0, c = 0;
      for (let j = Math.max(0, i - N + 1); j <= i; j++) { sum += daily[j].min; c++; }
      arr.push(c ? sum / c : 0);
    }
    return arr;
  }, [daily]);

  // Hourly focus distribution (minutes per hour-of-day, across range)
  const hourly = useMemo(() => {
    const buckets = new Array(24).fill(0) as number[];
    for (const s of inRange) {
      const h = new Date(s.startedAt).getHours();
      buckets[h] += s.focusedMinutes || 0;
    }
    return buckets;
  }, [inRange]);

  // Day detail modal
  const [openDay, setOpenDay] = useState<{ key: string; date: Date } | null>(null);
  const [openSession, setOpenSession] = useState<Session | null>(null);
  const [visibleBlocks, setVisibleBlocks] = useState(3);
  useEffect(() => { setVisibleBlocks(3); }, [mode, weekOffset, customStart, customEnd, selectedProjects, selectedGoals]);
  const openDayBlocks = useMemo(() => {
    if (!openDay) return [];
    return sessions
      .filter((s) => effectiveDayKey(s.completedAt) === openDay.key)
      .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  }, [openDay, sessions]);

  const dayMinutes = openDayBlocks.reduce((a, s) => a + (s.focusedMinutes || 0), 0);

  const weekLabel = useMemo(() => {
    if (mode !== "week") return "";
    const s = range.start;
    const e = range.end;
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    const fmt = (d: Date, withMonth: boolean) =>
      withMonth
        ? `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
        : `${d.getDate()}`;
    if (weekOffset === 0) return "this week";
    if (weekOffset === -1) return "last week";
    if (weekOffset === 1) return "next week";
    return sameMonth
      ? `${fmt(s, true)}–${fmt(e, false)}, ${s.getFullYear()}`
      : `${fmt(s, true)} – ${fmt(e, true)}, ${e.getFullYear()}`;
  }, [mode, range.start, range.end, weekOffset]);

  const rangeLabel =
    mode === "today" ? "today" :
    mode === "week" ? weekLabel :
    mode === "month" ? "this month" :
    mode === "year" ? "this year" :
    mode === "all" ? "all-time" :
    `${customStart} → ${customEnd}`;

  const filtersActive = selectedProjects.size > 0 || selectedGoals.size > 0;
  const toggleProject = (key: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleGoal = (key: string) => {
    setSelectedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const clearFilters = () => {
    setSelectedProjects(new Set());
    setSelectedGoals(new Set());
  };


  return (
    <div className="w-full min-h-full px-6 md:px-12 lg:px-16 py-10 md:py-14 space-y-12">
      {/* Header */}
      <header>
        <div className="text-[10px] uppercase tracking-[0.32em] text-amber-400/60">Insights</div>
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight mt-2 text-foreground">
          Insights Analytics
        </h1>
        <p className="mt-3 text-sm text-muted-foreground/70">
          Currently viewing <span className="text-amber-200/90 tabular-nums">{rangeLabel}</span>
        </p>
      </header>

      {/* Range selector */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center rounded-full p-1 gap-1"
            style={{ background: "rgba(26,26,26,0.9)", border: "1px solid rgba(245,158,11,0.18)" }}>
            {(["today", "week", "month", "year", "all", "custom"] as RangeMode[]).map((m) => {
              const active = mode === m;
              const label =
                m === "today" ? "Today" :
                m === "week" ? "Week" :
                m === "month" ? "Month" :
                m === "year" ? "Year" :
                m === "all" ? "All-Time" : "Custom";

              return (
                <button
                  key={m}
                  onClick={() => { setMode(m); if (m === "week") setWeekOffset(0); }}
                  className="px-4 py-1.5 rounded-full text-[11px] uppercase tracking-[0.22em] transition-all"
                  style={{
                    background: active ? "rgba(245,158,11,0.18)" : "transparent",
                    color: active ? "rgb(251,191,36)" : "rgba(255,255,255,0.55)",
                    boxShadow: active ? "0 0 12px rgba(245,158,11,0.25)" : "none",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {mode === "week" && (
            <div className="inline-flex items-center gap-1 rounded-full p-1"
              style={{ background: "rgba(26,26,26,0.9)", border: "1px solid rgba(245,158,11,0.18)" }}>
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w - 1)}
                className="h-7 w-7 rounded-full text-amber-200/80 hover:text-amber-100 hover:bg-amber-500/10 transition-all flex items-center justify-center text-base leading-none"
                aria-label="Previous week"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="px-3 h-7 rounded-full text-[10px] uppercase tracking-[0.22em] text-amber-200/80 hover:text-amber-100 hover:bg-amber-500/10 transition-all tabular-nums whitespace-nowrap"
              >
                {weekLabel}
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w + 1)}
                disabled={weekOffset >= 0}
                className="h-7 w-7 rounded-full text-amber-200/80 hover:text-amber-100 hover:bg-amber-500/10 transition-all flex items-center justify-center text-base leading-none disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Next week"
              >
                ›
              </button>
            </div>
          )}
        </div>
        {mode === "custom" && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <DateInput value={customStart} onChange={setCustomStart} label="Start" />
            <span className="text-muted-foreground/40">→</span>
            <DateInput value={customEnd} onChange={setCustomEnd} label="End" />
          </div>
        )}
      </section>

      {/* Project + Goal filters */}
      {(availableProjects.list.length > 0 || availableProjects.hasNoProject) && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground/80">
              Filter by project
            </h2>
            {filtersActive && (
              <button
                onClick={clearFilters}
                className="text-[10px] uppercase tracking-[0.22em] text-amber-300/80 hover:text-amber-200 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableProjects.list.map((p) => {
              const active = selectedProjects.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProject(p.id)}
                  className="inline-flex items-center gap-1.5 pl-2 pr-3 h-7 rounded-full text-[11px] tracking-wide transition-all"
                  style={{
                    background: active ? `${p.color}33` : `${p.color}0f`,
                    color: active ? p.color : `${p.color}bb`,
                    border: `1px solid ${active ? p.color : `${p.color}44`}`,
                    boxShadow: active ? `0 0 10px ${p.color}44` : "none",
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                  {p.name}
                </button>
              );
            })}
            {availableProjects.hasNoProject && (
              <button
                type="button"
                onClick={() => toggleProject("__none")}
                className="px-3 h-7 rounded-full text-[11px] tracking-wide transition-all"
                style={{
                  background: selectedProjects.has("__none") ? "rgba(148,163,184,0.22)" : "rgba(148,163,184,0.06)",
                  color: selectedProjects.has("__none") ? "rgb(226,232,240)" : "rgba(203,213,225,0.75)",
                  border: `1px solid ${selectedProjects.has("__none") ? "rgba(148,163,184,0.6)" : "rgba(148,163,184,0.22)"}`,
                }}
              >
                No project
              </button>
            )}
          </div>
        </section>
      )}

      {selectedProjects.size > 0 && (availableGoals.list.length > 0 || availableGoals.hasNoGoal) && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground/80">
              Filter by goal
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableGoals.list.map((g) => {
              const active = selectedGoals.has(g.key);
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => toggleGoal(g.key)}
                  className="inline-flex items-center gap-1.5 pl-2 pr-3 h-7 rounded-full text-[11px] tracking-wide transition-all"
                  style={{
                    background: active ? `${g.color}33` : `${g.color}0f`,
                    color: active ? g.color : `${g.color}bb`,
                    border: `1px solid ${active ? g.color : `${g.color}44`}`,
                    boxShadow: active ? `0 0 10px ${g.color}44` : "none",
                  }}
                  title={`${g.projectName} · ${g.text}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />
                  <span className="opacity-70">{g.projectName}</span>
                  <span className="opacity-40">·</span>
                  <span>{g.text}</span>
                </button>
              );
            })}
            {availableGoals.hasNoGoal && (
              <button
                type="button"
                onClick={() => toggleGoal("__none")}
                className="px-3 h-7 rounded-full text-[11px] tracking-wide transition-all"
                style={{
                  background: selectedGoals.has("__none") ? "rgba(148,163,184,0.22)" : "rgba(148,163,184,0.06)",
                  color: selectedGoals.has("__none") ? "rgb(226,232,240)" : "rgba(203,213,225,0.75)",
                  border: `1px solid ${selectedGoals.has("__none") ? "rgba(148,163,184,0.6)" : "rgba(148,163,184,0.22)"}`,
                }}
              >
                No goal
              </button>
            )}
          </div>
        </section>
      )}




      {/* Activity grid */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground/80">
            Activity · {rangeLabel}
          </h2>
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">
            Click a day to deep dive
          </span>
        </div>
        <RangeGrid
          sessions={inRange}
          range={range}
          selectedDayKey={openDay?.key ?? null}
          onSelect={(k, d) => setOpenDay({ key: k, date: d })}
        />
      </section>

      {/* Metrics & graphs */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Focused Hours" value={fmtHM(totalMinutes)} sub={`across ${totalDays} day${totalDays === 1 ? "" : "s"}`}>
          <Sparkline data={daily.map((d) => d.min)} variant="line" />
        </StatCard>
        <StatCard label="Average Daily Focus" value={fmtHM(avgDaily)} sub="7-day rolling">
          <Sparkline data={wave} variant="wave" />
        </StatCard>
        <StatCard label="Sessions" value={`${inRange.length}`} sub={filtersActive ? "matching filters" : "in range"}>
          <Sparkline data={daily.map((d) => d.min > 0 ? 1 : 0)} variant="bar" />
        </StatCard>

        <div className="md:col-span-2 lg:col-span-3">
          <StatCard
            label="Hourly Focus Distribution"
            value={`${hourly.reduce((a, x) => a + x, 0) > 0 ? `${hourly.indexOf(Math.max(...hourly))}:00` : "—"}`}
            sub="peak hour"
          >
            <Sparkline data={hourly} variant="bar" height={96} />
            <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.22em] text-muted-foreground/50 tabular-nums">
              <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
            </div>
          </StatCard>
        </div>
      </section>

      {/* Goal breakdown */}
      {goalBreakdown.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground/80">
              Time by goal · {rangeLabel}
            </h2>
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50 tabular-nums">
              {goalBreakdown.length} goal{goalBreakdown.length === 1 ? "" : "s"}
            </span>
          </div>
          <GoalBreakdown rows={goalBreakdown} />
        </section>
      )}

      {/* Timer blocks for the whole range */}

      <section>
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground/80">
            Blocks · {rangeLabel}
          </h2>
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50 tabular-nums">
            {inRange.length} block{inRange.length === 1 ? "" : "s"}
          </span>
        </div>
        {inRange.length === 0 ? (
          <div className="rounded-lg px-6 py-12 text-center"
            style={{ background: "rgba(26,26,26,0.6)", border: "1px dashed rgba(245,158,11,0.18)" }}>
            <p className="text-sm text-muted-foreground/80 italic">
              No focus blocks recorded yet. Time to start the hourglass.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {inRange.slice(0, visibleBlocks).map((s) => <TimerBlockCard key={s.id} s={s} onClick={setOpenSession} onDelete={handleDelete} />)}
            {visibleBlocks < inRange.length ? (
              <div className="pt-2 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVisibleBlocks((n) => n + 5)}
                  className="px-5 py-2 rounded-md text-[10px] uppercase tracking-[0.28em] text-amber-100/90 transition-all hover:text-amber-100"
                  style={{ background: "rgba(26,26,26,0.9)", border: "1px solid rgba(245,158,11,0.35)" }}
                >
                  Load more
                </button>
                <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/50 tabular-nums">
                  Showing {visibleBlocks} of {inRange.length}
                </span>
              </div>
            ) : inRange.length > 3 ? (
              <p className="pt-2 text-center text-[9px] uppercase tracking-[0.22em] text-muted-foreground/45">
                All {inRange.length} block{inRange.length === 1 ? "" : "s"} loaded
              </p>
            ) : null}
          </div>
        )}
      </section>

      {/* Deep-dive day modal */}
      <Dialog open={!!openDay} onOpenChange={(o) => !o && setOpenDay(null)}>
        <DialogContent className="max-w-2xl border-amber-500/20 bg-[#0e0e0e]/95 backdrop-blur">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-tight text-amber-100">
              Daily Focus Blocks
            </DialogTitle>
            {openDay && (
              <div className="text-[10px] uppercase tracking-[0.28em] text-amber-400/60 mt-1">
                {formatLongDate(openDay.date)} · {fmtHM(dayMinutes)} · {openDayBlocks.length} block{openDayBlocks.length === 1 ? "" : "s"}
              </div>
            )}
          </DialogHeader>
          <div className="mt-2 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {openDayBlocks.length === 0 ? (
              <p className="text-sm text-muted-foreground/70 italic py-8 text-center">
                No focus blocks recorded yet. Time to start the hourglass.
              </p>
            ) : (
              openDayBlocks.map((s) => <TimerBlockCard key={s.id} s={s} onClick={setOpenSession} onDelete={handleDelete} />)
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SessionDetailModal
        session={openSession}
        open={!!openSession}
        onOpenChange={(o) => !o && setOpenSession(null)}
      />
    </div>
  );
}

function DateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-[0.24em] text-amber-400/60">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#1a1a1a] border border-amber-500/30 text-amber-100 text-sm rounded-md px-3 py-1.5 tabular-nums focus:outline-none focus:border-amber-400/70 focus:shadow-[0_0_12px_rgba(245,158,11,0.25)] [color-scheme:dark]"
      />
    </label>
  );
}

/* =================== Goal breakdown chart =================== */

interface GoalRow {
  key: string;
  text: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  color: string;
  min: number;
  targetMinutes: number;
}

function GoalBreakdown({ rows }: { rows: GoalRow[] }) {
  const total = rows.reduce((a, r) => a + r.min, 0);
  const max = Math.max(1, ...rows.map((r) => r.min));
  return (
    <div
      className="rounded-xl p-5 md:p-6"
      style={{
        background: "rgba(26,26,26,0.85)",
        border: "1px solid rgba(245,158,11,0.18)",
      }}
    >
      <ul className="space-y-4">
        {rows.map((r) => {
          const pct = total > 0 ? (r.min / total) * 100 : 0;
          const barW = (r.min / max) * 100;
          const isNone = r.key === "__none";
          const color = isNone ? "#94a3b8" : r.color;
          const achieved = !isNone && r.targetMinutes > 0 && r.min >= r.targetMinutes;
          const targetProgress = r.targetMinutes > 0 ? Math.min(1, r.min / r.targetMinutes) : 0;
          return (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                  {!isNone && (
                    <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 shrink-0">
                      {r.projectName}
                    </span>
                  )}
                  <span
                    className="truncate"
                    style={{ color: isNone ? "var(--muted-foreground)" : color }}
                  >
                    {r.text}
                  </span>
                  {achieved && (
                    <span
                      className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.22em] shrink-0 px-1.5 py-0.5 rounded-full"
                      style={{
                        color,
                        background: `${color}1f`,
                        border: `1px solid ${color}66`,
                      }}
                      title="Goal achieved"
                    >
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                      Achieved
                    </span>
                  )}
                </span>
                <span
                  className="tabular-nums text-xs text-muted-foreground shrink-0"
                  style={{ fontFamily: "'JetBrains Mono','SF Mono',ui-monospace,monospace" }}
                >
                  {fmtHM(r.min)}
                  {r.targetMinutes > 0 && (
                    <span className="opacity-60"> / {fmtHM(r.targetMinutes)}</span>
                  )}
                  <span className="opacity-60"> · {pct.toFixed(1)}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-border/40 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${barW}%`,
                    background: `linear-gradient(90deg, ${color}, ${color}88)`,
                    boxShadow: isNone ? "none" : `0 0 8px ${color}66`,
                  }}
                />
              </div>
              {r.targetMinutes > 0 && (
                <div className="mt-1 flex items-center justify-between text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50 tabular-nums">
                  <span>Target progress</span>
                  <span>{Math.round(targetProgress * 100)}%</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* =================== Goal mini chip (on session cards) =================== */

function GoalMiniChip({
  goalText,
  projectId,
  focusedMinutes,
}: { goalText: string; projectId?: string; focusedMinutes: number }) {
  const goal = projectId ? findGoalByText(projectId, goalText) : null;
  const color = goal?.color ?? "#94a3b8";
  const achieved = isGoalAchieved(goal, focusedMinutes);
  return (
    <span
      className="inline-flex items-center gap-1.5 pl-1.5 pr-2 h-5 rounded-full text-[10px] tracking-wide"
      style={{
        background: `${color}1a`,
        border: `1px solid ${color}55`,
        color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="truncate max-w-[12rem]">{goalText}</span>
      {achieved && <Check className="h-3 w-3" strokeWidth={2.5} />}
    </span>
  );
}


