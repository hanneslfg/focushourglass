import { useEffect, useState } from "react";
import { Activity, BarChart3, MessageCircle, X } from "lucide-react";
import {
  INVITE_PERMS,
  addPartner,
  clearInviteFromUrl,
  getMyDisplayName,
  hasMyDisplayName,
  setMyDisplayName,
} from "@/lib/partners";

/**
 * Two-slide flow shown when the app is opened through an invite link:
 * concept → mandatory display name + privacy defaults.
 */
export function BuddyInviteOnboarding({
  code,
  inviterName,
  onDismiss,
  onAccepted,
}: {
  code: string;
  inviterName?: string;
  onDismiss: () => void;
  onAccepted: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (hasMyDisplayName()) setName(getMyDisplayName());
  }, []);

  const dismiss = () => {
    clearInviteFromUrl();
    onDismiss();
  };

  const accept = () => {
    const clean = name.trim();
    if (!clean) {
      setError("Please enter a display name to join.");
      return;
    }
    setMyDisplayName(clean);
    addPartner(code, inviterName, INVITE_PERMS);
    clearInviteFromUrl();
    onAccepted();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={dismiss} aria-hidden />
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-card p-6 shadow-2xl">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 h-8 w-8 rounded-full border border-border flex items-center justify-center hover:border-foreground/60"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>

        {step === 1 ? (
          <>
            <h2 className="font-display text-2xl leading-snug tracking-tight pr-8">
              {inviterName
                ? `${inviterName} invited you to their Virtual Focus Room! ⏳`
                : "You've been invited to a Virtual Focus Room! ⏳"}
            </h2>
            <div className="mt-6 space-y-4">
              <Bullet
                icon={<Activity className="h-4 w-4 text-emerald-300" strokeWidth={1.75} />}
                title="🟢 Live status"
                text="See when your buddy is deep in a focus block or on a break."
              />
              <Bullet
                icon={<BarChart3 className="h-4 w-4 text-amber-200" strokeWidth={1.75} />}
                title="📊 Daily progress"
                text="Compare today's focus minutes and keep each other's streaks alive."
              />
              <Bullet
                icon={<MessageCircle className="h-4 w-4 text-sky-300" strokeWidth={1.75} />}
                title="💬 Quiet chat"
                text="Messaging unlocks only during breaks, so deep work stays protected."
              />
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-7 w-full rounded-lg bg-amber-300/90 px-4 py-3 text-sm font-medium text-black hover:brightness-110 transition"
            >
              Next: Set Up Profile →
            </button>
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl tracking-tight pr-8">Your focus profile</h2>
            <label className="mt-6 block text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Your display name (shown in Focus Room)
            </label>
            <input
              value={name}
              autoFocus
              onChange={(e) => {
                setName(e.target.value.slice(0, 30));
                setError("");
              }}
              placeholder="e.g. Hannes"
              className="mt-2 w-full rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm outline-none focus:border-foreground/50"
            />
            {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

            <p className="mt-5 rounded-lg border border-border bg-background/40 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
              🔒 Default privacy: Buddies only see your daily focus minutes. Task
              names and live status remain hidden until you explicitly enable
              them.
            </p>

            <button
              type="button"
              onClick={accept}
              disabled={!name.trim()}
              className="mt-6 w-full rounded-lg bg-amber-300/90 px-4 py-3 text-sm font-medium text-black hover:brightness-110 transition disabled:opacity-40"
            >
              Accept &amp; Enter Focus Room
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mt-3 w-full text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
            >
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Bullet({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 h-8 w-8 shrink-0 rounded-lg border border-border bg-background/40 flex items-center justify-center">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-foreground/90">{title}</span>
        <span className="block text-[11px] leading-relaxed text-muted-foreground">{text}</span>
      </span>
    </div>
  );
}
