import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { dayKey, getSessions, type Session } from "@/lib/sessions";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Hourglass" },
      { name: "description", content: "Look back at what you focused on, day by day." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

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

  const byDay = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of sessions) {
      const k = s.completedAt.slice(0, 10);
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    return m;
  }, [sessions]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthName = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = dayKey(new Date());
  const selectedSessions = selected ? byDay.get(selected) ?? [] : [];
  const selectedMinutes = selectedSessions.reduce((sum, s) => sum + s.focusedMinutes, 0);

  return (
    <main className="min-h-screen flex bg-background text-foreground pb-16 md:pb-0">
      <Sidebar />
      <div className="flex-1 px-4 md:px-12 py-6 md:py-10 max-w-5xl mx-auto w-full">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 md:mb-10 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
              Calendar
            </div>
            <h1 className="font-display text-2xl md:text-3xl tracking-tight">{monthName}</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="h-9 w-9 rounded-md border border-border hover:border-foreground/60 flex items-center justify-center transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
              className="px-3 h-9 rounded-md border border-border text-xs uppercase tracking-[0.18em] hover:border-foreground/60 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="h-9 w-9 rounded-md border border-border hover:border-foreground/60 flex items-center justify-center transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </header>

        <div className="hidden md:grid grid-cols-7 gap-px text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-2 py-1">{d}</div>
          ))}
        </div>
        <div className="grid md:hidden grid-cols-7 gap-px text-[9px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i} className="px-1 py-1 text-center">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="aspect-square bg-background" />;
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const mins = list.reduce((sum, s) => sum + s.focusedMinutes, 0);
            const isToday = k === todayKey;
            const isSelected = selected === k;
            const intensity = Math.min(1, mins / 180); // 3h saturates
            return (
                <button
                key={i}
                onClick={() => setSelected(list.length ? k : null)}
                disabled={!list.length}
                className={`aspect-square bg-card relative p-1 md:p-2 text-left transition-colors ${
                  list.length ? "hover:bg-accent cursor-pointer" : "cursor-default"
                } ${isSelected ? "ring-1 ring-foreground/60 z-10" : ""}`}
              >
                <div className={`text-[11px] md:text-xs tabular-nums ${isToday ? "text-foreground" : "text-muted-foreground"}`}>
                  {d.getDate()}
                </div>
                {mins > 0 && (
                  <>
                    <div className="absolute bottom-1.5 md:bottom-2 left-1.5 md:left-2 right-1.5 md:right-2 h-0.5 md:h-1 rounded-full bg-foreground/10 overflow-hidden">
                      <div
                        className="h-full bg-sand"
                        style={{ width: `${Math.max(8, intensity * 100)}%`, opacity: 0.5 + intensity * 0.5 }}
                      />
                    </div>
                    <div className="absolute top-1.5 md:top-2 right-1.5 md:right-2 text-[9px] md:text-[10px] tabular-nums text-foreground/80">
                      {mins}m
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {selected && (
          <section className="mt-10">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display text-xl tracking-tight">
                {new Date(selected).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h2>
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {selectedMinutes} min focused · {selectedSessions.length} session
                {selectedSessions.length === 1 ? "" : "s"}
              </div>
            </div>
            <ul className="divide-y divide-border border border-border rounded-md overflow-hidden">
              {selectedSessions.map((s) => (
                <li key={s.id} className="px-4 py-3 flex items-center justify-between bg-card">
                  <div>
                    <div className="text-sm">{s.task}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(s.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {" → "}
                      {new Date(s.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm tabular-nums">{s.focusedMinutes} min</div>
                    <div className="text-[11px] text-muted-foreground">of {s.plannedMinutes} planned</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!sessions.length && (
          <p className="mt-12 text-center text-sm text-muted-foreground">
            No sessions yet. Start the hourglass to begin.
          </p>
        )}
      </div>
    </main>
  );
}
