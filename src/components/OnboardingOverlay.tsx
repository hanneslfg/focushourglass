import { useEffect, useState } from "react";
import { supabase, signInWithGoogle } from "@/lib/supabase";
import { safeStorage } from "@/lib/safeStorage";

const STORAGE_KEY = "hourglass_onboarding_completed";

const slides = [
  {
    eyebrow: "Welcome",
    title: "Welcome to Hourglass",
    body: "Flip the glass, enter the flow state.",
  },
  {
    eyebrow: "Organize",
    title: "Set your intention",
    body: "Create a project and define your goals before you start.",
  },
  {
    eyebrow: "Focus",
    title: "Execute",
    body: "Start the timer. No distractions, just execution.",
  },
];

export function OnboardingOverlay() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (safeStorage.getItem(STORAGE_KEY) === "true") return;
      const { data } = await supabase.auth.getSession();
      const meta = data.session?.user?.user_metadata as
        | { has_completed_onboarding?: boolean }
        | undefined;
      if (meta?.has_completed_onboarding) {
        safeStorage.setItem(STORAGE_KEY, "true");
        return;
      }
      if (!cancelled) setOpen(true);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function complete() {
    safeStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await supabase.auth.updateUser({
          data: { has_completed_onboarding: true },
        });
      }
    } catch (e) {
      console.warn("[onboarding] updateUser failed:", e);
    }
  }

  if (!open) return null;

  const s = slides[step];
  const isLast = step === slides.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xl animate-in fade-in duration-500">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-950/95 to-black/95 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]">
        {/* subtle top glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full bg-white/[0.04] blur-3xl" />

        <div className="relative px-10 pt-14 pb-8">
          <div key={step} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">
              {s.eyebrow}
            </p>
            <h2
              className="mt-4 text-3xl font-light tracking-tight text-white"
              style={{ fontFamily: '"Cormorant Garamond", serif' }}
            >
              {s.title}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/60">{s.body}</p>
          </div>

          {/* progress dots */}
          <div className="mt-10 flex items-center gap-1.5">
            {slides.map((_, i) => (
              <span
                key={i}
                className={`h-[2px] transition-all duration-500 ${
                  i === step ? "w-8 bg-white/80" : "w-4 bg-white/15"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative flex items-end justify-between gap-6 border-t border-white/5 bg-black/40 px-10 py-6">
          {/* Google sign-in CTA (bottom-left) */}
          <button
            onClick={() => {
              void signInWithGoogle();
            }}
            className="group flex max-w-[62%] items-start gap-3 text-left"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] transition-colors group-hover:border-white/25 group-hover:bg-white/[0.06]">
              <GoogleIcon />
            </span>
            <span className="text-[11px] leading-snug text-white/45 transition-colors group-hover:text-white/70">
              <span className="text-white/75">Secure your progress.</span>{" "}
              Sign in with Google to sync your sessions and protect your data from being lost.
            </span>
          </button>

          <div className="flex items-center gap-2">
            {!isLast && (
              <button
                onClick={complete}
                className="px-3 py-2 text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => (isLast ? void complete() : setStep((n) => n + 1))}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white px-5 py-2.5 text-xs font-medium tracking-wide text-black transition-all hover:bg-white/90 hover:shadow-[0_0_30px_rgba(255,255,255,0.15)]"
            >
              {isLast ? "Get Started" : "Continue"}
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1S8.69 6 12 6c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.84 3.4 14.64 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.54 0 9.2-3.9 9.2-9.38 0-.63-.07-1.11-.16-1.62H12z" />
    </svg>
  );
}
