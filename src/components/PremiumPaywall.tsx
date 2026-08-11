import { useEffect, useState } from "react";
import { X, ArrowRight, Check, RotateCcw } from "lucide-react";

/**
 * Feature flag — keep FALSE in production until launch.
 */
export const ENABLE_PAYWALL = true;

type Plan = "monthly" | "yearly" | "lifetime";

interface PremiumPaywallProps {
  open?: boolean;
  onClose?: () => void;
  onUpgrade?: (plan: Plan, trialDays?: number) => void | Promise<void>;
  isLoading?: boolean;
  onRestore?: () => void | Promise<void>;
  isRestoring?: boolean;
  /**
   * Post-challenge conversion mode: user has just cleared the 5-day
   * challenge. Skip the intro pages and land them directly on the plan
   * picker with a highlighted 14-day free trial.
   */
  postChallenge?: boolean;
}

type Step = 1 | 2 | 3;

export function PremiumPaywall({
  open = true,
  onClose,
  onUpgrade,
  isLoading = false,
  onRestore,
  isRestoring = false,
  postChallenge = false,
}: PremiumPaywallProps) {
  const [step, setStep] = useState<Step>(1);
  const [plan, setPlan] = useState<Plan>("yearly");
  const [exitSheet, setExitSheet] = useState(false);
  const [exitOffered, setExitOffered] = useState(false);

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setStep(postChallenge ? 3 : 1);
      setExitSheet(false);
      setExitOffered(postChallenge); // skip exit-intent when already at trial screen
    }
  }, [open, postChallenge]);

  if (!ENABLE_PAYWALL || !open) return null;

  function handleClose() {
    if (step === 3 && !exitOffered) {
      setExitSheet(true);
      setExitOffered(true);
      return;
    }
    onClose?.();
  }


  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      <div className="relative w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0A0A0A] shadow-2xl shadow-black/80">
        {/* Close */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 left-4 z-10 h-9 w-9 rounded-full border border-white/10 bg-black/40 text-white/60 hover:text-white hover:border-white/30 flex items-center justify-center transition"
          aria-label="Close"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>

        {/* Progress dots */}
        <div className="absolute top-5 right-6 z-10 flex items-center gap-1.5">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-[2px] transition-all duration-500 ${
                n === step ? "w-8 bg-[#E2B05C]" : n < step ? "w-4 bg-white/40" : "w-4 bg-white/15"
              }`}
            />
          ))}
        </div>

        {/* Restore purchases — below the progress bars, right aligned */}
        {onRestore && (
          <button
            type="button"
            onClick={() => void onRestore()}
            disabled={isRestoring}
            className="absolute top-9 right-6 z-10 inline-flex items-center gap-1.5 text-[11px] leading-none text-white/50 hover:text-white/85 disabled:opacity-40 transition-colors"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
            {isRestoring ? "Restoring…" : "Restore purchases"}
          </button>
        )}


        {step === 1 && <Page1 onNext={() => setStep(2)} />}
        {step === 2 && <Page2 onNext={() => setStep(3)} />}
        {step === 3 && (
          <Page3
            plan={plan}
            setPlan={setPlan}
            onStart={() => onUpgrade?.(plan, postChallenge ? 14 : 7)}
            isLoading={isLoading}
            postChallenge={postChallenge}
          />
        )}


        {/* Exit-intent sheet */}
        {exitSheet && (
          <div className="absolute inset-x-0 bottom-0 z-20 animate-in slide-in-from-bottom-8 duration-500">
            <div className="rounded-t-2xl border-t border-white/10 bg-[#0F0F0F] p-6 sm:p-8 shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.9)]">
              <h3 className="font-display text-2xl text-white tracking-tight">
                Give your brain a little more time.
              </h3>
              <p className="mt-3 text-sm text-white/60 leading-relaxed">
                Building lasting deep work habits takes time, and navigating your
                daily workload shouldn't feel rushed. If you are not quite ready
                to commit, we want to extend your trial period exclusively so you
                can experience the system completely stress-free.
              </p>
              <p className="mt-4 text-sm text-[#E2B05C]">
                Test Premium for <span className="font-semibold">14 days</span> instead of 7.
              </p>
              <button
                type="button"
                onClick={() => {
                  setExitSheet(false);
                  onUpgrade?.(plan, postChallenge ? 14 : 7);
                }}
                disabled={isLoading}
                className="mt-5 w-full h-12 rounded-xl font-semibold tracking-wide text-black bg-gradient-to-b from-[#F0C97A] to-[#C8933F] hover:from-[#F5D28A] hover:to-[#D19E4A] shadow-[0_10px_30px_-10px_rgba(226,176,92,0.6)] transition-all inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                Start 14-day free trial <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setExitSheet(false);
                  onClose?.();
                }}
                className="mt-3 w-full text-center text-[12px] text-white/45 hover:text-white/70 transition-colors"
              >
                No thanks, I'll stick to the free version
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── PAGE 1 ─────────────────────────── */
function Page1({ onNext }: { onNext: () => void }) {
  return (
    <div className="px-6 sm:px-10 pt-16 pb-8">
      <HourglassMark />

      <div className="mt-8 text-center max-w-xl mx-auto">
        <h2
          id="paywall-title"
          className="font-display text-3xl sm:text-4xl tracking-tight text-white leading-[1.1]"
        >
          Thinking about work 16 hours a day…
        </h2>
        <p className="mt-3 font-display text-xl sm:text-2xl text-[#E2B05C]/90 italic">
          …and getting absolutely nothing done?
        </p>
      </div>

      <div className="mt-8 max-w-xl mx-auto space-y-4 text-[13.5px] leading-relaxed text-white/70">
        <p>
          You know the cycle. You spend all day trapped in a loop of pseudo-working,
          procrastinating, and drowning in guilt. You're mentally exhausted because
          you've been stressing about your tasks since you woke up — yet you haven't
          actually moved the needle. This constant mental drag completely paralyzes
          your brain. When you spend your entire day under artificial pressure, you
          burn out before you even start.
        </p>
        <p className="text-white/85">
          Neuroscience shows that your brain only has a biological budget of{" "}
          <span className="text-[#E2B05C]">maximum 3 ultradian cycles (4.5 hours total)</span>{" "}
          for real, deep focus per day. Anything beyond that is a waste of willpower.
        </p>
        <p>
          With <span className="text-white">Hourglass Premium</span>, you break this
          loop. You shift from paralyzing passive pressure to raw, high-leverage
          execution. Activate your focus cycles, crush your 4.5 hours of deep work,
          and completely shut off for the day. <span className="text-white">Zero guilt.</span>
        </p>
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white px-6 py-3 text-sm font-medium text-black transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:scale-[1.02]"
        >
          See how it works <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── PAGE 2 ─────────────────────────── */
function Page2({ onNext }: { onNext: () => void }) {
  const steps = [
    {
      when: "Today",
      title: "Unlock Hourglass Premium",
      body:
        "Get immediate access to your interactive Daily Focus Budget system, unlimited projects, and premium themes like Obsidian. Secure your trial now for €0.00.",
    },
    {
      when: "Day 5",
      title: "Trial reminder",
      body:
        "We'll send a push notification to your device before your trial period rolls over. You retain complete flexibility to decide if you want to stay.",
    },
    {
      when: "Day 7",
      title: "Trial ends",
      body:
        "Only now does your selected plan activate. You can cancel anytime with a single click directly inside your app settings.",
    },
  ];

  return (
    <div className="px-6 sm:px-10 pt-16 pb-8">
      <div className="text-center max-w-xl mx-auto">
        <div className="text-[10px] uppercase tracking-[0.3em] text-[#E2B05C]/80">
          7-Day Free Trial
        </div>
        <h2 className="font-display text-3xl sm:text-4xl tracking-tight mt-3 text-white">
          Full control. Zero risk.
        </h2>
      </div>

      <div className="relative mt-12 max-w-lg mx-auto pl-10">
        {/* vertical line */}
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-[#E2B05C]/60 via-white/15 to-transparent" />

        <ol className="space-y-8">
          {steps.map((s, i) => (
            <li key={s.when} className="relative">
              <span
                className={`absolute -left-[30px] top-1 h-3 w-3 rounded-full border-2 ${
                  i === 0
                    ? "border-[#E2B05C] bg-[#E2B05C] shadow-[0_0_16px_rgba(226,176,92,0.7)]"
                    : "border-white/30 bg-[#0A0A0A]"
                }`}
              />
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#E2B05C]/70">
                {s.when}
              </div>
              <div className="mt-1 font-display text-lg text-white">{s.title}</div>
              <p className="mt-1.5 text-[13px] text-white/60 leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white px-6 py-3 text-sm font-medium text-black transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:scale-[1.02]"
        >
          Go to plans <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── PAGE 3 ─────────────────────────── */
const PLANS: Array<{
  id: Plan;
  title: string;
  price: string;
  sub: string;
  hint: string;
  badge?: string;
}> = [
  {
    id: "yearly",
    title: "Yearly",
    price: "€39",
    sub: "/ year",
    hint: "€3.25/mo · Save 35%",
    badge: "Best Value",
  },
  {
    id: "monthly",
    title: "Monthly",
    price: "€4.99",
    sub: "/ month",
    hint: "Flexible, cancel anytime",
  },
  {
    id: "lifetime",
    title: "Lifetime",
    price: "€102",
    sub: "one-time",
    hint: "Pay once. Yours forever.",
  },
];

const COMPARISON: Array<{ feature: string; free: string; premium: string }> = [
  { feature: "Pricing", free: "€0.00", premium: "€4.99/mo · €39/yr · €102 lifetime" },
  { feature: "Core productivity timer", free: "yes", premium: "yes" },
  { feature: "Seamless cloud sync (Web & Mobile)", free: "yes", premium: "yes" },
  { feature: "Daily focus streaks", free: "yes", premium: "yes" },
  { feature: "Active projects & tags", free: "Up to 3 projects", premium: "Unlimited" },
  {
    feature: "Daily Focus Budget (3-Hourglass system)",
    free: "Standard time tracking",
    premium: "Full system unlocked",
  },
  {
    feature: "Focus Calibration Protocol (Huberman-inspired)",
    free: "no",
    premium: "Prime your neural circuits before every block",
  },
  {
    feature: "Memento Mori Timer (Unpausable Life Countdown)",
    free: "no",
    premium: "Live countdown of your remaining time",
  },

  {
    feature: "Analytics & historical data",
    free: "Week / Month",
    premium: "Lifetime + custom timeframes",
  },
  { feature: "Weekly performance reports", free: "no", premium: "Automated insights to inbox" },
  {
    feature: "Curated audio soundscapes",
    free: "Basic audio",
    premium: "Brown noise · Binaural · Lofi · Ambient",
  },
  { feature: "Exclusive VIP bonus", free: "no", premium: "4.5h Deep Focus Blueprint" },
];

/**
 * Canonical premium benefit list, derived from the paywall comparison table so
 * every surface (paywall + "Premium Member" modal) always shows identical copy.
 */
export const PREMIUM_BENEFITS: string[] = COMPARISON.filter(
  (r) => r.feature !== "Pricing" && r.premium !== "no" && r.premium !== r.free,
).map((r) => (r.premium === "yes" ? r.feature : `${r.feature} — ${r.premium}`));

function Cell({ value, premium = false }: { value: string; premium?: boolean }) {
  if (value === "yes") {
    return (
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
          premium ? "bg-[#E2B05C] text-black" : "bg-white/10 text-white/80"
        }`}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }
  if (value === "no") {
    return <span className="text-white/25">—</span>;
  }
  return (
    <span className={premium ? "text-white/85" : "text-white/55"}>
      {value}
    </span>
  );
}

function Page3({
  plan,
  setPlan,
  onStart,
  isLoading,
  postChallenge = false,
}: {
  plan: Plan;
  setPlan: (p: Plan) => void;
  onStart: () => void;
  isLoading: boolean;
  postChallenge?: boolean;
}) {
  const trialDays = postChallenge ? 14 : 7;
  const ctaLabel =
    plan === "lifetime"
      ? "Get Lifetime Access"
      : `Start ${trialDays}-Day Free Trial`;

  return (
    <div className="px-6 sm:px-10 pt-16 pb-8">
      <div className="text-center max-w-xl mx-auto">
        {postChallenge && (
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E2B05C]/40 bg-[#E2B05C]/[0.08] px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-[#E2B05C]">
            🎉 Challenge Reward · 14-Day Trial Unlocked
          </div>
        )}
        <h2 className="mt-3 font-display text-3xl sm:text-4xl tracking-tight text-white">
          {postChallenge ? "You earned this. Claim your 14 days." : "Choose your focus plan."}
        </h2>
        <p className="mt-2 text-sm text-white/55">
          {postChallenge
            ? "Full Premium access for 14 days. No commitment. Cancel anytime."
            : "Risk-free 7-day trial on subscriptions. Lifetime is a one-time purchase."}
        </p>
      </div>



      {/* Plan cards */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
        {PLANS.map((p) => (
          <PlanCard
            key={p.id}
            selected={plan === p.id}
            onClick={() => setPlan(p.id)}
            badge={p.badge}
            title={p.title}
            price={p.price}
            sub={p.sub}
            hint={p.hint}
          />
        ))}
      </div>

      {/* Comparison table */}
      <div className="mt-8 max-w-2xl mx-auto rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-white/5">
                <th className="py-3 px-4 font-normal text-[10px] uppercase tracking-[0.24em] text-white/40">
                  Feature
                </th>
                <th className="py-3 px-4 font-normal text-[10px] uppercase tracking-[0.24em] text-white/40">
                  Free
                </th>
                <th className="py-3 px-4 font-normal text-[10px] uppercase tracking-[0.24em] text-[#E2B05C] bg-[#E2B05C]/[0.05] border-l border-r border-[#E2B05C]/25">
                  Premium
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr
                  key={row.feature}
                  className={i !== COMPARISON.length - 1 ? "border-b border-white/[0.04]" : ""}
                >
                  <td className="py-2.5 px-4 text-white/70">{row.feature}</td>
                  <td className="py-2.5 px-4">
                    <Cell value={row.free} />
                  </td>
                  <td className="py-2.5 px-4 bg-[#E2B05C]/[0.04] border-l border-r border-[#E2B05C]/20">
                    <Cell value={row.premium} premium />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-8 max-w-xl mx-auto">
        <button
          type="button"
          onClick={onStart}
          disabled={isLoading}
          className="w-full h-13 py-3.5 rounded-xl font-semibold tracking-wide text-black bg-gradient-to-b from-[#F0C97A] to-[#C8933F] hover:from-[#F5D28A] hover:to-[#D19E4A] shadow-[0_10px_30px_-10px_rgba(226,176,92,0.6)] transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {isLoading ? "Redirecting to Stripe…" : (
            <>{ctaLabel} <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
        <p className="mt-2 text-center text-[11px] text-white/40">
          {plan === "lifetime"
            ? "One-time payment. No subscription. Lifetime updates."
            : "No commitment. Cancel anytime."}
        </p>
      </div>
    </div>
  );
}

function PlanCard({
  selected,
  onClick,
  badge,
  title,
  price,
  sub,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  badge?: string;
  title: string;
  price: string;
  sub: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`relative text-left rounded-xl border p-5 transition-all ${
        selected
          ? "border-[#E2B05C] bg-[#E2B05C]/[0.06] shadow-[0_0_30px_-12px_rgba(226,176,92,0.7)]"
          : "border-white/10 bg-white/[0.02] hover:border-white/25"
      }`}
    >
      {badge && (
        <span className="absolute -top-2.5 right-4 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.22em] bg-[#E2B05C] text-black font-semibold">
          {badge}
        </span>
      )}
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/55">
          {title}
        </div>
        {selected && (
          <span className="h-5 w-5 rounded-full bg-[#E2B05C] text-black flex items-center justify-center">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-display text-3xl tabular-nums text-white">{price}</span>
        <span className="text-xs text-white/50">{sub}</span>
      </div>
      <div className="mt-1 text-[11px] text-white/45">{hint}</div>
    </button>
  );
}

/* Subtle top hourglass mark with drifting sand */
function HourglassMark() {
  return (
    <div className="flex justify-center">
      <svg
        viewBox="0 0 60 80"
        className="h-14 w-auto text-[#E2B05C]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        aria-hidden
      >
        <path d="M12 6 h36 M12 74 h36" strokeLinecap="round" />
        <path d="M14 6 C14 26, 46 30, 46 40 C46 50, 14 54, 14 74" opacity="0.55" />
        <path d="M46 6 C46 26, 14 30, 14 40 C14 50, 46 54, 46 74" opacity="0.55" />
        {/* upper sand */}
        <path d="M17 10 L43 10 C41 22, 34 28, 30 30 C26 28, 19 22, 17 10 Z" fill="currentColor" opacity="0.85">
          <animate attributeName="opacity" values="0.9;0.55;0.9" dur="6s" repeatCount="indefinite" />
        </path>
        {/* falling stream */}
        <line x1="30" y1="30" x2="30" y2="52" stroke="currentColor" strokeWidth="0.6" opacity="0.6">
          <animate attributeName="opacity" values="0.3;0.9;0.3" dur="1.6s" repeatCount="indefinite" />
        </line>
        {/* lower sand */}
        <path d="M18 70 L42 70 C40 62, 34 56, 30 55 C26 56, 20 62, 18 70 Z" fill="currentColor" opacity="0.7">
          <animate attributeName="opacity" values="0.5;0.85;0.5" dur="6s" repeatCount="indefinite" />
        </path>
      </svg>
    </div>
  );
}

export default PremiumPaywall;
