import { useEffect, useState } from "react";
import { getDailyStreak } from "@/lib/streaks";
import { getSessions, dayKey } from "@/lib/sessions";
import { safeStorage } from "@/lib/safeStorage";
import { usePremium } from "@/lib/premium";

const SEEN_KEY = "hourglass_day5_reward_seen";

function completedTodaySessionCount(): number {
  const today = dayKey(new Date());
  return getSessions().filter(
    (s) => s.completedAt?.slice(0, 10) === today && (s.focusedMinutes ?? 0) > 0,
  ).length;
}

/**
 * Watches for the "earned trial" trigger: user has hit a 5-day streak AND
 * completed at least one session today. Shows a celebratory modal once,
 * then opens the paywall with the 14-day unlocked trial.
 */
export function Day5RewardOverlay() {
  const { isPremium, triggerPaywall } = usePremium();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isPremium) return;
    if (safeStorage.getItem(SEEN_KEY) === "true") return;

    const check = () => {
      const streak = getDailyStreak();
      if (streak >= 5 && completedTodaySessionCount() >= 1) {
        setOpen(true);
      }
    };
    check();
    window.addEventListener("hourglass:sessions", check);
    return () => window.removeEventListener("hourglass:sessions", check);
  }, [isPremium]);

  function claim() {
    safeStorage.setItem(SEEN_KEY, "true");
    setOpen(false);
    // Route directly into the 14-day trial screen — bypass generic paywall
    // intro since the user has already been "sold" by clearing the challenge.
    setTimeout(() => triggerPaywall({ postChallenge: true }), 220);
  }


  function dismiss() {
    safeStorage.setItem(SEEN_KEY, "true");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center px-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-500"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-300/40 bg-gradient-to-b from-neutral-950 to-black px-8 py-10 text-center shadow-[0_40px_120px_-20px_rgba(226,176,92,0.35)]">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full bg-amber-300/[0.12] blur-3xl" />
        <div className="relative">
          <div className="text-5xl mb-4">🎉</div>
          <h3
            className="text-3xl font-light tracking-tight text-white leading-tight"
            style={{ fontFamily: '"Cormorant Garamond", serif' }}
          >
            Challenge Completed!
          </h3>
          <p className="mt-4 text-sm text-white/70 leading-relaxed">
            You earned{" "}
            <span className="text-amber-300 font-medium">14 Days of Premium Access</span>
            . Cancel anytime with 1 click directly inside app settings.
          </p>
          <button
            onClick={claim}
            className="mt-7 w-full inline-flex items-center justify-center gap-2 rounded-full bg-amber-300 px-6 py-3 text-sm font-medium text-black transition-all hover:bg-amber-200 hover:shadow-[0_0_30px_rgba(226,176,92,0.4)]"
          >
            Claim 14-Day Premium →
          </button>
          <button
            onClick={dismiss}
            className="mt-3 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
