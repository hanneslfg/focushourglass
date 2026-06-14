import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import {
  supabase,
  signInWithGoogle,
  signOut,
  getUserId,
  setUserId,
  migrateSessions,
} from "@/lib/supabase";

export function AuthButton() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const user = data.session?.user;
      if (user) {
        setEmail(user.email ?? user.user_metadata?.name ?? "Signed in");
        const localId = getUserId();
        if (localId && localId !== user.id) {
          migrateSessions(localId, user.id).finally(() => setUserId(user.id));
        } else {
          setUserId(user.id);
        }
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      if (event === "SIGNED_IN" && user) {
        setEmail(user.email ?? user.user_metadata?.name ?? "Signed in");
        const localId = getUserId();
        if (localId && localId !== user.id) {
          migrateSessions(localId, user.id).finally(() => setUserId(user.id));
        } else {
          setUserId(user.id);
        }
      } else if (event === "SIGNED_OUT") {
        setEmail(null);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSignIn() {
    setLoading(true);
    await signInWithGoogle();
    setLoading(false);
  }

  async function handleSignOut() {
    setLoading(true);
    await signOut();
    setLoading(false);
  }

  if (email) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="hidden sm:inline tracking-wide truncate max-w-[160px]">
          {email}
        </span>
        <button
          onClick={handleSignOut}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 min-h-7 rounded-md border border-border/60 hover:border-foreground/40 hover:text-foreground active:bg-accent transition-colors disabled:opacity-40"
          aria-label="Sign out"
        >
          <LogOut className="h-3 w-3" strokeWidth={1.75} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleSignIn}
      disabled={loading}
      className="inline-flex items-center gap-2 px-3 min-h-8 rounded-md border border-border/70 text-xs text-foreground/80 hover:text-foreground hover:border-foreground/50 active:bg-accent transition-colors disabled:opacity-50"
    >
      <GoogleIcon />
      Sign in with Google
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1S8.69 6 12 6c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.84 3.4 14.64 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.54 0 9.2-3.9 9.2-9.38 0-.63-.07-1.11-.16-1.62H12z"
      />
    </svg>
  );
}
