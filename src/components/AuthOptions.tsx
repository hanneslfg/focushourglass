import { useState } from "react";
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
} from "@/lib/supabase";
import { setGuestMode } from "@/lib/guest";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.6c-.1 1.1-.9 2.8-2.5 3.9l3.8 3c2.3-2.1 3.6-5.2 3.6-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.8-3c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5l-4 3.1C3.1 21.3 7.2 24 12 24z" />
      <path fill="#FBBC05" d="M5.1 14.3c-.3-.8-.4-1.5-.4-2.3s.2-1.6.4-2.3l-4-3.1C.4 8.2 0 10 0 12s.4 3.8 1.1 5.4l4-3.1z" />
      <path fill="#EA4335" d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.2 0 3.1 2.7 1.1 6.6l4 3.1c1-2.9 3.7-5 6.9-5z" />
    </svg>
  );
}

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
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        className="w-full inline-flex items-center justify-center gap-3 rounded-md border border-white/15 bg-white px-4 py-3 text-sm font-medium text-black hover:bg-white/90 transition-all"
      >
        <GoogleIcon />
        Continue with Google
      </button>

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
