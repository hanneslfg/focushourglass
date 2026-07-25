import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getDailyStreak } from "@/lib/streaks";
import { claimMilestones, getFreezeCount, MAX_FREEZES } from "@/lib/streakFreezes";
import { fireCelebration } from "@/lib/confetti";

/**
 * Fires a celebration modal + confetti whenever the user crosses a
 * progression milestone (5, 15, 50, 100, 200, …) and awards +1 Streak Freeze.
 */
export function StreakMilestoneOverlay() {
  const [milestone, setMilestone] = useState<number | null>(null);

  useEffect(() => {
    const check = () => {
      const streak = getDailyStreak();
      if (streak <= 0) return;
      const newly = claimMilestones(streak);
      if (newly.length === 0) return;
      const last = newly[newly.length - 1];
      setMilestone(last);
      fireCelebration();
      toast(`${last}-day streak unlocked 🧊`, {
        description: `+1 Streak Freeze awarded (max ${MAX_FREEZES}).`,
        duration: 6000,
      });
    };
    check();
    window.addEventListener("hourglass:sessions", check);
    return () => window.removeEventListener("hourglass:sessions", check);
  }, []);

  if (milestone == null) return null;

  const freezes = getFreezeCount();

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center px-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-300/40 bg-gradient-to-b from-neutral-950 to-black px-8 py-10 text-center shadow-[0_40px_120px_-20px_rgba(226,176,92,0.35)]">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full bg-amber-300/[0.15] blur-3xl" />
        <div className="relative">
          <div className="text-5xl mb-3">🔥</div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-amber-300/80">
            Milestone Cleared
          </p>
          <h3
            className="mt-2 text-4xl font-light tracking-tight text-white leading-tight"
            style={{ fontFamily: '"Cormorant Garamond", serif' }}
          >
            {milestone}-Day Streak
          </h3>
          <p className="mt-3 text-sm text-white/70 leading-relaxed">
            Extraordinary consistency. You've earned{" "}
            <span className="text-amber-300 font-medium">+1 Streak Freeze 🧊</span>
            {" "}to protect your streak on off-days.
          </p>

          <div className="mt-6 flex items-center justify-center gap-2">
            {Array.from({ length: MAX_FREEZES }).map((_, i) => {
              const owned = i < freezes;
              return (
                <span
                  key={i}
                  className={`text-2xl transition-all ${
                    owned
                      ? "opacity-100 drop-shadow-[0_0_10px_rgba(160,220,255,0.55)]"
                      : "opacity-25 grayscale"
                  }`}
                  aria-hidden
                >
                  🧊
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-white/60 tabular-nums">
            {freezes} / {MAX_FREEZES} freezes
          </p>

          <button
            onClick={() => setMilestone(null)}
            className="mt-7 w-full inline-flex items-center justify-center gap-2 rounded-full bg-amber-300 px-6 py-3 text-sm font-medium text-black transition-all hover:bg-amber-200 hover:shadow-[0_0_30px_rgba(226,176,92,0.4)]"
          >
            Keep the rhythm →
          </button>
        </div>
      </div>
    </div>
  );
}
