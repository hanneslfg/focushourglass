import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PremiumPaywall, ENABLE_PAYWALL } from "@/components/PremiumPaywall";
import { supabase } from "@/lib/supabase";
import { createCheckoutSession } from "@/lib/api/stripe.functions";

type Plan = "monthly" | "yearly" | "lifetime";

interface PremiumContextValue {
  isPremium: boolean;
  isPaywallEnabled: boolean;
  isPaywallOpen: boolean;
  triggerPaywall: () => void;
  closePaywall: () => void;
  startCheckout: (plan: Plan) => Promise<void>;
  isCheckoutLoading: boolean;
}

const PremiumContext = createContext<PremiumContextValue | null>(null);

let externalTrigger: (() => void) | null = null;
export function triggerPaywall() {
  externalTrigger?.();
}

export function PremiumProvider({ children }: { children: ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [isPaywallOpen, setOpen] = useState(false);
  const [isCheckoutLoading, setCheckoutLoading] = useState(false);

  // Load `profiles.is_premium` for the current user and keep it in sync
  // with auth state changes.
  useEffect(() => {
    let cancelled = false;

    async function refresh(userId: string | null) {
      if (!userId) {
        if (!cancelled) setIsPremium(false);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("is_premium")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("[premium] failed to load profile", error);
        return;
      }
      setIsPremium(Boolean(data?.is_premium));
    }

    void supabase.auth.getSession().then(({ data }) => {
      refresh(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") setIsPremium(false);
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        refresh(session?.user?.id ?? null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const triggerPaywall = useCallback(() => {
    if (!ENABLE_PAYWALL) return;
    if (isPremium) return;
    setOpen(true);
  }, [isPremium]);

  const closePaywall = useCallback(() => setOpen(false), []);

  const startCheckout = useCallback(async (plan: Plan) => {
    setCheckoutLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        console.error("[premium] not signed in — cannot start checkout");
        alert("Please sign in first to upgrade.");
        return;
      }
      const { url } = await createCheckoutSession({
        data: {
          plan,
          accessToken,
          origin: window.location.origin,
        },
      });
      window.location.href = url;
    } catch (err) {
      console.error("[premium] checkout failed", err);
      alert("Could not start checkout. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  }, []);

  externalTrigger = triggerPaywall;

  const value = useMemo<PremiumContextValue>(
    () => ({
      isPremium,
      isPaywallEnabled: ENABLE_PAYWALL,
      isPaywallOpen,
      triggerPaywall,
      closePaywall,
      startCheckout,
      isCheckoutLoading,
    }),
    [isPremium, isPaywallOpen, triggerPaywall, closePaywall, startCheckout, isCheckoutLoading],
  );

  return (
    <PremiumContext.Provider value={value}>
      {children}
      <PremiumPaywall
        open={isPaywallOpen}
        onClose={closePaywall}
        onUpgrade={startCheckout}
        isLoading={isCheckoutLoading}
      />
    </PremiumContext.Provider>
  );
}

export function usePremium(): PremiumContextValue {
  const ctx = useContext(PremiumContext);
  if (!ctx) {
    return {
      isPremium: false,
      isPaywallEnabled: ENABLE_PAYWALL,
      isPaywallOpen: false,
      triggerPaywall: () => {},
      closePaywall: () => {},
      startCheckout: async () => {},
      isCheckoutLoading: false,
    };
  }
  return ctx;
}
