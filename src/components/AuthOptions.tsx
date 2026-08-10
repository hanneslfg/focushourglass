import { useState } from "react";
import { signInWithEmail, signUpWithEmail } from "@/lib/supabase";
import { GoogleOneTap } from "@/components/GoogleOneTap";
import { setGuestMode } from "@/lib/guest";

/**
 * Three sign-in pathways: Google OAuth, email + password, and guest mode.
 * Local guest data is merged into the cloud account automatically on sign-in
 * (see `mergeLocalSessionsToCloud`).
 */
export function AuthOptions({
  onGuest,
  showGuest = true,
  compact = false,
}: {
  onGuest?: () => void;
  showGuest?: boolean;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    if (mode === "signin") {
      const err = await signInWithEmail(email.trim(), password);
      if (err) setError(err);
      else setGuestMode(false);
    } else {
      const res = await signUpWithEmail(email.trim(), password);
      if (res.error) setError(res.error);
      else if (res.needsConfirmation)
        setInfo("Check your inbox to confirm your email, then sign in.");
      else setGuestMode(false);
    }
    setBusy(false);
  }

  return (
    <div className={compact ? "" : "w-full"}>
      <GoogleOneTap oneTap={!compact} />

      <div className="my-3 flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">or</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={submit} className="space-y-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          autoComplete="email"
          className="w-full rounded-md border border-white/12 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-amber-300/60"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          className="w-full rounded-md border border-white/12 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-amber-300/60"
        />
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        {info && <p className="text-[11px] text-emerald-300">{info}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md border border-white/20 bg-white/[0.06] px-4 py-2.5 text-sm text-white hover:bg-white/[0.12] transition disabled:opacity-40"
        >
          {mode === "signin" ? "Sign in with email" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setError(null);
          setInfo(null);
          setMode((m) => (m === "signin" ? "signup" : "signin"));
        }}
        className="mt-2 w-full text-[11px] text-white/45 hover:text-white/80 transition-colors"
      >
        {mode === "signin"
          ? "No account yet? Create one"
          : "Already have an account? Sign in"}
      </button>

      {showGuest && (
        <button
          type="button"
          onClick={() => {
            setGuestMode(true);
            onGuest?.();
          }}
          className="mt-3 w-full rounded-md border border-dashed border-white/15 px-4 py-2.5 text-[12px] text-white/55 hover:text-white/85 hover:border-white/30 transition"
        >
          Continue as Guest — data stays on this device
        </button>
      )}
    </div>
  );
}
