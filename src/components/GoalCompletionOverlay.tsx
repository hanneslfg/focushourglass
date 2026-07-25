import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getAllGoals, updateGoal, type ProjectGoal } from "@/lib/goals";
import { getSessions } from "@/lib/sessions";
import { safeStorage } from "@/lib/safeStorage";
import { fireCelebration } from "@/lib/confetti";

const SEEN_KEY = "hourglass.goalCompletion.seen.v1";

function readSeen(): string[] {
  try {
    const raw = safeStorage.getItem(SEEN_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((v) => typeof v === "string");
    }
  } catch {
    /* ignore */
  }
  return [];
}

function writeSeen(list: string[]) {
  try {
    safeStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Total focused minutes attributed to a goal (by id or by matching text). */
function minutesForGoal(goal: ProjectGoal): number {
  const needle = goal.text.trim().toLowerCase();
  let total = 0;
  for (const s of getSessions()) {
    const matches =
      (goal.id && s.goalId === goal.id) ||
      (!!needle &&
        ((s.goalText ?? "").trim().toLowerCase() === needle ||
          (s.tags ?? []).some((t) => t.trim().toLowerCase() === needle)));
    if (matches) total += s.focusedMinutes ?? 0;
  }
  return total;
}

/**
 * Watches all active goals. When a goal's target minutes are met, triggers a
 * one-time celebratory modal with confetti and offers "on to the next goal".
 */
export function GoalCompletionOverlay() {
  const [achieved, setAchieved] = useState<ProjectGoal | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("hourglass:sessions", bump);
    window.addEventListener("hourglass:goals", bump);
    return () => {
      window.removeEventListener("hourglass:sessions", bump);
      window.removeEventListener("hourglass:goals", bump);
    };
  }, []);

  useEffect(() => {
    if (achieved) return;
    const seen = readSeen();
    const goals = getAllGoals();
    for (const g of goals) {
      if (g.done) continue;
      if (!g.targetMinutes || g.targetMinutes <= 0) continue;
      if (seen.includes(g.id)) continue;
      const mins = minutesForGoal(g);
      if (mins >= g.targetMinutes) {
        seen.push(g.id);
        writeSeen(seen);
        setAchieved(g);
        fireCelebration();
        toast("Goal Achieved 🎉", {
          description: g.text,
          duration: 5000,
        });
        // Try native notification if permitted (silent fail otherwise).
        try {
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification("Goal Achieved 🎉", { body: g.text });
          }
        } catch {
          /* noop */
        }
        break;
      }
    }
  }, [tick, achieved]);

  const nextGoal = useMemo<ProjectGoal | null>(() => {
    if (!achieved) return null;
    const goals = getAllGoals();
    const sameProject = goals
      .filter(
        (g) =>
          !g.done &&
          g.id !== achieved.id &&
          (g.projectId ?? "").trim().toLowerCase() ===
            (achieved.projectId ?? "").trim().toLowerCase(),
      )
      .sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt - b.createdAt,
      );
    return sameProject[0] ?? null;
  }, [achieved]);

  if (!achieved) return null;

  const close = () => setAchieved(null);

  const onToNext = () => {
    void updateGoal(achieved.projectId, achieved.id, { done: true });
    close();
    if (nextGoal) {
      // Small delay so exit animation doesn't collide with scroll.
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("hourglass:focusGoal", {
            detail: { goalId: nextGoal.id },
          }),
        );
      }, 220);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center px-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-300/40 bg-gradient-to-b from-neutral-950 to-black px-8 py-10 text-center shadow-[0_40px_120px_-20px_rgba(226,176,92,0.35)]">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full bg-amber-300/[0.15] blur-3xl" />
        <div className="relative">
          <div className="text-5xl mb-3">🎉</div>
          <h3
            className="text-3xl font-light tracking-tight text-white leading-tight"
            style={{ fontFamily: '"Cormorant Garamond", serif' }}
          >
            Goal Achieved!
          </h3>
          <p className="mt-3 text-sm text-white/70 leading-relaxed">
            Well done! You put in the undeniable work and hit your target.
          </p>
          <div className="mt-5 rounded-xl border border-amber-300/25 bg-amber-300/[0.05] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-amber-300/80">
              Milestone cleared
            </p>
            <p className="mt-1 text-sm text-white/90">{achieved.text}</p>
          </div>

          <button
            onClick={onToNext}
            className="mt-7 w-full inline-flex items-center justify-center gap-2 rounded-full bg-amber-300 px-6 py-3 text-sm font-medium text-black transition-all hover:bg-amber-200 hover:shadow-[0_0_30px_rgba(226,176,92,0.4)]"
          >
            {nextGoal ? "On to the Next Goal 🚀" : "Keep the momentum 🚀"}
          </button>
          {nextGoal && (
            <p className="mt-2 text-[11px] text-white/50">
              Next up: <span className="text-white/80">{nextGoal.text}</span>
            </p>
          )}
          <button
            onClick={close}
            className="mt-3 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
