import { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { getSessions, hydrateFromRemote, type Session } from "@/lib/sessions";
import {
  getTodayGoal,
  getTodayFocusedMinutes,
  getTodayOverride,
  clearTodayOverride,
  effectiveDayKey,
} from "@/lib/settings";
import { refreshStreaks, getCachedStreaks, type Streaks } from "@/lib/streaks";
import { syncPendingSessions, supabase } from "@/lib/supabase";

function fmtHM(mins: number) {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function isToday(iso: string) {
  return effectiveDayKey(iso) === effectiveDayKey(new Date());
}

export function DailyLogSidebar() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [goal, setGoal] = useState(180);
  const [done, setDone] = useState(0);
  const [override, setOverride] = useState<number | null>(null);
  const [streaks, setStreaks] = useState<Streaks>(() => getCachedStreaks());

  useEffect(() => {
    const sync = () => {
      setSessions(getSessions());
      setGoal(getTodayGoal());
      setDone(getTodayFocusedMinutes());
      setOverride(getTodayOverride());
      setStreaks(refreshStreaks());
    };
    sync();
    window.addEventListener("hourglass:sessions", sync);
    window.addEventListener("hourglass:settings", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hourglass:sessions", sync);
      window.removeEventListener("hourglass:settings", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    // Force a fresh remote pull on mount so PC reflects mobile inserts.
    hydrateFromRemote()
      .then((ok) => { if (ok) window.dispatchEvent(new Event("hourglass:sessions")); })
      .catch(() => {});
    syncPendingSessions().catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        hydrateFromRemote()
          .then((ok) => { if (ok) window.dispatchEvent(new Event("hourglass:sessions")); })
          .catch(() => {});
        syncPendingSessions()
          .then((r) => {
            if (r.synced > 0) window.dispatchEvent(new Event("hourglass:sessions"));
          })
          .catch(() => {});
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const todays = useMemo(
    () =>
      sessions
        .filter((s) => isToday(s.completedAt))
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
    [sessions],
  );

  const pct = goal > 0 ? Math.min(100, (done / goal) * 100) : 0;
  const reached = done >= goal && goal > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 right-4 z-40 h-10 w-10 md:h-11 md:w-11 rounded-full border border-border bg-background/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/60 transition-colors touch-manipulation"
        aria-label="Open today's focus log"
      >
        <ListChecks className="h-4 w-4 md:h-[18px] md:w-[18px]" strokeWidth={1.5} />
      </button>

      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px] transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden
      />

      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[400px] bg-card border-l border-border shadow-2xl transition-transform duration-300 ease-out overflow-x-hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="h-full flex flex-col">
          <header className="flex items-center justify-between pl-5 pr-6 py-4 sm:px-5 border-b border-border">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Today
              </div>
              <h2 className="font-display text-2xl tracking-tight mt-0.5">
                Focus log
              </h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-10 w-10 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
              aria-label="Close"
            >
              <span className="text-lg leading-none">×</span>
            </button>
          </header>

          <div
            className="flex-1 overflow-y-auto pl-5 pr-6 py-6 sm:px-5 space-y-8"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
              paddingRight: "max(1.5rem, env(safe-area-inset-right))",
            }}
          >
            {/* Streaks */}
            <section className="grid grid-cols-2 gap-2">
              <StreakCard
                icon="🔥"
                value={streaks.dayStreak}
                label={`day${streaks.dayStreak === 1 ? "" : "s"}`}
                sub="streak"
              />
              <StreakCard
                icon="⚡"
                value={streaks.sessionStreak}
                label={`session${streaks.sessionStreak === 1 ? "" : "s"}`}
                sub="streak"
              />
            </section>

            {/* Top: Total today */}
            <section className="text-center">
              <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                Focused today
              </div>
              <div className="mt-2 font-display text-6xl md:text-7xl tracking-tight tabular-nums text-foreground">
                {fmtHM(done)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                {done} min · {todays.length} session{todays.length === 1 ? "" : "s"}
              </div>
            </section>

            {/* Center: Goal progress */}
            <section className="rounded-md border border-border bg-background/40 px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Daily goal
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {reached ? "Goal reached" : `${Math.round(pct)}%`}
                </div>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="font-display text-2xl tabular-nums tracking-tight">
                  {done}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  / {goal} min
                </span>
                {override != null && (
                  <button
                    onClick={clearTodayOverride}
                    className="ml-auto text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
                    title="Reset to default daily goal"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-border/60 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </section>

            {/* Bottom: Completed blocks today */}
            <section>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
                Completed blocks
              </div>
              {todays.length === 0 ? (
                <p className="text-xs text-muted-foreground/70 italic">
                  No focus blocks yet today. Start the timer to begin.
                </p>
              ) : (
                <ol className="relative space-y-0">
                  {todays.map((s, i) => (
                    <li key={s.id} className="relative pl-5 pb-4 last:pb-0">
                      <span
                        className="absolute left-[5px] top-1.5 h-2 w-2 rounded-full ring-2 ring-background"
                        style={{
                          background: s.projectColor ?? "var(--muted-foreground)",
                        }}
                      />
                      {i < todays.length - 1 && (
                        <span className="absolute left-[9px] top-3.5 bottom-0 w-px bg-border" />
                      )}
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-foreground truncate">
                            {s.task || "Untitled"}
                          </div>
                          {s.projectName && (
                            <div className="mt-0.5 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                              <span>[{s.projectName}]</span>
                            </div>
                          )}
                        </div>
                        <div className="text-xs tabular-nums text-muted-foreground shrink-0">
                          {s.focusedMinutes} min
                        </div>
                      </div>
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

function StreakCard({
  icon,
  value,
  label,
  sub,
}: {
  icon: string;
  value: number;
  label: string;
  sub: string;
}) {
  const active = value > 0;
  return (
    <div
      className={`rounded-md border px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
        active
          ? "border-amber-500/30 bg-amber-500/[0.06]"
          : "border-border bg-background/40"
      }`}
    >
      <span
        className="text-base leading-none"
        style={{ filter: active ? "drop-shadow(0 0 6px rgba(245,158,11,0.45))" : "grayscale(1) opacity(0.55)" }}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex flex-col leading-tight">
        <div className="flex items-baseline gap-1">
          <span
            className={`font-display text-xl tabular-nums tracking-tight ${
              active ? "text-amber-300" : "text-muted-foreground"
            }`}
            style={active ? { textShadow: "0 0 12px rgba(245,158,11,0.35)" } : undefined}
          >
            {value}
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </span>
        </div>
        <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70">
          {sub}
        </span>
      </div>
    </div>
  );
}
