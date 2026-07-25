import { useEffect } from "react";
import { X } from "lucide-react";
import { getFreezeCount, MAX_FREEZES } from "@/lib/streakFreezes";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NeverMissTwiceModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const freezes = getFreezeCount();

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center px-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-950 to-black px-8 py-9 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 h-8 w-8 rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30 flex items-center justify-center transition"
          aria-label="Close"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full bg-amber-300/[0.08] blur-3xl" />
        <div className="relative text-center">
          <div className="text-4xl mb-3">🛡️</div>
          <h3
            className="text-2xl font-light tracking-tight text-white leading-tight"
            style={{ fontFamily: '"Cormorant Garamond", serif' }}
          >
            The "Never Miss Twice" Rule
          </h3>
          <p className="mt-4 text-sm text-white/70 leading-relaxed">
            Missing one day won't break your momentum—life happens. The key to
            long-term success is to never miss two days in a row. Your Streak
            Freezes automatically protect your hard-earned progress when you
            miss a day.
          </p>

          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
              Available Freezes
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
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
              {freezes} / {MAX_FREEZES}
            </p>
          </div>

          <p className="mt-5 text-[11px] text-white/40 leading-relaxed">
            Earn +1 freeze at every milestone: 5, 15, 50, 100, 200, 300 …
            Freezes cap at {MAX_FREEZES}.
          </p>
        </div>
      </div>
    </div>
  );
}
