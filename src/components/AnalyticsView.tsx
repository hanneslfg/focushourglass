import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getSessions, dayKey, type Session } from "@/lib/sessions";
import {
  effectiveDayKey,
  effectiveToday,
  getTodayGoal,
  getTodayFocusedMinutes,
  orderedDowLabels,
  weekColumnIndex,
} from "@/lib/settings";
import { type View as ActivityView } from "@/components/ActivityGraph";

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

function useSessions(): Session[] {
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
  return sessions;
}

/* =================== Year grid (53 weeks, full width) =================== */

interface YearGridProps {
  sessions: Session[];
  selectedDayKey: string | null;
  onSelect: (key: string, date: Date) => void;
}

function YearGrid({ sessions, selectedDayKey, onSelect }: YearGridProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    date: Date;
    min: number;
    count: number;
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
    const dayIdx = weekColumnIndex(today);
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - dayIdx);
    const firstWeekStart = new Date(currentWeekStart);
    firstWeekStart.setDate(currentWeekStart.getDate() - 52 * 7);
    const totalWeeks = 53;

    const weeks: Array<Array<{ date: Date; future: boolean }>> = [];
    for (let w = 0; w < totalWeeks; w++) {
      const col: Array<{ date: Date; future: boolean }> = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(firstWeekStart);
        date.setDate(firstWeekStart.getDate() + w * 7 + d);
        col.push({ date, future: date.getTime() > today.getTime() });
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
  }, [tick]);

  // Fit: 53 columns + 6 left-label width, gap = ~cell/8
  const leftLabelW = 28;
  const topLabelH = 18;
  const usable = Math.max(width - leftLabelW - 4, 200);
  // Solve: totalWeeks*cell + (totalWeeks-1)*gap = usable, with gap = max(1, round(cell/8))
  let cell = Math.floor(usable / totalWeeks);
  // refine taking gap into account
  for (let c = cell + 2; c >= 6; c--) {
    const g = Math.max(1, Math.round(c / 8));
    const w = totalWeeks * c + (totalWeeks - 1) * g;
    if (w <= usable) {
      cell = c;
      break;
    }
  }
  const gap = Math.max(1, Math.round(cell / 8));
  const gridWidth = totalWeeks * cell + (totalWeeks - 1) * gap;
  const gridHeight = 7 * cell + 6 * gap;
  const dow = orderedDowLabels(true);

  return (
    <div ref={wrapRef} className="w-full select-none">
      <div
        className="relative"
        style={{
          width: "100%",
          height: gridHeight + topLabelH + 6,
        }}
      >
        {/* month labels */}
        <div
          className="absolute"
          style={{ left: leftLabelW, top: 0, width: gridWidth, height: topLabelH }}
        >
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

        {/* day-of-week labels (every other row) */}
        <div
          className="absolute flex flex-col"
          style={{ left: 0, top: topLabelH, width: leftLabelW, height: gridHeight }}
        >
          {dow.map((d, i) => (
            <div
              key={i}
              className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/55"
              style={{
                height: cell,
                marginBottom: i < 6 ? gap : 0,
                lineHeight: `${cell}px`,
              }}
            >
              {i % 2 === 1 ? d : ""}
            </div>
          ))}
        </div>

        {/* cells */}
        <div
          className="absolute flex"
          style={{ left: leftLabelW, top: topLabelH, gap }}
        >
          {weeks.map((col, wi) => (
            <div key={wi} className="flex flex-col" style={{ gap }}>
              {col.map((c, di) => {
                if (c.future) {
                  return <div key={di} style={{ width: cell, height: cell }} />;
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
                      setHover({
                        x: r.left + r.width / 2,
                        y: r.top,
                        date: c.date,
                        min,
                        count,
                      });
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

      {/* legend */}
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
            ? `${formatLongDate(hover.date)} — no sessions`
            : `${formatLongDate(hover.date)} — ${hover.min} min · ${hover.count} session${hover.count === 1 ? "" : "s"}`}
        </div>
      )}
    </div>
  );
}

/* =================== Timer block card =================== */

function TimerBlockCard({ s }: { s: Session }) {
  return (
    <article
      className="group relative w-full rounded-lg px-5 py-4 md:px-6 md:py-5 flex items-center justify-between gap-6 transition-all duration-300"
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
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: s.projectColor ?? "#888" }}
            />
            {s.projectName}
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
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
          {fmtClock(s.startedAt)} — {fmtClock(s.completedAt)}
        </div>
      </div>
    </article>
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
  const [goal, setGoal] = useState(180);
  const [done, setDone] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    const sync = () => {
      setGoal(getTodayGoal());
      setDone(getTodayFocusedMinutes());
    };
    sync();
    window.addEventListener("hourglass:sessions", sync);
    window.addEventListener("hourglass:settings", sync);
    return () => {
      window.removeEventListener("hourglass:sessions", sync);
      window.removeEventListener("hourglass:settings", sync);
    };
  }, []);

  // Default to today
  const todayKey = useMemo(() => effectiveDayKey(new Date()), []);
  const activeKey = selectedKey ?? todayKey;
  const activeDate = selectedDate ?? effectiveToday();

  const dayBlocks = useMemo(
    () =>
      sessions
        .filter((s) => effectiveDayKey(s.completedAt) === activeKey)
        .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)),
    [sessions, activeKey],
  );

  const pct = goal > 0 ? Math.min(100, (done / goal) * 100) : 0;
  const isToday = activeKey === todayKey;
  const dayTotal = dayBlocks.reduce((a, s) => a + (s.focusedMinutes || 0), 0);

  return (
    <div className="w-full min-h-full px-6 md:px-12 lg:px-16 py-10 md:py-14 space-y-14">
      {/* Header */}
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.32em] text-amber-400/60">
            Insights
          </div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight mt-2 text-foreground">
            Analytics
          </h1>
        </div>
        {selectedKey && selectedKey !== todayKey && (
          <button
            onClick={() => {
              setSelectedKey(null);
              setSelectedDate(null);
            }}
            className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground hover:text-amber-200 transition-colors"
          >
            ← Back to today
          </button>
        )}
      </header>

      {/* Activity grid — full year */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground/80">
            Activity · last 53 weeks
          </h2>
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">
            Click a day to inspect its blocks
          </span>
        </div>
        <YearGrid
          sessions={sessions}
          selectedDayKey={selectedKey}
          onSelect={(k, d) => {
            setSelectedKey(k);
            setSelectedDate(d);
          }}
        />
      </section>

      {/* Today's summary — only when viewing today */}
      {isToday && (
        <section className="grid grid-cols-1 md:grid-cols-[auto_1fr] items-end gap-8 md:gap-12">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-amber-400/60">
              Focused today
            </div>
            <div
              className="font-display tracking-tight tabular-nums text-amber-100 mt-2"
              style={{
                fontSize: "clamp(3.5rem, 9vw, 6.5rem)",
                lineHeight: 1,
                textShadow: "0 0 32px rgba(245,158,11,0.25)",
              }}
            >
              {fmtHM(done)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between mb-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
              <span>Daily focus goal</span>
              <span className="tabular-nums text-amber-200/80">
                {done} / {goal} min
              </span>
            </div>
            <div className="relative h-1.5 w-full rounded-full overflow-hidden bg-foreground/[0.06]">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background:
                    "linear-gradient(90deg, rgba(245,158,11,0.7), rgba(251,191,36,1))",
                  boxShadow: "0 0 16px rgba(251,191,36,0.55)",
                }}
              />
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/50 tabular-nums">
              {Math.round(pct)}% complete
            </div>
          </div>
        </section>
      )}

      {/* Day summary when a past day is selected */}
      {!isToday && (
        <section>
          <div className="text-[10px] uppercase tracking-[0.32em] text-amber-400/60">
            {formatLongDate(activeDate)}
          </div>
          <div
            className="font-display tracking-tight tabular-nums text-amber-100 mt-2"
            style={{
              fontSize: "clamp(3rem, 7vw, 5rem)",
              lineHeight: 1,
              textShadow: "0 0 32px rgba(245,158,11,0.2)",
            }}
          >
            {fmtHM(dayTotal)}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/60">
            {dayBlocks.length} session{dayBlocks.length === 1 ? "" : "s"}
          </div>
        </section>
      )}

      {/* Timer blocks */}
      <section>
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground/80">
            {isToday ? "Heimat des Tages · today's blocks" : "Blocks"}
          </h2>
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50 tabular-nums">
            {dayBlocks.length} block{dayBlocks.length === 1 ? "" : "s"}
          </span>
        </div>

        {dayBlocks.length === 0 ? (
          <div
            className="rounded-lg px-6 py-12 text-center"
            style={{
              background: "rgba(26,26,26,0.6)",
              border: "1px dashed rgba(245,158,11,0.18)",
            }}
          >
            <p className="text-sm text-muted-foreground/80 italic">
              No focus blocks recorded yet. Time to start the hourglass.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {dayBlocks.map((s) => (
              <TimerBlockCard key={s.id} s={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
