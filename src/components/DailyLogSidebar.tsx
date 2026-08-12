import { useEffect, useMemo, useState } from "react";
import { ListChecks, Plus } from "lucide-react";
import { getSessions, type Session } from "@/lib/sessions";
import { getTodayFocusedMinutes, effectiveDayKey } from "@/lib/settings";
import { getDailyStreak } from "@/lib/streaks";
import { useSyncState } from "@/lib/useRealtimeSessions";
import { AddSessionModal } from "./AddSessionModal";
import { SessionDetailModal } from "./SessionDetailModal";
import { FocusScoreBadge } from "./FocusScoreBadge";
import { DailyFocusBudget } from "./DailyFocusBudget";
import { DailyStreakWidget } from "./DailyStreakWidget";
import { AccountabilityPartner } from "./AccountabilityPartner";
import { TodaysAgenda } from "./TodaysAgenda";





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
  const [addOpen, setAddOpen] = useState(false);
  const [editSession, setEditSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [done, setDone] = useState(0);
  const [, setStreak] = useState(0);


  const syncState = useSyncState();

  useEffect(() => {
    const sync = () => {
      setSessions(getSessions());
      setDone(getTodayFocusedMinutes());
      setStreak(getDailyStreak());
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

  // Realtime sync + hydrate on mount is centralized in useRealtimeSessions
  // (wired once at the root). This component just reflects the local cache
  // whenever the "hourglass:sessions" event fires.

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
              <div className="flex items-center gap-2">
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Today
                </div>
                <SyncDot state={syncState} />
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

            {/* Prominent: Daily Streak + 5-Day Challenge Progress */}
            <section>
              <DailyStreakWidget />
            </section>

            {/* Total today */}
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

            {/* Daily Focus Budget — biological upper boundary */}
            <section className="flex justify-center">
              <DailyFocusBudget />
            </section>

            {/* Today's agenda */}
            <TodaysAgenda />

            {/* Accountability partner */}
            <section className="flex justify-center">
              <AccountabilityPartner />
            </section>


            {/* Bottom: Completed blocks today */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Completed blocks
                </div>
                <button
                  onClick={() => setAddOpen(true)}
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-amber-300 transition-colors"
                  title="Log a forgotten session"
                >
                  <Plus className="h-3 w-3" strokeWidth={2} />
                  Add session
                </button>
              </div>
              {todays.length === 0 ? (
                <p className="text-xs text-muted-foreground/70 italic">
                  No focus blocks yet today. Start the timer or add one manually.
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
                      <button
                        type="button"
                        onClick={() => setEditSession(s)}
                        className="w-full text-left flex items-baseline justify-between gap-2 rounded-sm px-1 -mx-1 py-0.5 hover:bg-white/[0.03] transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-foreground truncate">
                            {s.task || "Untitled"}
                          </div>
                          {(s.projectName || typeof s.focusScore === "number") && (
                            <div className="mt-0.5 inline-flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                              {s.projectName && <span>[{s.projectName}]</span>}
                              <FocusScoreBadge score={s.focusScore} size="xs" />
                            </div>
                          )}
                        </div>
                        <div className="text-xs tabular-nums text-muted-foreground shrink-0">
                          {s.focusedMinutes} min
                        </div>

                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>

          </div>
        </div>
      </aside>

      <AddSessionModal open={addOpen} onOpenChange={setAddOpen} />
      <SessionDetailModal
        session={editSession}
        open={editSession !== null}
        onOpenChange={(o) => !o && setEditSession(null)}
      />
    </>
  );
}





function SyncDot({ state: liveState }: { state: ReturnType<typeof useSyncState> }) {
  // Avoid SSR/client mismatch: render the neutral state until hydrated.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const state = mounted ? liveState : "idle";
  const label =
    state === "syncing"
      ? "Syncing…"
      : state === "offline"
        ? "Offline"
        : state === "error"
          ? "Sync error"
          : "Synced";
  const color =
    state === "syncing"
      ? "bg-amber-400 animate-pulse"
      : state === "offline"
        ? "bg-muted-foreground/50"
        : state === "error"
          ? "bg-red-400"
          : "bg-emerald-400/70";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70"
      title={label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {state !== "idle" && <span>{label}</span>}
    </span>
  );
}
