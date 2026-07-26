import { useEffect, useMemo, useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { getSessions, dayKey, type Session } from "@/lib/sessions";
import { usePremium } from "@/lib/premium";

const BLOCK_MIN = 90;
const BLOCKS = 3;
const TOTAL_MIN = BLOCK_MIN * BLOCKS; // 270

interface MiniHourglassProps {
  /** 0..1 fill for this slot */
  fill: number;
  complete: boolean;
  muted?: boolean;
}

function MiniHourglass({ fill, complete, muted }: MiniHourglassProps) {
  const p = Math.max(0, Math.min(1, fill));
  // Top chamber empties as p grows; bottom fills.
  const topFillY = 8 + (34 - 8) * p; // sand top surface descends
  const bottomFillY = 62 - (62 - 40) * p; // sand top surface in bottom rises
  const stroke = muted ? "currentColor" : "currentColor";

  return (
    <svg
      viewBox="0 0 48 72"
      className={`h-12 w-8 md:h-14 md:w-10 transition-all duration-700 ${
        complete ? "text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" : muted ? "text-muted-foreground/40" : "text-foreground/70"
      }`}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`mh-top-${fill.toFixed(3)}`}>
          <polygon points="8,8 40,8 26,36 22,36" />
        </clipPath>
        <clipPath id={`mh-bot-${fill.toFixed(3)}`}>
          <polygon points="22,38 26,38 40,64 8,64" />
        </clipPath>
        <linearGradient id={`mh-sand-${fill.toFixed(3)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.88 0.14 80)" />
          <stop offset="100%" stopColor="oklch(0.72 0.16 65)" />
        </linearGradient>
      </defs>
      {/* Caps */}
      <line x1="6" y1="6" x2="42" y2="6" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      <line x1="6" y1="66" x2="42" y2="66" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      {/* Sand */}
      {p > 0 && (
        <>
          <g clipPath={`url(#mh-top-${fill.toFixed(3)})`}>
            <rect x="0" y={topFillY} width="48" height="40" fill={`url(#mh-sand-${fill.toFixed(3)})`} />
          </g>
          <g clipPath={`url(#mh-bot-${fill.toFixed(3)})`}>
            <rect x="0" y={bottomFillY} width="48" height="40" fill={`url(#mh-sand-${fill.toFixed(3)})`} />
          </g>
        </>
      )}
      {/* Outline */}
      <polygon
        points="8,8 40,8 26,36 26,38 40,64 8,64 22,38 22,36"
        fill="none"
        stroke={stroke}
        strokeWidth="1"
        strokeLinejoin="round"
        opacity="0.6"
      />
    </svg>
  );
}

function todaysFocusedMinutes(sessions: Session[]): number {
  const today = dayKey(new Date());
  let total = 0;
  for (const s of sessions) {
    if (!s.completedAt) continue;
    if (s.completedAt.slice(0, 10) !== today) continue;
    total += Math.max(0, s.focusedMinutes || 0);
  }
  return total;
}

export function DailyFocusBudget() {
  const { isPremium, triggerPaywall } = usePremium();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [mounted, setMounted] = useState(false);
  const [celebrated, setCelebrated] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showScience, setShowScience] = useState(false);

  useEffect(() => {
    setMounted(true);
    const sync = () => setSessions(getSessions());
    sync();
    window.addEventListener("hourglass:sessions", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hourglass:sessions", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const focused = useMemo(() => todaysFocusedMinutes(sessions), [sessions]);
  const capped = Math.min(focused, TOTAL_MIN);
  const slots = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < BLOCKS; i++) {
      const start = i * BLOCK_MIN;
      const raw = Math.max(0, Math.min(BLOCK_MIN, capped - start));
      arr.push(raw / BLOCK_MIN);
    }
    return arr;
  }, [capped]);

  const cleared = focused >= TOTAL_MIN;

  useEffect(() => {
    if (!mounted) return;
    if (cleared && !celebrated) {
      setCelebrated(true);
      setShowModal(true);
    }
    if (!cleared && celebrated) {
      // reset for next day
      setCelebrated(false);
    }
  }, [cleared, celebrated, mounted]);

  const hoursLabel = `${(capped / 60).toFixed(1)} / 4.5 hrs`;
  const minLabel = `${capped} / ${TOTAL_MIN} min`;

  return (
    <div className="w-full max-w-md">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShowScience(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowScience(true);
          }
        }}
        className={`cursor-pointer relative rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md px-4 py-3 md:px-5 md:py-4 transition-all hover:border-white/[0.12] hover:bg-white/[0.04] ${
          cleared ? "ring-1 ring-amber-300/40" : ""
        }`}
        aria-label="Learn about the 4.5h daily focus limit"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Daily Focus Budget
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 inline-flex items-center gap-1">
            Ultradian · 3 × 90m
            <span className="ml-1 text-muted-foreground/60">ⓘ</span>
          </span>
        </div>

        <div className={`relative ${!isPremium ? "select-none" : ""}`}>
          <div
            className={`flex items-end justify-center gap-6 md:gap-8 py-2 ${
              !isPremium ? "blur-sm opacity-60 pointer-events-none" : ""
            }`}
            aria-hidden={!isPremium}
          >
            {slots.map((f, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <MiniHourglass fill={f} complete={f >= 1} muted={f === 0} />
                <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60 tabular-nums">
                  {Math.round(f * BLOCK_MIN)}m
                </span>
              </div>
            ))}
          </div>

          <div
            className={`mt-1 flex items-center justify-center gap-2 text-xs tabular-nums ${
              cleared ? "text-amber-300" : "text-muted-foreground"
            } ${!isPremium ? "blur-sm opacity-60" : ""}`}
          >
            <span>{minLabel}</span>
            <span className="opacity-40">·</span>
            <span>{hoursLabel}</span>
          </div>

          {!isPremium && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                triggerPaywall();
              }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg group"
            >
              <div className="flex items-center gap-1.5 rounded-full bg-background/70 backdrop-blur-md px-3 py-1.5 border border-white/10">
                <Lock className="h-3 w-3 text-amber-300" strokeWidth={2} />
                <span className="text-[11px] text-foreground/90">
                  Unlock Daily Focus Budget
                </span>
                <Sparkles className="h-3 w-3 text-amber-300" strokeWidth={2} />
              </div>
              <span className="text-[10px] text-muted-foreground/80 group-hover:text-foreground/70 transition-colors">
                Premium feature
              </span>
            </button>
          )}
        </div>

        {isPremium && cleared && (
          <div className="mt-2 text-center text-[11px] text-amber-300/90 tracking-wide">
            Biological Peak Reached · Feierabend
          </div>
        )}
      </div>

      {showModal && isPremium && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4 animate-in fade-in"
          onClick={() => setShowModal(false)}
        >
          <div
            className="max-w-sm w-full rounded-2xl border border-amber-300/30 bg-card p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <MiniHourglass key={i} fill={1} complete />
              ))}
            </div>
            <h3 className="font-display text-2xl text-foreground mb-2">
              Daily Focus Budget Cleared ⏳
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your brain has reached its peak deep work capacity for today.
              Prioritize sleep and recovery to maintain consistency tomorrow.
            </p>
            <button
              onClick={() => setShowModal(false)}
              className="mt-5 px-5 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Feierabend
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
