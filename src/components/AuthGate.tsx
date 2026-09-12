import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Blocks rendering of the app shell until the Supabase session has been
 * restored from storage. Without this, components mount with `user === null`
 * for a tick, then swap to the signed-in state mid-render — which produced the
 * "landing flash → Something went wrong" crash on a fresh /app load.
 *
 * Guests are allowed through (the app works signed-out); the gate only waits
 * for auth to be *resolved*, it does not redirect.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let done = false;

    const finish = () => {
      if (cancelled || done) return;
      done = true;
      setReady(true);
    };

    void supabase.auth
      .getSession()
      .then(finish)
      .catch(finish);

    const { data: sub } = supabase.auth.onAuthStateChange(() => finish());

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

  return <>{children}</>;
}
