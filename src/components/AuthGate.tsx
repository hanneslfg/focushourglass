import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Blocks rendering of the app shell until the Supabase session has been
 * restored from storage. Without this, components mount with `user === null`
 * for a tick, then swap to the signed-in state mid-render — which produced the
 * "landing flash → Something went wrong" crash on a fresh /app load.
 *
 * The resolved session is exposed to routes so they never need to start a
 * competing initialization request before deciding what to render.
 */
type AuthState = { session: Session | null; ready: boolean };

const AuthStateContext = createContext<AuthState | null>(null);

export function useAuthState(): AuthState {
  const state = useContext(AuthStateContext);
  if (!state) throw new Error("useAuthState must be used inside <AuthGate>");
  return state;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    let authRevision = 0;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      authRevision += 1;
      setSession(nextSession);
      setReady(true);
    });

    const revisionAtStart = authRevision;
    void supabase.auth.getSession().then(
      ({ data }) => {
        if (cancelled || authRevision !== revisionAtStart) return;
        setSession(data.session);
        setReady(true);
      },
      () => {
        if (cancelled || authRevision !== revisionAtStart) return;
        setSession(null);
        setReady(true);
      },
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center bg-background"
        aria-busy="true"
      >
        <span className="sr-only">Loading</span>
        <span className="h-6 w-6 rounded-full border border-border/60 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <AuthStateContext.Provider value={{ session, ready }}>
      {children}
    </AuthStateContext.Provider>
  );
}
