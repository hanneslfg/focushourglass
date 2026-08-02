import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, TriangleAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isGuestMode, setGuestMode } from "@/lib/guest";
import { AuthOptions } from "@/components/AuthOptions";

/**
 * Subtle top banner shown while the user browses as a guest. Guest data lives
 * only in localStorage and is merged into the cloud on sign-in.
 */
export function GuestBanner() {
  const [guest, setGuest] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    const sync = () => setGuest(isGuestMode());
    sync();
    window.addEventListener("hourglass:guest", sync);
    void supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
      if (session) setGuestMode(false);
    });
    return () => {
      window.removeEventListener("hourglass:guest", sync);
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!guest || authed !== false) return null;

  return (
    <>
      <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 border-b border-amber-300/20 bg-amber-300/[0.07] px-4 py-1.5 text-[11px] text-amber-100/85 backdrop-blur">
        <TriangleAlert className="h-3 w-3 shrink-0" strokeWidth={1.75} />
        <span className="truncate">
          Guest Mode: Your focus data is stored locally on this device.
        </span>
        <button
          onClick={() => setModal(true)}
          className="shrink-0 underline underline-offset-2 hover:text-white"
        >
          Create account to sync &amp; backup
        </button>
      </div>

      {modal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#0b0b0d] p-6 shadow-2xl">
              <button
                onClick={() => setModal(false)}
                aria-label="Close"
                className="absolute right-4 top-4 text-white/40 hover:text-white/80"
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-semibold text-white">Save your progress</h2>
              <p className="mt-2 text-sm text-white/55">
                Your local sessions will be uploaded automatically once you sign in.
              </p>
              <div className="mt-5">
                <AuthOptions showGuest={false} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
