import { useEffect, useMemo, useState } from "react";
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
  return (
    <div
      className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-md border border-border bg-card text-[11px] text-foreground shadow-lg whitespace-nowrap"
      style={{ left: state.x, top: state.y - 6 }}
    >
      {state.count === 0
        ? `No sessions on ${formatDate(state.date)}`
        : `${state.count} session${state.count === 1 ? "" : "s"}, ${state.min} min on ${formatDate(state.date)}`}
    </div>
  );
}

function cellHandlers(
  date: Date,
  min: number,
  count: number,
  setHover: (s: HoverState) => void,
) {
  const enter = (e: React.SyntheticEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover({ x: r.left + r.width / 2, y: r.top, date, min, count });
  };
  return {
    onMouseEnter: enter,
    onMouseLeave: () => setHover(null),
    onTouchStart: enter,
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
    const startIdx = (first.getDay() + 6) % 7; // Mon = 0
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
    return {
      weeks,
      monthLabel: `${MONTH_NAMES[m]} ${y}`,
    };
  }, [today]);

  const modalMode: RangeMode | null =
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
            <div
              key={d}
              className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70 text-center"
            >
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
                  className={`aspect-square rounded-md ${
                    cell.inMonth ? "bg-foreground/[0.03]" : ""
                  }`}
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
      {modalMode && (
        <YearlyModal
          mode={modalMode}
          onClose={() => setView("month")}
          totals={totals}
          sessions={sessions}
        />
      )}
    </section>
  );
}

// ============ Yearly modal ============
type RangeMode = "12m" | "all";

function YearlyModal({
  onClose,
  totals,
  sessions,
}: {
  onClose: () => void;
  totals: DayTotals;
  sessions: Session[];
}) {
  const [mode, setMode] = useState<RangeMode>("12m");
  const [hover, setHover] = useState<HoverState>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      // All time: from earliest session (or 12m default if none)
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

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col">
          <header className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Overview
              </div>
              <h2 className="font-display text-2xl tracking-tight mt-0.5">
                Yearly activity
              </h2>
            </div>
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </header>

          <div className="px-6 py-4 border-b border-border flex justify-center">
            <div className="inline-flex rounded-md border border-border p-0.5">
              {(["12m", "all"] as RangeMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 h-8 text-[11px] uppercase tracking-[0.18em] rounded-[5px] transition-colors ${
                    mode === m
                      ? "bg-amber-500/15 text-amber-200"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "12m" ? "Last 12 months" : "All time"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <div className="min-w-fit mx-auto">
              <div className="flex" style={{ paddingLeft: 24 }}>
                <div className="relative h-4" style={{ width: totalWeeks * 14 }}>
                  {monthLabels.map((m) => (
                    <span
                      key={`${m.col}-${m.label}`}
                      className="absolute top-0 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                      style={{ left: m.col * 14 }}
                    >
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex mt-1">
                <div
                  className="flex flex-col mr-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70 select-none"
                  style={{ width: 22 }}
                >
                  {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
                    <div
                      key={i}
                      className="leading-none flex items-center"
                      style={{ height: 12, marginBottom: i < 6 ? 2 : 0 }}
                    >
                      {d}
                    </div>
                  ))}
                </div>
                <div className="flex" style={{ gap: 2 }}>
                  {weeks.map((col, wi) => (
                    <div key={wi} className="flex flex-col" style={{ gap: 2 }}>
                      {col.map((cell, di) => {
                        if (cell.future) {
                          return (
                            <div key={di} style={{ height: 12, width: 12 }} />
                          );
                        }
                        const t = totals.get(dayKey(cell.date));
                        const min = t?.min ?? 0;
                        const count = t?.count ?? 0;
                        const lvl = intensity(min);
                        return (
                          <div
                            key={di}
                            className={`rounded-[3px] cursor-pointer transition-transform hover:scale-150 ${LEVEL_STYLES[lvl]}`}
                            style={{ height: 12, width: 12 }}
                            {...cellHandlers(cell.date, min, count, setHover)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-1.5 mt-4 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((l) => (
                  <span
                    key={l}
                    className={`h-3 w-3 rounded-[3px] ${LEVEL_STYLES[l as 0 | 1 | 2 | 3 | 4]}`}
                  />
                ))}
                <span>More</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Tooltip state={hover} />
    </>
  );
}
