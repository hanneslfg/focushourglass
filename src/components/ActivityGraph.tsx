import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { getSessions, dayKey, type Session } from "@/lib/sessions";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTH_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function intensity(min: number): 0 | 1 | 2 | 3 | 4 {
  if (min <= 0) return 0;
  if (min < 60) return 1;
  if (min < 120) return 2;
  if (min < 180) return 3;
  return 4;
}

const LEVEL_STYLES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-foreground/[0.06]",
  1: "bg-amber-500/25",
  2: "bg-amber-500/45",
  3: "bg-amber-500/70",
  4: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]",
};

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    month: "long", day: "numeric", year: "numeric",
  });
}

type DayTotals = Map<string, { min: number; count: number }>;

function buildTotals(sessions: Session[]): DayTotals {
  const m: DayTotals = new Map();
  for (const s of sessions) {
    const k = s.completedAt.slice(0, 10);
    const cur = m.get(k) ?? { min: 0, count: 0 };
    cur.min += s.focusedMinutes || 0;
    cur.count += 1;
    m.set(k, cur);
  }
  return m;
}

function useSessions() {
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

// ============ Tooltip helper ============
type HoverState = {
  x: number; y: number; date: Date; min: number; count: number;
} | null;

function Tooltip({ state }: { state: HoverState }) {
  if (!state) return null;
  const text =
    state.count === 0
      ? `${formatDate(state.date)}: no sessions`
      : `${formatDate(state.date)}: ${state.min} focused minute${state.min === 1 ? "" : "s"} across ${state.count} session${state.count === 1 ? "" : "s"}`;
  return (
    <div
      className="pointer-events-none fixed z-[90] -translate-x-1/2 -translate-y-full px-3 py-1.5 rounded-md border border-amber-500/30 bg-card/95 backdrop-blur text-[11px] text-foreground shadow-lg whitespace-nowrap"
      style={{ left: state.x, top: state.y - 6 }}
    >
      {text}
    </div>
  );
}

function cellHandlers(
  date: Date,
  min: number,
  count: number,
  setHover: (s: HoverState) => void,
  onClick?: () => void,
) {
  const enter = (e: React.SyntheticEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover({ x: r.left + r.width / 2, y: r.top, date, min, count });
  };
  return {
    onMouseEnter: enter,
    onMouseLeave: () => setHover(null),
    onTouchStart: enter,
    onClick,
  };
}

// ============ Monthly grid (default sidebar view) ============
type View = "month" | "year" | "all";

export function ActivityGraph() {
  const sessions = useSessions();
  const [view, setView] = useState<View>("month");
  const [hover, setHover] = useState<HoverState>(null);
  const totals = useMemo(() => buildTotals(sessions), [sessions]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { weeks, monthLabel } = useMemo(() => {
    const y = today.getFullYear();
    const m = today.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startIdx = (first.getDay() + 6) % 7;
    const gridStart = new Date(y, m, 1 - startIdx);
    const totalDays = startIdx + last.getDate();
    const rows = Math.ceil(totalDays / 7);

    const weeks: Array<Array<{ date: Date; inMonth: boolean; future: boolean }>> = [];
    for (let r = 0; r < rows; r++) {
      const row: Array<{ date: Date; inMonth: boolean; future: boolean }> = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + r * 7 + d);
        row.push({
          date,
          inMonth: date.getMonth() === m,
          future: date.getTime() > today.getTime(),
        });
      }
      weeks.push(row);
    }
    return { weeks, monthLabel: `${MONTH_NAMES[m]} ${y}` };
  }, [today]);

  const fullScreenMode: RangeMode | null =
    view === "year" ? "12m" : view === "all" ? "all" : null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Activity
        </div>
        <div
          className="inline-flex rounded-md border border-border p-0.5"
          role="tablist"
          aria-label="Activity view"
        >
          {(
            [
              { id: "month", label: "Month" },
              { id: "year", label: "Year" },
              { id: "all", label: "All-Time" },
            ] as const
          ).map((opt) => {
            const active = view === opt.id;
            return (
              <button
                key={opt.id}
                role="tab"
                aria-selected={active}
                onClick={() => setView(opt.id)}
                className={`px-2.5 h-6 text-[9px] uppercase tracking-[0.16em] rounded-[4px] transition-colors ${
                  active
                    ? "bg-amber-500/15 text-amber-200"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border border-border bg-background/40 p-4">
        <div className="text-[11px] uppercase tracking-[0.28em] text-foreground/80 text-center mb-3">
          {monthLabel}
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {DOW.map((d) => (
            <div key={d} className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70 text-center">
              {d[0]}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {weeks.flat().map((cell, i) => {
            if (cell.future || !cell.inMonth) {
              return (
                <div
                  key={i}
                  className={`aspect-square rounded-md ${cell.inMonth ? "bg-foreground/[0.03]" : ""}`}
                />
              );
            }
            const t = totals.get(dayKey(cell.date));
            const min = t?.min ?? 0;
            const count = t?.count ?? 0;
            const lvl = intensity(min);
            const isToday = cell.date.getTime() === today.getTime();
            return (
              <div
                key={i}
                className={`relative aspect-square rounded-md cursor-pointer transition-transform hover:scale-110 ${LEVEL_STYLES[lvl]} ${
                  isToday ? "ring-1 ring-amber-400/70" : ""
                }`}
                {...cellHandlers(cell.date, min, count, setHover)}
              >
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-foreground/60">
                  {cell.date.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-1.5 mt-3 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span
              key={l}
              className={`h-2.5 w-2.5 rounded-[3px] ${LEVEL_STYLES[l as 0 | 1 | 2 | 3 | 4]}`}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      <Tooltip state={hover} />
      {fullScreenMode && (
        <FullScreenActivity
          mode={fullScreenMode}
          onClose={() => setView("month")}
          totals={totals}
          sessions={sessions}
        />
      )}
    </section>
  );
}

// ============ Full-screen activity ============
type RangeMode = "12m" | "all";

function FullScreenActivity({
  mode,
  onClose,
  totals,
  sessions,
}: {
  mode: RangeMode;
  onClose: () => void;
  totals: DayTotals;
  sessions: Session[];
}) {
  const [hover, setHover] = useState<HoverState>(null);
  const [dayDetail, setDayDetail] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth - 64 : 1200,
    h: typeof window !== "undefined" ? window.innerHeight - 180 : 700,
  }));

  const scopeLabel = mode === "12m" ? "Yearly Overview" : "All-Time Overview";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dayDetail) setDayDetail(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dayDetail]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { weeks, monthLabels } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayIdx = (today.getDay() + 6) % 7;
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() - dayIdx);

    let firstMonday: Date;
    if (mode === "12m") {
      firstMonday = new Date(currentMonday);
      firstMonday.setDate(currentMonday.getDate() - 52 * 7);
    } else {
      if (sessions.length === 0) {
        firstMonday = new Date(currentMonday);
        firstMonday.setDate(currentMonday.getDate() - 52 * 7);
      } else {
        const earliest = sessions.reduce((min, s) => {
          const t = new Date(s.completedAt).getTime();
          return t < min ? t : min;
        }, Date.now());
        const ed = new Date(earliest);
        ed.setHours(0, 0, 0, 0);
        const eIdx = (ed.getDay() + 6) % 7;
        firstMonday = new Date(ed);
        firstMonday.setDate(ed.getDate() - eIdx);
      }
    }

    const totalWeeks =
      Math.floor((currentMonday.getTime() - firstMonday.getTime()) / (7 * 86400000)) + 1;

    const weeks: Array<Array<{ date: Date; future: boolean }>> = [];
    for (let w = 0; w < totalWeeks; w++) {
      const row: Array<{ date: Date; future: boolean }> = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(firstMonday);
        date.setDate(firstMonday.getDate() + w * 7 + d);
        row.push({ date, future: date.getTime() > today.getTime() });
      }
      weeks.push(row);
    }

    const monthLabels: Array<{ col: number; label: string }> = [];
    let lastMonth = -1;
    let lastYear = -1;
    for (let w = 0; w < totalWeeks; w++) {
      const firstDay = weeks[w][0].date;
      const m = firstDay.getMonth();
      const y = firstDay.getFullYear();
      if (m !== lastMonth || y !== lastYear) {
        const prev = monthLabels[monthLabels.length - 1];
        if (!prev || w - prev.col >= 2) {
          const label =
            mode === "all" && y !== lastYear
              ? `${MONTH_SHORT[m]} '${String(y).slice(2)}`
              : MONTH_SHORT[m];
          monthLabels.push({ col: w, label });
        }
        lastMonth = m;
        lastYear = y;
      }
    }

    return { weeks, monthLabels };
  }, [mode, sessions]);

  const totalWeeks = weeks.length;

  // Compute cell + gap to fit available box (no horizontal scroll, fills height)
  const { cell, gap, leftLabelW, topLabelH } = useMemo(() => {
    const leftLabelW = 36;
    const topLabelH = 22;
    const w = Math.max(box.w - leftLabelW - 8, 100);
    const h = Math.max(box.h - topLabelH - 8, 100);
    // gap is ~1/6 of cell, min 2
    const cellW = w / totalWeeks;
    const cellH = h / 7;
    let cell = Math.floor(Math.min(cellW, cellH));
    cell = Math.max(6, Math.min(cell, 40));
    const gap = Math.max(2, Math.round(cell / 7));
    // re-fit with gap
    const fitW = (w - (totalWeeks - 1) * 2) / totalWeeks;
    const fitH = (h - 6 * 2) / 7;
    cell = Math.max(6, Math.min(40, Math.floor(Math.min(fitW, fitH))));
    return { cell, gap: Math.max(2, Math.round(cell / 8)), leftLabelW, topLabelH };
  }, [box, totalWeeks]);

  const gridWidth = totalWeeks * cell + (totalWeeks - 1) * gap;
  const gridHeight = 7 * cell + 6 * gap;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-background animate-in fade-in duration-200 flex flex-col">
        <header className="flex items-center justify-between px-8 py-5 border-b border-border/60 shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              Activity
            </div>
            <h2 className="font-display text-2xl tracking-tight mt-0.5 text-amber-100/90">
              {scopeLabel}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full border border-border/60 text-muted-foreground/80 hover:text-amber-200 hover:border-amber-500/50 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </header>

        <div ref={containerRef} className="flex-1 overflow-hidden px-8 py-6 min-h-0">
          <div className="relative w-full h-full">
            {/* Month labels */}
            <div
              className="absolute"
              style={{ left: leftLabelW, top: 0, width: gridWidth, height: topLabelH }}
            >
              {monthLabels.map((m) => (
                <span
                  key={`${m.col}-${m.label}`}
                  className="absolute top-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80"
                  style={{ left: m.col * (cell + gap) }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            {/* Day-of-week labels */}
            <div
              className="absolute flex flex-col"
              style={{ left: 0, top: topLabelH, width: leftLabelW, height: gridHeight }}
            >
              {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
                <div
                  key={i}
                  className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70"
                  style={{
                    height: cell,
                    marginBottom: i < 6 ? gap : 0,
                    lineHeight: `${cell}px`,
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div
              className="absolute flex"
              style={{ left: leftLabelW, top: topLabelH, gap }}
            >
              {weeks.map((col, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap }}>
                  {col.map((c, di) => {
                    if (c.future) {
                      return <div key={di} style={{ height: cell, width: cell }} />;
                    }
                    const t = totals.get(dayKey(c.date));
                    const min = t?.min ?? 0;
                    const count = t?.count ?? 0;
                    const lvl = intensity(min);
                    return (
                      <div
                        key={di}
                        className={`rounded-[3px] cursor-pointer transition-transform hover:scale-[1.35] hover:ring-1 hover:ring-amber-300/70 ${LEVEL_STYLES[lvl]}`}
                        style={{ height: cell, width: cell }}
                        {...cellHandlers(c.date, min, count, setHover, () => setDayDetail(c.date))}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-8 py-3 border-t border-border/60 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 shrink-0">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span
              key={l}
              className={`h-3 w-3 rounded-[3px] ${LEVEL_STYLES[l as 0 | 1 | 2 | 3 | 4]}`}
            />
          ))}
          <span>More</span>
        </footer>
      </div>
      <Tooltip state={hover} />
      {dayDetail && (
        <DayDetailModal
          date={dayDetail}
          sessions={sessions}
          onClose={() => setDayDetail(null)}
        />
      )}
    </>
  );
}

// ============ Day-detail modal ============
function DayDetailModal({
  date,
  sessions,
  onClose,
}: {
  date: Date;
  sessions: Session[];
  onClose: () => void;
}) {
  const key = dayKey(date);
  const daySessions = useMemo(
    () =>
      sessions
        .filter((s) => s.completedAt.slice(0, 10) === key)
        .sort((a, b) => (a.completedAt < b.completedAt ? -1 : 1)),
    [sessions, key],
  );
  const totalMin = daySessions.reduce((a, s) => a + (s.focusedMinutes || 0), 0);

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      />
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border border-amber-500/20 bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <header className="flex items-start justify-between px-6 py-5 border-b border-border/60">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-amber-400/70">
                Work Blocks
              </div>
              <h3 className="font-display text-xl tracking-tight mt-0.5">
                {formatDate(date)}
              </h3>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-2">
                {totalMin} focused min · {daySessions.length} session
                {daySessions.length === 1 ? "" : "s"}
              </div>
            </div>
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-full border border-border/60 text-muted-foreground/80 hover:text-amber-200 hover:border-amber-500/50 flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </header>
          <div className="flex-1 overflow-auto px-6 py-4">
            {daySessions.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-10">
                No sessions on this day.
              </div>
            ) : (
              <ul className="space-y-2">
                {daySessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-border/50 bg-background/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {s.projectColor && (
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: s.projectColor }}
                          />
                        )}
                        <span className="truncate text-sm text-foreground">
                          {s.task || "Untitled session"}
                        </span>
                      </div>
                      {s.projectName && (
                        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mt-0.5">
                          {s.projectName}
                        </div>
                      )}
                    </div>
                    <div className="text-sm tabular-nums text-amber-200/90 shrink-0">
                      {s.focusedMinutes} min
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
