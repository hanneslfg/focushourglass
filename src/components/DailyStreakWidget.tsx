import { useEffect, useMemo, useState } from "react";
import { Flame } from "lucide-react";
import { getDailyStreak } from "@/lib/streaks";
import {
  getFreezeCount,
  getNextMilestone,
  getPreviousMilestone,
  MAX_FREEZES,
} from "@/lib/streakFreezes";
import { usePremium } from "@/lib/premium";
import { NeverMissTwiceModal } from "./NeverMissTwiceModal";


const CHALLENGE_DAYS = 5;

/**
 * Prominent daily streak + 5-day challenge progress widget.
 * Sits at the top of the right sidebar for maximum visibility.
 * Click opens the "Never Miss Twice" explanation modal.
 */
export function DailyStreakWidget() {

  const { isPremium } = usePremium();
  const [streak, setStreak] = useState(0);
  const [freezes, setFreezes] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);


  useEffect(() => {
    setMounted(true);
    const sync = () => {
      setStreak(getDailyStreak());
      setFreezes(getFreezeCount());
    };
    sync();
    window.addEventListener("hourglass:sessions", sync);
    window.addEventListener("hourglass:freezes", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hourglass:sessions", sync);
      window.removeEventListener("hourglass:freezes", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const challengeDay = Math.min(streak, CHALLENGE_DAYS);
  const pct = (challengeDay / CHALLENGE_DAYS) * 100;
  const remaining = Math.max(0, CHALLENGE_DAYS - streak);
  const completed = streak >= CHALLENGE_DAYS;

  const size = 148;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = useMemo(() => circ * (1 - pct / 100), [circ, pct]);

  // Milestone progression (shown once the 5-day challenge is cleared).
  const nextMilestone = getNextMilestone(streak);
  const prevMilestone = getPreviousMilestone(streak);
  const milestonePct = nextMilestone
    ? Math.min(
        100,
        Math.max(
          0,
          ((streak - prevMilestone) / (nextMilestone - prevMilestone)) * 100,
        ),
      )
    : 100;

  return (
    <>
      <button
        type="button"
        onClick={() => setExplainOpen(true)}
        className={`relative w-full text-left rounded-2xl border px-5 py-5 overflow-hidden transition-all hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 ${
          completed
            ? "border-amber-300/40 bg-gradient-to-b from-amber-300/[0.06] to-transparent"
            : "border-white/10 bg-white/[0.02]"
        }`}
        aria-label="Daily focus streak — open the Never Miss Twice guide"
      >
        {streak > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-amber-300/10 blur-3xl"
          />
        )}

        <div className="relative flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground mb-3">
            Daily Focus Streak
          </div>

          <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke="currentColor"
                strokeWidth={stroke}
                fill="none"
                className="text-white/[0.06]"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke="url(#streakGrad)"
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={mounted ? offset : circ}
                style={{ transition: "stroke-dashoffset 900ms ease-out" }}
              />
              <defs>
                <linearGradient id="streakGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#F5C368" />
                  <stop offset="100%" stopColor="#E2B05C" />
                </linearGradient>
              </defs>
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Flame
                className={`h-6 w-6 mb-0.5 ${
                  streak > 0
                    ? "text-amber-300 drop-shadow-[0_0_10px_rgba(226,176,92,0.75)] animate-pulse"
                    : "text-muted-foreground/40"
                }`}
                strokeWidth={1.6}
                fill={streak > 0 ? "currentColor" : "none"}
                style={streak > 0 ? { fillOpacity: 0.25 } : undefined}
              />
              <div className="font-display text-4xl tabular-nums tracking-tight text-foreground leading-none">
                {streak}
              </div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.24em] text-muted-foreground">
                {streak === 1 ? "Day" : "Days"}
              </div>
            </div>
          </div>

          {/* Challenge status — hidden for Premium subscribers (they already
              have the reward the challenge unlocks). */}
          {!isPremium && (
            <div className="mt-4 w-full text-center">
              {completed ? (
                <div className="text-[11px] text-amber-300">
                  🎉 Challenge Cleared · 14-Day Premium Unlocked
                </div>
              ) : streak === 0 ? (
                <div className="text-[11px] text-muted-foreground">
                  Start today · Day 1 of 5
                </div>
              ) : (
                <div className="text-[11px] text-foreground/75">
                  Day <span className="text-amber-300 font-medium">{challengeDay}</span> of {CHALLENGE_DAYS}
                  <span className="text-muted-foreground">
                    {" · "}
                    {remaining} day{remaining === 1 ? "" : "s"} until 14-Day Premium Reward
                  </span>
                </div>
              )}

              <div className="mt-3 flex items-center justify-center gap-1.5">
                {Array.from({ length: CHALLENGE_DAYS }).map((_, i) => {
                  const filled = i < challengeDay;
                  return (
                    <span
                      key={i}
                      className={`h-1.5 flex-1 max-w-[36px] rounded-full transition-all duration-500 ${
                        filled
                          ? "bg-amber-300 shadow-[0_0_8px_rgba(226,176,92,0.55)]"
                          : "bg-white/[0.08]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          )}


          {/* Milestone progression + freezes */}
          <div className="mt-5 w-full">
            <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              <span>
                Next Milestone
                {nextMilestone ? (
                  <span className="ml-1 text-foreground/80 tabular-nums">
                    {streak}/{nextMilestone}
                  </span>
                ) : (
                  <span className="ml-1 text-amber-300">Legend</span>
                )}
              </span>
              <span
                className="inline-flex items-center gap-1 text-foreground/80 tabular-nums"
                title="Streak Freezes"
              >
                🧊 {freezes}/{MAX_FREEZES}
              </span>
            </div>
            <div className="mt-1.5 h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-300 to-amber-500 transition-all duration-700"
                style={{ width: `${milestonePct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
              Tap for the "Never Miss Twice" rule
            </p>
          </div>
        </div>
      </button>

      <NeverMissTwiceModal open={explainOpen} onClose={() => setExplainOpen(false)} />
    </>
  );
}
