import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { PremiumPaywall, ENABLE_PAYWALL } from "@/components/PremiumPaywall";

interface PremiumContextValue {
  isPremium: boolean;
  isPaywallEnabled: boolean;
  isPaywallOpen: boolean;
  triggerPaywall: () => void;
  closePaywall: () => void;
}

const PremiumContext = createContext<PremiumContextValue | null>(null);

// Simple imperative trigger usable outside React (e.g. utility functions).
let externalTrigger: (() => void) | null = null;
export function triggerPaywall() {
  externalTrigger?.();
}

export function PremiumProvider({ children }: { children: ReactNode }) {
  // TODO: wire to real entitlement source (Supabase / Stripe) when launched.
  const [isPremium] = useState(false);
  const [isPaywallOpen, setOpen] = useState(false);

  const triggerPaywall = useCallback(() => {
    if (!ENABLE_PAYWALL) return;
    if (isPremium) return;
    setOpen(true);
  }, [isPremium]);

  const closePaywall = useCallback(() => setOpen(false), []);

  externalTrigger = triggerPaywall;

  const value = useMemo<PremiumContextValue>(
    () => ({
      isPremium,
      isPaywallEnabled: ENABLE_PAYWALL,
      isPaywallOpen,
      triggerPaywall,
      closePaywall,
    }),
    [isPremium, isPaywallOpen, triggerPaywall, closePaywall],
  );

  return (
    <PremiumContext.Provider value={value}>
      {children}
      <PremiumPaywall open={isPaywallOpen} onClose={closePaywall} />
    </PremiumContext.Provider>
  );
}

export function usePremium(): PremiumContextValue {
  const ctx = useContext(PremiumContext);
  if (!ctx) {
    // Safe fallback so consumers don't crash if provider is missing.
    return {
      isPremium: false,
      isPaywallEnabled: ENABLE_PAYWALL,
      isPaywallOpen: false,
      triggerPaywall: () => {},
      closePaywall: () => {},
    };
  }
  return ctx;
}
