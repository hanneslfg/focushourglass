import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { AuthOptions } from "@/components/AuthOptions";
import { safeStorage } from "@/lib/safeStorage";
import { addProject } from "@/lib/projects";
import {
  listFocusSounds,
  setUnlockedFreeSound,
  type FocusSound,
} from "@/lib/freeSound";

const STORAGE_KEY = "hourglass_onboarding_completed";
const PROFILE_KEY = "hourglass_onboarding_profile";
/** Resume state so an OAuth redirect mid-onboarding does not restart it. */
const RESUME_KEY = "hourglass_onboarding_resume";

type Persona = "university" | "entrepreneur" | "mastery" | "knowledge";
type Pain = "1-2" | "3-4" | "5+";

const PERSONAS: { id: Persona; label: string; emoji: string }[] = [
  { id: "university", emoji: "🎓", label: "University & Exams" },
  { id: "entrepreneur", emoji: "🚀", label: "Entrepreneurship & Coding" },
  { id: "mastery", emoji: "🧠", label: "Personal Mastery" },
  { id: "knowledge", emoji: "⚡", label: "Knowledge Work" },
];

const PAIN_OPTIONS: { id: Pain; label: string }[] = [
  { id: "1-2", label: "1–2 Hours" },
  { id: "3-4", label: "3–4 Hours" },
  { id: "5+", label: "5+ Hours" },
];

function suggestBlocks(personas: Persona[]): number {
  if (personas.includes("entrepreneur")) return 3;
  if (personas.includes("knowledge")) return 3;
  if (personas.includes("university")) return 2;
  return 2;
}

/** Endowed-progress starter project. Every new user lands with 1/5 slots
 * already filled so they never face a blank dashboard. */
function starterProjectFor(_personas: Persona[]): string {
  return "My First Deep Work";
}


function playChime() {
  try {
    const AC = (window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext)!;
    const ctx = new AC();
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);
    g.connect(ctx.destination);
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      o.start(now + i * 0.12);
      o.stop(now + 2);
    });
    setTimeout(() => ctx.close(), 2200);
  } catch {
    /* noop */
  }
}

export function OnboardingOverlay() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [guestChosen, setGuestChosen] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [pain, setPain] = useState<Pain | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [flipUnlocked, setFlipUnlocked] = useState(false);
  const [blocks, setBlocks] = useState(2);
  const [isAuthed, setIsAuthed] = useState(false);
  const [soundOptions, setSoundOptions] = useState<FocusSound[]>([]);
  const [freeSound, setFreeSound] = useState<string | null>(null);
  const [sandProgress, setSandProgress] = useState(0);
  const sandRafRef = useRef<number | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  /** Hard-stop any running sound preview (only one may ever play). */
  function stopPreview() {
    const el = previewRef.current;
    if (el) {
      try {
        el.pause();
      } catch {
        /* noop */
      }
      el.src = "";
      previewRef.current = null;
    }
  }

  function playPreview(url: string) {
    stopPreview();
    try {
      const el = new Audio(url);
      el.loop = true;
      el.volume = 0.5;
      previewRef.current = el;
      void el.play().catch(() => {
        /* autoplay blocked */
      });
    } catch {
      /* noop */
    }
  }

  // Stop preview when leaving the sound step, and on unmount.
  useEffect(() => {
    if (step !== 5) stopPreview();
  }, [step]);

  useEffect(() => {
    return () => {
      stopPreview();
      if (sandRafRef.current) cancelAnimationFrame(sandRafRef.current);
    };
  }, []);

  // Load the ambient library so the user can claim one track for free.
  useEffect(() => {
    let cancelled = false;
    void listFocusSounds().then((list) => {
      if (cancelled) return;
      setSoundOptions(list);
      setFreeSound((cur) => cur ?? list[0]?.name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (safeStorage.getItem(STORAGE_KEY) === "true") return;
      const { data } = await supabase.auth.getSession();
      const meta = data.session?.user?.user_metadata as
        | { has_completed_onboarding?: boolean }
        | undefined;
      if (meta?.has_completed_onboarding) {
        // Already onboarded on the account — mirror it locally so a cleared
        // browser / new device never replays the flow.
        safeStorage.setItem(STORAGE_KEY, "true");
        safeStorage.removeItem(RESUME_KEY);
        return;
      }
      if (cancelled) return;
      // Restore progress after an OAuth redirect so the user resumes where
      // they left off instead of running the whole flow a second time.
      try {
        const raw = safeStorage.getItem(RESUME_KEY);
        if (raw) {
          const r = JSON.parse(raw) as {
            step?: number;
            personas?: Persona[];
            pain?: Pain | null;
            blocks?: number;
            freeSound?: string | null;
          };
          if (Array.isArray(r.personas)) setPersonas(r.personas);
          if (r.pain) setPain(r.pain);
          if (typeof r.blocks === "number") setBlocks(r.blocks);
          if (r.freeSound) setFreeSound(r.freeSound);
          if (typeof r.step === "number" && r.step > 1) {
            setStep(r.step);
            if (r.step > 4) {
              setFlipped(true);
              setFlipUnlocked(true);
              setSandProgress(1);
            }
          }
        }
      } catch {
        /* ignore malformed resume state */
      }
      setOpen(true);
    }
    void check();

    // A sign-in that happens while the app is open must also close the
    // overlay when that account already completed onboarding.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const meta = session?.user?.user_metadata as
        | { has_completed_onboarding?: boolean }
        | undefined;
      if (meta?.has_completed_onboarding) {
        safeStorage.setItem(STORAGE_KEY, "true");
        safeStorage.removeItem(RESUME_KEY);
        setOpen(false);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Persist progress on every change (cheap, tiny payload).
  useEffect(() => {
    if (!open) return;
    try {
      safeStorage.setItem(
        RESUME_KEY,
        JSON.stringify({ step, personas, pain, blocks, freeSound }),
      );
    } catch {
      /* ignore */
    }
  }, [open, step, personas, pain, blocks, freeSound]);

  useEffect(() => {
    setBlocks(suggestBlocks(personas));
  }, [personas]);

  // Track auth state so step 5 can gate the CTA behind Google sign-in.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setIsAuthed(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAuthed(!!session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function finish() {
    const profile = { personas, pain, dailyBlocks: blocks, freeSound };
    if (freeSound) setUnlockedFreeSound(freeSound);
    safeStorage.setItem(STORAGE_KEY, "true");
    safeStorage.removeItem(RESUME_KEY);
    safeStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    // Save target minutes to settings (blocks × 90min)
    try {
      const raw = safeStorage.getItem("hourglass_settings");
      const settings = raw ? JSON.parse(raw) : {};
      settings.defaultDailyGoal = blocks * 90;
      safeStorage.setItem("hourglass_settings", JSON.stringify(settings));
      window.dispatchEvent(new Event("hourglass:settings"));
    } catch {
      /* noop */
    }

    stopPreview();
    setOpen(false);

    // Auto-create a persona-driven first project so the user experiences
    // the Endowed Progress Effect immediately on landing in the dashboard.
    const starter = starterProjectFor(personas);
    try {
      const created = await addProject(starter);
      if (created) {
        safeStorage.setItem("hourglass.activeProjectTag", created.name);
        window.dispatchEvent(new Event("hourglass:projects"));
        // Guided-tour hint: dispatched event + toast pointing to the new project.
        window.dispatchEvent(
          new CustomEvent("hourglass:showProjectTour", {
            detail: { projectName: created.name },
          }),
        );
        setTimeout(() => {
          toast(`Your first project is ready: ${created.name}`, {
            description:
              "Set a target, add a goal, and start your first hourglass block.",
            duration: 8000,
          });
        }, 400);
      }
    } catch (e) {
      console.warn("[onboarding] starter project create failed:", e);
    }

    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await supabase.auth.updateUser({
          data: {
            has_completed_onboarding: true,
            personas,
            persona_primary: personas[0] ?? null,
            starter_project: starter,
            daily_pain_hours: pain,
            daily_focus_blocks: blocks,
            unlocked_free_sound_id: freeSound,
            marketing_email: null,
            blueprint_consent: false,

          },
        });
      }
    } catch (e) {
      console.warn("[onboarding] updateUser failed:", e);
    }
  }

  function togglePersona(p: Persona) {
    setPersonas((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
  }

  const canAdvance = useMemo(() => {
    if (step === 2) return personas.length > 0;
    if (step === 3) return pain !== null;
    if (step === 4) return flipped && flipUnlocked;
    if (step === 5) return !!freeSound;
    return true;
  }, [step, personas, pain, flipped, flipUnlocked, freeSound]);

  function handleTapHourglass() {
    if (flipped) return;
    setFlipped(true);
    setFlipUnlocked(false);
    setSandProgress(0);
    try {
      navigator.vibrate?.([30, 40, 60]);
    } catch {
      /* noop */
    }
    playChime();
    // Real 5-second sand-fall: animate the fill level frame by frame and keep
    // "Continue" locked until the top chamber has fully drained.
    const DURATION = 5000;
    const start = performance.now();
    if (sandRafRef.current) cancelAnimationFrame(sandRafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      setSandProgress(t);
      if (t < 1) {
        sandRafRef.current = requestAnimationFrame(tick);
      } else {
        sandRafRef.current = null;
        setFlipUnlocked(true);
      }
    };
    sandRafRef.current = requestAnimationFrame(tick);
  }

  if (!open) return null;

  const totalSteps = 6;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-500">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-950/95 to-black/95 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full bg-amber-300/[0.05] blur-3xl" />

        <div className="relative px-8 pt-12 pb-6 md:px-10 md:pt-14">
          {/* progress dots (top) */}
          <div className="mb-8 flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`h-[2px] transition-all duration-500 ${
                  i + 1 === step
                    ? "w-8 bg-amber-300/80"
                    : i + 1 < step
                      ? "w-4 bg-white/40"
                      : "w-4 bg-white/10"
                }`}
              />
            ))}
          </div>

          <div key={step} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            {step === 1 && (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <AnimatedHourglass />
                <p className="mt-6 text-[10px] uppercase tracking-[0.35em] text-white/40">
                  Focus Hourglass
                </p>
                <h2
                  className="mt-4 text-3xl md:text-4xl font-light tracking-tight text-white leading-tight"
                  style={{ fontFamily: '"Cormorant Garamond", serif' }}
                >
                  Stop Procrastinating.<br />Start Feeling Genuinely Productive.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-white/60">
                  Focus Hourglass breaks passive fake-work habits into undeniable
                  execution blocks—so you can close your desk with absolute peace of mind.
                </p>
              </div>
            )}

            {step === 2 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">
                  Persona · Multi-select
                </p>
                <h2
                  className="mt-3 text-2xl md:text-3xl font-light tracking-tight text-white"
                  style={{ fontFamily: '"Cormorant Garamond", serif' }}
                >
                  What is your primary focus battlefield?
                </h2>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PERSONAS.map((p) => {
                    const active = personas.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePersona(p.id)}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all ${
                          active
                            ? "border-amber-300/60 bg-amber-300/[0.06] text-white shadow-[0_0_24px_-8px_rgba(226,176,92,0.4)]"
                            : "border-white/10 bg-white/[0.02] text-white/75 hover:border-white/25"
                        }`}
                      >
                        <span className="text-lg">{p.emoji}</span>
                        <span className="text-sm">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">
                  Pain Quantification
                </p>
                <h2
                  className="mt-3 text-2xl md:text-3xl font-light tracking-tight text-white"
                  style={{ fontFamily: '"Cormorant Garamond", serif' }}
                >
                  How many hours per day do you lose to procrastination or unfocused work?
                </h2>
                <div className="mt-6 space-y-2">
                  {PAIN_OPTIONS.map((o) => {
                    const active = pain === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setPain(o.id)}
                        className={`w-full rounded-xl border px-4 py-3.5 text-left text-sm transition-all ${
                          active
                            ? "border-amber-300/60 bg-amber-300/[0.06] text-white"
                            : "border-white/10 bg-white/[0.02] text-white/75 hover:border-white/25"
                        }`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">
                  Aha-Moment
                </p>
                <h2
                  className="mt-3 text-2xl md:text-3xl font-light tracking-tight text-white"
                  style={{ fontFamily: '"Cormorant Garamond", serif' }}
                >
                  Tap to flip your first 90-minute execution block.
                </h2>
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={handleTapHourglass}
                    aria-label="Flip the hourglass"
                    className={`group relative ${
                      flipped ? "animate-hg-flip" : "transition-transform duration-700 hover:scale-105"
                    }`}
                    style={{ transformOrigin: "center" }}
                  >
                    <AnimatedHourglass
                      progress={flipped ? sandProgress : 0}
                      falling={flipped && sandProgress < 1}
                      size={140}
                    />
                  </button>
                </div>
                <p
                  className={`mt-5 text-sm transition-all duration-500 ${
                    flipped ? "text-amber-300 opacity-100" : "text-white/40 opacity-70"
                  }`}
                >
                  {flipped
                    ? flipUnlocked
                      ? "Aha! That's what true neural focus feels like."
                      : "Watch the sand fall. Feel the block begin…"
                    : "Tap the hourglass above to feel the shift."}
                </p>
              </div>
            )}

            {step === 5 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">
                  Sound Environment
                </p>
                <h2
                  className="mt-3 text-2xl md:text-3xl font-light tracking-tight text-white"
                  style={{ fontFamily: '"Cormorant Garamond", serif' }}
                >
                  Choose your free focus sound.
                </h2>
                <p className="mt-2 text-sm text-white/55 leading-relaxed">
                  Pick one track to unlock forever. The rest of the library stays
                  reserved for Premium.
                </p>
                <div className="mt-5 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                  {soundOptions.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3.5 text-sm text-white/50">
                      Loading sounds…
                    </div>
                  ) : (
                    soundOptions.map((s) => {
                      const active = freeSound === s.name;
                      return (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => {
                            setFreeSound(s.name);
                            playPreview(s.url);
                          }}
                          className={`w-full rounded-xl border px-4 py-3.5 text-left text-sm transition-all ${
                            active
                              ? "border-amber-300/60 bg-amber-300/[0.06] text-white"
                              : "border-white/10 bg-white/[0.02] text-white/75 hover:border-white/25"
                          }`}
                        >
                          {s.title}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}



            {step === 6 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">
                  Your Daily Target
                </p>
                <h2
                  className="mt-3 text-2xl md:text-3xl font-light tracking-tight text-white"
                  style={{ fontFamily: '"Cormorant Garamond", serif' }}
                >
                  Suggested execution goal
                </h2>

                <div className="mt-6 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setBlocks((n) => Math.max(1, n - 1))}
                    className="h-10 w-10 rounded-full border border-white/15 text-white/70 hover:border-white/40 hover:text-white transition"
                  >
                    −
                  </button>
                  <div className="text-center">
                    <div className="font-light text-6xl text-white tabular-nums" style={{ fontFamily: '"Cormorant Garamond", serif' }}>
                      {blocks}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.28em] text-white/45 mt-1">
                      Hourglasses / day
                    </div>
                    <div className="text-xs text-white/50 mt-1 tabular-nums">
                      {blocks * 90} min · {(blocks * 90 / 60).toFixed(1)} hrs
                    </div>
                  </div>
                  {blocks < 3 ? (
                    <button
                      type="button"
                      onClick={() => setBlocks((n) => Math.min(3, n + 1))}
                      className="h-10 w-10 rounded-full border border-white/15 text-white/70 hover:border-white/40 hover:text-white transition"
                    >
                      +
                    </button>
                  ) : (
                    <span className="h-10 w-10" aria-hidden />
                  )}
                </div>
                {blocks >= 3 && (
                  <p className="mt-2 text-center text-[10px] uppercase tracking-[0.28em] text-amber-300/70">
                    Neuroscience cap · 3 hourglasses / day
                  </p>
                )}


                <div className="mt-6 rounded-xl border border-amber-300/25 bg-amber-300/[0.04] px-4 py-3.5">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-amber-300/80">
                    Outcome Projection
                  </p>
                  <p className="mt-1.5 text-sm text-white/85 leading-relaxed">
                    Based on your inputs, you will eliminate{" "}
                    <span className="text-amber-300 font-medium">
                      ~{(blocks * 90 * 7 / 60).toFixed(1)} hours
                    </span>{" "}
                    of passive procrastination and fake-work every single week.
                  </p>
                </div>

                {/* Google / email / guest — three ways in. */}
                <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-white/50">
                    Secure Your Progress
                  </p>
                  {isAuthed ? (
                    <div className="mt-3 flex items-center gap-2.5 rounded-md border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/20">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-emerald-300" fill="none" stroke="currentColor" strokeWidth={3}><path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </span>
                      <div className="text-[12px] text-white/85">
                        Signed in. Your streak will sync across all devices.
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <AuthOptions onGuest={() => setGuestChosen(true)} />
                    </div>
                  )}
                  <p className="mt-2.5 text-[11px] text-white/45 leading-snug">
                    {guestChosen && !isAuthed
                      ? "Guest mode: your data stays on this device. You can create an account any time and everything syncs up."
                      : "Sign in to keep your 5-day challenge progress backed up. No spam, ever."}
                  </p>
                </div>

              </div>
            )}
          </div>
        </div>

        <div className={`relative flex items-end gap-6 border-t border-white/5 bg-black/40 px-8 py-5 md:px-10 md:py-6 ${step === 1 ? "justify-center" : "justify-end"}`}>
          <div className="flex items-center gap-2">
            {step > 1 && step < 6 && (
              <button
                onClick={() => setStep((n) => n - 1)}
                className="px-3 py-2 text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Back
              </button>
            )}
            <button
              disabled={!canAdvance || (step === 6 && !isAuthed && !guestChosen)}
              onClick={() => {
                if (step === 6) void finish();
                else setStep((n) => n + 1);
              }}
              title={step === 6 && !isAuthed && !guestChosen ? "Sign in above, or continue as guest" : undefined}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white px-5 py-2.5 text-xs font-medium tracking-wide text-black transition-all hover:bg-white/90 hover:shadow-[0_0_30px_rgba(226,176,92,0.25)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {step === 1 && "Build My Focus Environment"}
              {step === 2 && "Continue"}
              {step === 3 && "Continue"}
              {step === 4 && "Continue"}
              {step === 5 && "Continue"}
              {step === 6 && "Start My 5-Day Focus Challenge"}
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function AnimatedHourglass({
  progress,
  falling = false,
  filling = false,
  size = 96,
}: {
  /** 0 = top chamber full, 1 = fully drained into the bottom chamber. */
  progress?: number;
  falling?: boolean;
  filling?: boolean;
  size?: number;
}) {
  const p = Math.max(0, Math.min(1, progress ?? (filling ? 0.9 : 0.05)));
  // Top chamber drains as p rises; bottom chamber fills up.
  const topFillY = 8 + (36 - 8) * p;
  const bottomFillY = 64 - (64 - 40) * p;
  const moundRx = 2 + 12 * p;
  const moundRy = 0.8 + 3 * p;
  const grains = [0, 0.18, 0.36, 0.54, 0.72, 0.9];
  return (
    <svg
      viewBox="0 0 48 72"
      style={{ height: size * 0.75, width: size * 0.55 }}
      className="mx-auto text-amber-300/90 drop-shadow-[0_0_18px_rgba(226,176,92,0.35)]"
      aria-hidden
    >
      <defs>
        <clipPath id="oh-top">
          <polygon points="8,8 40,8 26,36 22,36" />
        </clipPath>
        <clipPath id="oh-bot">
          <polygon points="22,38 26,38 40,64 8,64" />
        </clipPath>
        <linearGradient id="oh-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.9 0.13 82)" />
          <stop offset="100%" stopColor="oklch(0.7 0.16 62)" />
        </linearGradient>
      </defs>
      <line x1="6" y1="6" x2="42" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <line x1="6" y1="66" x2="42" y2="66" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />

      {/* Top chamber sand (drains) */}
      <g clipPath="url(#oh-top)">
        <rect x="0" y={topFillY} width="48" height="40" fill="url(#oh-sand)" />
      </g>

      {/* Bottom chamber sand (fills + growing mound) */}
      <g clipPath="url(#oh-bot)">
        <rect x="0" y={bottomFillY} width="48" height="40" fill="url(#oh-sand)" />
        <ellipse cx="24" cy={bottomFillY + 0.5} rx={moundRx} ry={moundRy} fill="url(#oh-sand)" />
        {/* Individual grains actually falling through the neck */}
        {falling &&
          grains.map((delay, i) => (
            <circle key={i} cx={24 + (i % 2 === 0 ? -0.5 : 0.5)} r="0.6" cy="38" fill="url(#oh-sand)">
              <animate
                attributeName="cy"
                from="38"
                to={bottomFillY}
                dur="0.65s"
                begin={`-${delay}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0.2"
                dur="0.65s"
                begin={`-${delay}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
      </g>

      {/* Continuous sand stream through the neck */}
      {falling && (
        <line x1="24" y1="36" x2="24" y2="39" stroke="url(#oh-sand)" strokeWidth="0.9" opacity="0.9">
          <animate attributeName="opacity" values="0.5;1;0.5" dur="0.5s" repeatCount="indefinite" />
        </line>
      )}

      <polygon
        points="8,8 40,8 26,36 26,38 40,64 8,64 22,38 22,36"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        opacity="0.55"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1S8.69 6 12 6c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.84 3.4 14.64 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.54 0 9.2-3.9 9.2-9.38 0-.63-.07-1.11-.16-1.62H12z" />
    </svg>
  );
}
