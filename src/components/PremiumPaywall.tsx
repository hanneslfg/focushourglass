import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";

/**
 * Feature flag — keep FALSE in production until launch.
 * When true, `<PremiumPaywall />` renders. When false, the component
 * short-circuits to null and nothing ships to users.
 */
export const ENABLE_PAYWALL = true;

type Plan = "monthly" | "yearly" | "lifetime";

interface PremiumPaywallProps {
  open?: boolean;
  onClose?: () => void;
  onUpgrade?: (plan: Plan) => void | Promise<void>;
  isLoading?: boolean;
}

const FREE_FEATURES = [
  "Productivity timer",
  "Sync from App / Browser",
  "Daily streaks",
  "Up to 5 projects",
];

const PREMIUM_FEATURES = [
  "Unlimited projects",
  "Weekly report via Mail",
  "Unlimited data history",
  "Built-in White Noise generator",
  "Exclusive: 2h full guide to insane focus (worth 249 €)",
];

const PLANS: Record<
  Plan,
  {
    label: string;
    price: string;
    sub: string;
    badge?: string;
  }
> = {
  monthly: {
    label: "Monthly",
    price: "4,99 €",
    sub: "/ Monat",
  },
  yearly: {
    label: "Yearly",
    price: "39 €",
    sub: "/ Jahr · 3,30 € / Monat — Save 33%",
    badge: "Best Value",
  },
  lifetime: {
    label: "Lifetime",
    price: "102 €",
    sub: "One-time payment — Keep forever",
  },
};

export function PremiumPaywall({
  open = true,
  onClose,
  onUpgrade,
  isLoading = false,
}: PremiumPaywallProps) {
  const [plan, setPlan] = useState<Plan>("yearly");

  if (!ENABLE_PAYWALL) return null;
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0B0B0B] shadow-2xl shadow-black/80">
        {/* Close */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 h-9 w-9 rounded-full border border-white/10 bg-black/40 text-white/60 hover:text-white hover:border-white/30 flex items-center justify-center transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}

        <div className="px-6 sm:px-10 pt-10 pb-8">
          {/* Header */}
          <div className="text-center max-w-xl mx-auto">
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.28em] text-[#E2B05C]/80">
              <Sparkles className="h-3 w-3" strokeWidth={1.75} />
              Hourglass Premium
            </div>
            <h2
              id="paywall-title"
              className="font-display text-3xl sm:text-4xl tracking-tight mt-3 text-white"
            >
              Unlock Unlimited Focus
            </h2>
            <p className="mt-3 text-sm text-white/60 leading-relaxed">
              We believe in building an amazing product even in the free
              version. Free features will stay free forever. Upgrade only when
              you are ready to go unlimited.
            </p>
          </div>

          {/* Tiers */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* FREE */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-lg text-white/90">Free</h3>
                <div className="font-display text-2xl tabular-nums text-white/70">
                  0 €
                </div>
              </div>
              <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-white/40">
                Forever free
              </p>
              <ul className="mt-5 space-y-2.5">
                {FREE_FEATURES.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2.5 text-sm text-white/70"
                  >
                    <Check
                      className="h-4 w-4 mt-0.5 text-white/40 shrink-0"
                      strokeWidth={1.75}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* PREMIUM */}
            <div className="relative rounded-xl p-[1px] bg-gradient-to-b from-[#E2B05C]/60 via-[#E2B05C]/20 to-[#E2B05C]/40 shadow-[0_0_40px_-10px_rgba(226,176,92,0.35)]">
              <div className="rounded-[11px] bg-[#0F0F0F] p-5 h-full">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-lg text-[#E2B05C]">
                    Hourglass Premium
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.22em] bg-[#E2B05C] text-black font-semibold">
                    Best Value
                  </span>
                </div>
                <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-[#E2B05C]/70">
                  Everything in Free, plus:
                </p>
                <ul className="mt-5 space-y-2.5">
                  {PREMIUM_FEATURES.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-sm text-white/85"
                    >
                      <Check
                        className="h-4 w-4 mt-0.5 text-[#E2B05C] shrink-0"
                        strokeWidth={2}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Plan selector */}
          <div className="mt-8">
            <div className="text-[10px] uppercase tracking-[0.28em] text-white/40 text-center">
              Choose your plan
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(PLANS) as Plan[]).map((k) => {
                const p = PLANS[k];
                const selected = plan === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPlan(k)}
                    className={`relative text-left rounded-xl border p-4 transition-all ${
                      selected
                        ? "border-[#E2B05C] bg-[#E2B05C]/[0.06] shadow-[0_0_24px_-12px_rgba(226,176,92,0.6)]"
                        : "border-white/10 bg-white/[0.02] hover:border-white/25"
                    }`}
                    aria-pressed={selected}
                  >
                    {p.badge && (
                      <span className="absolute -top-2 right-3 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.22em] bg-[#E2B05C] text-black font-semibold">
                        {p.badge}
                      </span>
                    )}
                    <div className="text-[10px] uppercase tracking-[0.24em] text-white/50">
                      {p.label}
                    </div>
                    <div className="mt-1.5 font-display text-2xl tabular-nums text-white">
                      {p.price}
                    </div>
                    <div className="mt-1 text-[11px] text-white/55 leading-snug">
                      {p.sub}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => onUpgrade?.(plan)}
              className="mt-5 w-full h-12 rounded-xl font-semibold tracking-wide text-black bg-gradient-to-b from-[#F0C97A] to-[#C8933F] hover:from-[#F5D28A] hover:to-[#D19E4A] shadow-[0_10px_30px_-10px_rgba(226,176,92,0.6)] transition-all active:scale-[0.99]"
            >
              Upgrade to Premium
            </button>
            <p className="mt-2 text-center text-[10px] uppercase tracking-[0.24em] text-white/35">
              Cancel anytime · Secure checkout
            </p>
          </div>

          {/* Founder note */}
          <div className="mt-8 pt-6 border-t border-white/5">
            <p className="text-xs text-white/55 leading-relaxed italic text-center max-w-xl mx-auto">
              &ldquo;My goal is not to get rich with Hourglass, but to sustain
              server costs, pay myself a fair wage, and keep building the
              ultimate distraction-free space for you. Thank you for your
              support.&rdquo;
              <span className="not-italic block mt-2 text-white/70">
                — Hannes
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PremiumPaywall;
