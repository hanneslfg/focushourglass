import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { signInWithGoogle } from "@/lib/supabase";
import { setGuestMode } from "@/lib/guest";

/**
 * Google Identity Services (One Tap + popup button).
 *
 * The credential returned by GIS is a Google ID token, which we hand straight
 * to `supabase.auth.signInWithIdToken`. Nothing ever leaves the current
 * origin — no redirect to the Supabase callback URL.
 *
 * Requires a Google OAuth **Web** client ID in `VITE_GOOGLE_CLIENT_ID`
 * (publishable, safe in the bundle). Without it we transparently fall back to
 * the previous redirect-based flow so sign-in never breaks.
 */

// Publishable Google OAuth Web client ID (safe in the bundle).
const CLIENT_ID =
  (import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined) ||
  "219650510350-ra2c2d7qsc0uu988apaku6ui1d6odthb.apps.googleusercontent.com";
const GSI_SRC = "https://accounts.google.com/gsi/client";

type CredentialResponse = { credential?: string };

interface GoogleIdApi {
  accounts: {
    id: {
      initialize: (config: Record<string, unknown>) => void;
      prompt: (cb?: (n: unknown) => void) => void;
      renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
      cancel: () => void;
      disableAutoSelect: () => void;
    };
  };
}

function gis(): GoogleIdApi | null {
  const w = window as unknown as { google?: GoogleIdApi };
  return w.google?.accounts?.id ? w.google : null;
}

let scriptPromise: Promise<boolean> | null = null;
function loadGsi(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (gis()) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`,
    );
    const el = existing ?? document.createElement("script");
    el.src = GSI_SRC;
    el.async = true;
    el.defer = true;
    el.addEventListener("load", () => resolve(!!gis()));
    el.addEventListener("error", () => resolve(false));
    if (!existing) document.head.appendChild(el);
  });
  return scriptPromise;
}

/** Random nonce + its SHA-256 hash (Google signs the hashed one). */
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = btoa(String.fromCharCode(...bytes))
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 32);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}

export function GoogleOneTap({
  /** Show the One Tap bubble (landing / login screens only). */
  oneTap = true,
  /** Fallback label for the redirect button when GIS is unavailable. */
  fallbackLabel = "Continue with Google",
}: {
  oneTap?: boolean;
  fallbackLabel?: string;
}) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nonceRef = useRef<{ raw: string; hashed: string } | null>(null);

  const handleCredential = useCallback(async (res: CredentialResponse) => {
    if (!res.credential) return;
    setError(null);
    const { error: err } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: res.credential,
      ...(nonceRef.current ? { nonce: nonceRef.current.raw } : {}),
    });
    if (err) {
      console.error("[auth] signInWithIdToken failed:", err);
      setError(err.message);
      return;
    }
    setGuestMode(false);
  }, []);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    void (async () => {
      const ok = await loadGsi();
      if (cancelled || !ok) return;
      const api = gis();
      if (!api) return;

      // Never prompt a signed-in user.
      const { data } = await supabase.auth.getSession();
      if (cancelled || data.session) return;

      nonceRef.current = await makeNonce();
      if (cancelled) return;

      api.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (r: CredentialResponse) => void handleCredential(r),
        nonce: nonceRef.current.hashed,
        // Popup keeps the user on this origin instead of redirecting out.
        ux_mode: "popup",
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true,
        use_fedcm_for_prompt: true,
      });

      if (buttonRef.current) {
        api.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: Math.min(
            400,
            Math.max(200, buttonRef.current.offsetWidth || 320),
          ),
        });
      }

      if (oneTap) api.accounts.id.prompt();
      setReady(true);
    })();

    return () => {
      cancelled = true;
      try {
        gis()?.accounts.id.cancel();
      } catch {
        /* noop */
      }
    };
  }, [handleCredential, oneTap]);

  return (
    <div className="w-full">
      {/* Google-rendered popup button (no redirect). */}
      <div ref={buttonRef} className="flex w-full justify-center [&>div]:w-full" />

      {/* Fallback: no client ID configured or GIS blocked → redirect flow. */}
      {!ready && (
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          className="w-full inline-flex items-center justify-center gap-3 rounded-md border border-white/15 bg-white px-4 py-3 text-sm font-medium text-black hover:bg-white/90 transition-all"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
            <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.6c-.1 1.1-.9 2.8-2.5 3.9l3.8 3c2.3-2.1 3.6-5.2 3.6-8.8z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.8-3c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5l-4 3.1C3.1 21.3 7.2 24 12 24z" />
            <path fill="#FBBC05" d="M5.1 14.3c-.3-.8-.4-1.5-.4-2.3s.2-1.6.4-2.3l-4-3.1C.4 8.2 0 10 0 12s.4 3.8 1.1 5.4l4-3.1z" />
            <path fill="#EA4335" d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.2 0 3.1 2.7 1.1 6.6l4 3.1c1-2.9 3.7-5 6.9-5z" />
          </svg>
          {fallbackLabel}
        </button>
      )}

      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
