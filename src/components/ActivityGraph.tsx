import { useEffect, useMemo, useState } from "react";
import { getSessions, dayKey, type Session } from "@/lib/sessions";

const WEEKS = 53;
const MONTH_NAMES = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

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
  4: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.45)]",
};

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function ActivityGraph() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    date: Date;
    minutes: number;
    count: number;
  } | null>(null);

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

  const { weeks, monthLabels } = useMemo(() => {
    // Build totals per day
    const totals = new Map<string, { min: number; count: number }>();
    for (const s of sessions) {
      const k = s.completedAt.slice(0, 10);
      const cur = totals.get(k) ?? { min: 0, count: 0 };
      cur.min += s.focusedMinutes || 0;
      cur.count += 1;
      totals.set(k, cur);
    }

    // Find Sunday at the end of current week (so today is included)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Week columns: Mon..Sun. Compute Monday of current week.
    const dayIdx = (today.getDay() + 6) % 7; // 0 = Mon
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() - dayIdx);

    // First Monday = currentMonday - (WEEKS-1) * 7
    const firstMonday = new Date(currentMonday);
    firstMonday.setDate(currentMonday.getDate() - (WEEKS - 1) * 7);

    const weeks: Array<Array<{ date: Date; min: number; count: number; future: boolean } | null>> = [];
    for (let w = 0; w < WEEKS; w++) {
      const col: Array<{ date: Date; min: number; count: number; future: boolean } | null> = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(firstMonday);
        date.setDate(firstMonday.getDate() + w * 7 + d);
        const future = date.getTime() > today.getTime();
        const t = totals.get(dayKey(date));
        col.push({
          date,
          min: t?.min ?? 0,
          count: t?.count ?? 0,
          future,
        });
      }
      weeks.push(col);
    }

    // Month labels: position above each week column where the month changes
    const monthLabels: Array<{ col: number; label: string }> = [];
    let lastMonth = -1;
    for (let w = 0; w < WEEKS; w++) {
      const firstDay = weeks[w][0]!.date;
      const m = firstDay.getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ col: w, label: MONTH_NAMES[m] });
        lastMonth = m;
      }
    }

    return { weeks, monthLabels };
  }, [sessions]);

  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
        Activity
      </div>
      <div className="relative rounded-md border border-border bg-background/40 p-3">
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Month labels row */}
            <div className="flex pl-7">
              <div className="relative h-4 flex-1" style={{ minWidth: WEEKS * 11 }}>
                {monthLabels.map((m) => (
                  <span
                    key={`${m.col}-${m.label}`}
                    className="absolute top-0 text-[9px] uppercase tracking-[0.16em] text-muted-foreground"
                    style={{ left: m.col * 11 }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Grid + day-of-week axis */}
            <div className="flex mt-1">
              <div className="flex flex-col mr-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70 w-6 select-none">
                {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
                  <div key={i} className="h-[11px] leading-[11px]">
                    {d}
                  </div>
                ))}
              </div>
              <div className="flex gap-[2px]">
                {weeks.map((col, wi) => (
                  <div key={wi} className="flex flex-col gap-[2px]">
                    {col.map((cell, di) => {
                      if (!cell || cell.future) {
                        return <div key={di} className="h-[9px] w-[9px]" />;
                      }
                      const lvl = intensity(cell.min);
                      return (
                        <div
                          key={di}
                          className={`h-[9px] w-[9px] rounded-[2px] cursor-pointer transition-transform hover:scale-150 ${LEVEL_STYLES[lvl]}`}
                          onMouseEnter={(e) => {
                            const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                            setHover({
                              x: r.left + r.width / 2,
                              y: r.top,
                              date: cell.date,
                              minutes: cell.min,
                              count: cell.count,
                            });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-1.5 mt-3 text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((l) => (
                <span
                  key={l}
                  className={`h-[9px] w-[9px] rounded-[2px] ${LEVEL_STYLES[l as 0 | 1 | 2 | 3 | 4]}`}
                />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>

        {hover && (
          <div
            className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-md border border-border bg-card text-[11px] text-foreground shadow-lg whitespace-nowrap"
            style={{ left: hover.x, top: hover.y - 6 }}
          >
            {hover.count === 0
              ? `No sessions on ${formatDate(hover.date)}`
              : `${hover.count} session${hover.count === 1 ? "" : "s"}, ${hover.minutes} min on ${formatDate(hover.date)}`}
          </div>
        )}
      </div>
    </section>
  );
}
