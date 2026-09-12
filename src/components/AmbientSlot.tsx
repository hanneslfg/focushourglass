import { useEffect, useRef } from "react";

/**
 * Mount point for the root-level ambient sound player.
 *
 * The player lives at the app root (so audio survives navigation) but its UI
 * belongs inside the timer view. Instead of letting the player search the DOM
 * for `#ambient-slot` — which can happen while React is still hydrating this
 * subtree and then throws a hydration mismatch — the slot announces itself
 * from an effect. Effects only run after the commit, so by the time the player
 * portals into this node, hydration of the timer route is already done.
 */
const EVENT = "hourglass:ambient-slot";

type SlotWindow = Window & { __ambientSlot?: HTMLElement | null };

export function getAmbientSlot(): HTMLElement | null {
  if (typeof window === "undefined") return null;
  return (window as SlotWindow).__ambientSlot ?? null;
}

export function subscribeAmbientSlot(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function AmbientSlot() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const w = window as SlotWindow;
    w.__ambientSlot = ref.current;
    w.dispatchEvent(new Event(EVENT));
    return () => {
      if (w.__ambientSlot === ref.current) {
        w.__ambientSlot = null;
        w.dispatchEvent(new Event(EVENT));
      }
    };
  }, []);

  return (
    <div
      ref={ref}
      id="ambient-slot"
      className="relative inline-flex min-h-8 justify-center -mt-2"
    />
  );
}
