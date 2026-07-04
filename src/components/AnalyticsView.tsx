import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getSessions, hydrateFromRemote, dayKey, type Session } from "@/lib/sessions";
import { supabase } from "@/lib/supabase";
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

function TimerBlockCard({ s, onClick }: { s: Session; onClick?: (s: Session) => void }) {
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
        {s.tags && s.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
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
        <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/55 tabular-nums">
          {effectiveDayKey(s.completedAt)}
        </div>
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
          {fmtClock(s.startedAt)} — {fmtClockFromStart(s.startedAt, s.focusedMinutes)}
        </div>
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

  // Tag filter — "__untagged" is a synthetic value covering sessions with no tags
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const availableTags = useMemo(() => {
    const map = new Map<string, string>(); // lower -> display
    let hasUntagged = false;
    for (const s of rawInRange) {
      if (!s.tags || s.tags.length === 0) { hasUntagged = true; continue; }
      for (const t of s.tags) {
        const n = t.trim();
        if (!n) { hasUntagged = true; continue; }
        const k = n.toLowerCase();
        if (!map.has(k)) map.set(k, n);
      }
    }
    const list = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return { list, hasUntagged };
  }, [rawInRange]);

  const sessionMatchesTags = (s: Session, sel: Set<string>) => {
    if (sel.size === 0) return true;
    const tags = (s.tags ?? []).map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) return sel.has("__untagged");
    return tags.some((t) => sel.has(t.toLowerCase()));
  };

  const inRange = useMemo(() => {
    return rawInRange
      .filter((s) => sessionMatchesTags(s, selectedTags))
      .sort((x, y) => (x.completedAt < y.completedAt ? 1 : -1));
  }, [rawInRange, selectedTags]);

  // Tag → minutes breakdown, respecting the current range but ignoring the
  // tag filter so users always see the full distribution.
  const tagBreakdown = useMemo(() => {
    const totals = new Map<string, { label: string; min: number }>();
    let untagged = 0;
    for (const s of rawInRange) {
      const mins = s.focusedMinutes || 0;
      const tags = (s.tags ?? []).map((t) => t.trim()).filter(Boolean);
      if (tags.length === 0) { untagged += mins; continue; }
      // Split evenly across tags so totals stay comparable to session totals.
      const share = mins / tags.length;
      for (const t of tags) {
        const k = t.toLowerCase();
        const cur = totals.get(k) ?? { label: t, min: 0 };
        cur.min += share;
        totals.set(k, cur);
      }
    }
    const rows = [...totals.entries()]
      .map(([k, v]) => ({ key: k, label: v.label, min: Math.round(v.min) }))
      .sort((a, b) => b.min - a.min);
    if (untagged > 0) rows.push({ key: "__untagged", label: "Untagged", min: Math.round(untagged) });
    return rows;
  }, [rawInRange]);


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

  const tagFilterActive = selectedTags.size > 0;
  const toggleTag = (key: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const clearTags = () => setSelectedTags(new Set());


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
            {(["week", "month", "year", "all", "custom"] as RangeMode[]).map((m) => {
              const active = mode === m;
              const label =
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
        <StatCard label="Longest Streak" value={`${longestStreak}d`} sub="in range">
          <Sparkline data={streakSeries} variant="area" />
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
            {inRange.map((s) => <TimerBlockCard key={s.id} s={s} onClick={setOpenSession} />)}
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
              openDayBlocks.map((s) => <TimerBlockCard key={s.id} s={s} onClick={setOpenSession} />)
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
