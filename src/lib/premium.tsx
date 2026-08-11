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
import {
  createCheckoutSession,
  cancelUserSubscription,
  findActiveSubscription,
} from "@/lib/api/stripe.functions";
import { toast } from "sonner";

type Plan = "monthly" | "yearly" | "lifetime";

export interface ActiveSubscription {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
  trial_end?: number | null;
  /** Unix seconds when the subscription started (Stripe `created`). */
  created?: number | null;
}

interface TriggerPaywallOptions {
  /** Post-5-day-challenge conversion: skip intro pages and land on the
   * 14-day trial screen. */
  postChallenge?: boolean;
}

interface PremiumContextValue {
  isPremium: boolean;
  /** ISO timestamp when the current free trial ends, if any. */
  trialEndsAt: string | null;
  /** True while the user is inside an active free-trial window. */
  isTrialActive: boolean;
  /** Whole days remaining in the trial (0 when no active trial). */
  trialDaysLeft: number;
  isPaywallEnabled: boolean;
  isPaywallOpen: boolean;
  triggerPaywall: (opts?: TriggerPaywallOptions) => void;
  closePaywall: () => void;
  startCheckout: (plan: Plan, trialDays?: number) => Promise<void>;
  isCheckoutLoading: boolean;
  refreshPremium: () => Promise<void>;
  setPremiumLocal: (v: boolean) => void;
  restorePurchases: () => Promise<void>;
  isRestoring: boolean;
  cancelSubscription: () => Promise<boolean>;
  isCancelling: boolean;
  fetchActiveSubscription: () => Promise<ActiveSubscription | null>;
}


const PremiumContext = createContext<PremiumContextValue | null>(null);

let externalTrigger: ((opts?: TriggerPaywallOptions) => void) | null = null;
export function triggerPaywall(opts?: TriggerPaywallOptions) {
  externalTrigger?.(opts);
}


/**
 * Reads `profiles.is_premium` + `profiles.trial_ends_at`. Falls back to the
 * plain `is_premium` select when the trial column doesn't exist yet.
 */
async function loadProfilePremium(
  userId: string,
): Promise<{ isPremium: boolean; trialEndsAt: string | null } | null> {
  const full = await supabase
    .from("profiles")
    .select("is_premium, trial_ends_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!full.error) {
    const row = full.data as { is_premium?: boolean; trial_ends_at?: string | null } | null;
    return {
      isPremium: Boolean(row?.is_premium),
      trialEndsAt: row?.trial_ends_at ?? null,
    };
  }
  const basic = await supabase
    .from("profiles")
    .select("is_premium")
    .eq("user_id", userId)
    .maybeSingle();
  if (basic.error) {
    console.error("[premium] failed to load profile", basic.error);
    return null;
  }
  return { isPremium: Boolean(basic.data?.is_premium), trialEndsAt: null };
}

function trialIsActive(trialEndsAt: string | null): boolean {
  if (!trialEndsAt) return false;
  const ts = new Date(trialEndsAt).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

function daysLeft(trialEndsAt: string | null): number {
  if (!trialIsActive(trialEndsAt)) return 0;
  const ms = new Date(trialEndsAt as string).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function PremiumProvider({ children }: { children: ReactNode }) {
  const [entitled, setEntitled] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [isPaywallOpen, setOpen] = useState(false);
  const [postChallenge, setPostChallenge] = useState(false);
  const [isCheckoutLoading, setCheckoutLoading] = useState(false);

  // An active trial counts as premium.
  const isTrialActive = trialIsActive(trialEndsAt);
  const isPremium = entitled || isTrialActive;
  const trialDaysLeft = daysLeft(trialEndsAt);

  // Load `profiles.is_premium` / `trial_ends_at` for the current user and keep
  // it in sync with auth state changes.
  useEffect(() => {
    let cancelled = false;

    async function refresh(userId: string | null) {
      if (!userId) {
        if (!cancelled) {
          setEntitled(false);
          setTrialEndsAt(null);
        }
        return;
      }
      const state = await loadProfilePremium(userId);
      if (cancelled || !state) return;
      setEntitled(state.isPremium);
      setTrialEndsAt(state.trialEndsAt);
    }

    void supabase.auth.getSession().then(({ data }) => {
      refresh(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setEntitled(false);
        setTrialEndsAt(null);
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        refresh(session?.user?.id ?? null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshPremium = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) {
      setEntitled(false);
      setTrialEndsAt(null);
      return;
    }
    const state = await loadProfilePremium(userId);
    if (!state) return;
    setEntitled(state.isPremium);
    setTrialEndsAt(state.trialEndsAt);
  }, []);

  // Returning from Stripe Checkout: the webhook may land a moment later, so
  // poll a few times so the trial unlocks immediately without a manual reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    params.delete("checkout");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : ""),
    );
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      void refreshPremium();
      if (tries >= 6) window.clearInterval(id);
    }, 2000);
    void refreshPremium();
    return () => window.clearInterval(id);
  }, [refreshPremium]);

  const setPremiumLocal = useCallback((v: boolean) => setEntitled(v), []);


  const triggerPaywall = useCallback((opts?: TriggerPaywallOptions) => {
    if (!ENABLE_PAYWALL) return;
    if (isPremium) return;
    setPostChallenge(!!opts?.postChallenge);
    setOpen(true);
  }, [isPremium]);

  const closePaywall = useCallback(() => {
    setOpen(false);
    setPostChallenge(false);
  }, []);


  const startCheckout = useCallback(async (plan: Plan, trialDays?: number) => {
    setCheckoutLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        console.error("[premium] not signed in — cannot start checkout");
        toast.error("Please sign in first to upgrade.");
        return;
      }
      const { url } = await createCheckoutSession({
        data: {
          plan,
          accessToken,
          origin: window.location.origin,
          ...(trialDays ? { trialDays } : {}),
        },
      });
      window.location.href = url;
    } catch (err) {
      console.error("[premium] checkout failed", err);
      toast.error("Could not start checkout. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  }, []);

  const [isRestoring, setRestoring] = useState(false);
  const restorePurchases = useCallback(async () => {
    setRestoring(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      if (!userId) {
        toast.error("Please sign in first to restore your purchases.");
        return;
      }
      const state = await loadProfilePremium(userId);
      if (!state) {
        toast.error("Couldn't restore purchases. Please try again.");
        return;
      }
      setEntitled(state.isPremium);
      setTrialEndsAt(state.trialEndsAt);
      const active = state.isPremium || trialIsActive(state.trialEndsAt);
      if (active) toast.success("Premium restored to this device.");
      else toast("No active premium purchase found on this account.");

    } finally {
      setRestoring(false);
    }
  }, []);

  const [isCancelling, setCancelling] = useState(false);
  const cancelSubscription = useCallback(async () => {
    setCancelling(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        toast.error("Please sign in first to manage your subscription.");
        return false;
      }
      const res = await cancelUserSubscription({ data: { accessToken } });
      if (!res.ok) {
        toast.error(res.error || "Couldn't cancel subscription.");
        return false;
      }
      const endTs = res.status === "trialing" ? res.trial_end : res.current_period_end;
      const endDate = endTs ? new Date(endTs * 1000).toLocaleDateString() : null;
      if (res.status === "trialing") {
        toast.success(
          endDate
            ? `Trial cancelled. Your trial ends on ${endDate} — you will not be charged.`
            : "Trial cancelled. You will not be charged.",
        );
      } else {
        toast.success(
          endDate
            ? `Subscription cancelled. You keep access until ${endDate}.`
            : "Subscription cancelled. You keep access until the end of the paid period.",
        );
      }
      return true;
    } catch (err) {
      console.error("[premium] cancelSubscription failed", err);
      toast.error("Couldn't cancel subscription. Please try again.");
      return false;
    } finally {
      setCancelling(false);
    }
  }, []);

  const fetchActiveSubscription = useCallback(async (): Promise<ActiveSubscription | null> => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) return null;
      const res = await findActiveSubscription({ data: { accessToken } });
      return res.subscription;
    } catch (err) {
      console.error("[premium] fetchActiveSubscription failed", err);
      return null;
    }
  }, []);

  externalTrigger = triggerPaywall;

  const value = useMemo<PremiumContextValue>(
    () => ({
      isPremium,
      trialEndsAt,
      isTrialActive,
      trialDaysLeft,
      isPaywallEnabled: ENABLE_PAYWALL,
      isPaywallOpen,
      triggerPaywall,
      closePaywall,
      startCheckout,
      isCheckoutLoading,
      refreshPremium,
      setPremiumLocal,
      restorePurchases,
      isRestoring,
      cancelSubscription,
      isCancelling,
      fetchActiveSubscription,
    }),
    [
      isPremium,
      trialEndsAt,
      isTrialActive,
      trialDaysLeft,
      isPaywallOpen,
      triggerPaywall,
      closePaywall,
      startCheckout,
      isCheckoutLoading,
      refreshPremium,
      setPremiumLocal,
      restorePurchases,
      isRestoring,
      cancelSubscription,
      isCancelling,
      fetchActiveSubscription,
    ],
  );

  return (
    <PremiumContext.Provider value={value}>
      {children}
      <PremiumPaywall
        open={isPaywallOpen}
        onClose={closePaywall}
        onUpgrade={startCheckout}
        isLoading={isCheckoutLoading}
        onRestore={restorePurchases}
        isRestoring={isRestoring}
        postChallenge={postChallenge}
      />

    </PremiumContext.Provider>
  );
}

export function usePremium(): PremiumContextValue {
  const ctx = useContext(PremiumContext);
  if (!ctx) {
    return {
      isPremium: false,
      trialEndsAt: null,
      isTrialActive: false,
      trialDaysLeft: 0,
      isPaywallEnabled: ENABLE_PAYWALL,
      isPaywallOpen: false,
      triggerPaywall: () => {},
      closePaywall: () => {},
      startCheckout: async (_plan: Plan, _trialDays?: number) => {},
      isCheckoutLoading: false,
      refreshPremium: async () => {},
      setPremiumLocal: () => {},
      restorePurchases: async () => {},
      isRestoring: false,
      cancelSubscription: async () => false,
      isCancelling: false,
      fetchActiveSubscription: async () => null,
    };
  }
  return ctx;
}
