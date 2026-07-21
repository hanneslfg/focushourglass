import { useEffect, useState } from "react";
import { X, ArrowRight, Check } from "lucide-react";

/**
 * Feature flag — keep FALSE in production until launch.
 */
export const ENABLE_PAYWALL = true;

type Plan = "monthly" | "yearly" | "lifetime";

interface PremiumPaywallProps {
  open?: boolean;
  onClose?: () => void;
  onUpgrade?: (plan: Plan) => void | Promise<void>;
  isLoading?: boolean;
}

type Step = 1 | 2 | 3;

export function PremiumPaywall({
  open = true,
  onClose,
  onUpgrade,
  isLoading = false,
}: PremiumPaywallProps) {
  const [step, setStep] = useState<Step>(1);
  const [plan, setPlan] = useState<Plan>("yearly");
  const [exitSheet, setExitSheet] = useState(false);
  const [exitOffered, setExitOffered] = useState(false);

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setStep(1);
      setExitSheet(false);
    }
  }, [open]);

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
        <div className="absolute top-6 right-6 z-10 flex items-center gap-1.5">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-[2px] transition-all duration-500 ${
                n === step ? "w-8 bg-[#E2B05C]" : n < step ? "w-4 bg-white/40" : "w-4 bg-white/15"
              }`}
            />
          ))}
        </div>

        {step === 1 && <Page1 onNext={() => setStep(2)} />}
        {step === 2 && <Page2 onNext={() => setStep(3)} />}
        {step === 3 && (
          <Page3
            plan={plan}
            setPlan={setPlan}
            onStart={() => onUpgrade?.(plan)}
            isLoading={isLoading}
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
                  onUpgrade?.(plan);
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
function Page3({
  plan,
  setPlan,
  onStart,
  isLoading,
}: {
  plan: "monthly" | "yearly";
  setPlan: (p: "monthly" | "yearly") => void;
  onStart: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="px-6 sm:px-10 pt-16 pb-8">
      <div className="text-center max-w-xl mx-auto">
        <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-white">
          Choose your focus plan.
        </h2>
        <p className="mt-2 text-sm text-white/55">Start your risk-free 7-day trial.</p>
      </div>

      {/* Cards */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto">
        <PlanCard
          selected={plan === "yearly"}
          onClick={() => setPlan("yearly")}
          badge="Best Value"
          title="Yearly Access"
          price="€39"
          sub="/ year"
          hint="Just €3.25 / month"
        />
        <PlanCard
          selected={plan === "monthly"}
          onClick={() => setPlan("monthly")}
          title="Monthly Access"
          price="€4.99"
          sub="/ month"
          hint="Flexible, cancel anytime"
        />
      </div>

      {/* Feature comparison */}
      <div className="mt-8 max-w-xl mx-auto rounded-xl border border-white/5 bg-white/[0.02] p-5">
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/45">
          Free tier includes
        </div>
        <p className="mt-2 text-[13px] text-white/65 leading-relaxed">
          Core productivity timer · App/Browser cloud sync · Daily streaks · Max. 3 active projects
        </p>

        <div className="mt-5 h-px bg-white/5" />

        <div className="mt-5 text-[10px] uppercase tracking-[0.28em] text-[#E2B05C]/80">
          Premium unlocks
        </div>
        <ul className="mt-3 space-y-2.5">
          {[
            ["⏳", "The Daily Focus Budget", "Full 3-hourglass visualization system for instant mental relief."],
            ["📂", "Unlimited projects & tags", "No artificial boundaries to limit your growth."],
            ["📊", "Deep analytics", "Unlimited historical data tracking and custom timeframes."],
            ["🎧", "Premium soundscapes", "High-quality white noise, ambient, binaural beats, and lofi tracks."],
            ["📩", "Weekly performance reports", "Automated focus insights delivered straight to your email."],
            ["📘", "Exclusive bonus", "The 4.5h Deep Focus Blueprint + implementation playbook."],
          ].map(([icon, title, body]) => (
            <li key={title} className="flex items-start gap-3 text-[13px] text-white/75">
              <span className="text-base leading-none mt-0.5" aria-hidden>{icon}</span>
              <span>
                <span className="text-white font-medium">{title}: </span>
                <span className="text-white/60">{body}</span>
              </span>
            </li>
          ))}
        </ul>
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
            <>Start free trial <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
        <p className="mt-2 text-center text-[11px] text-white/40">
          No commitment. Cancel anytime.
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
