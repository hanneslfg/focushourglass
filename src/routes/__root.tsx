import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import "../lib/suppress-analytics-noise";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { useRealtimeSessions } from "@/lib/useRealtimeSessions";
import { MilestoneOverlay } from "@/components/MilestoneOverlay";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import { Day5RewardOverlay } from "@/components/Day5RewardOverlay";
import { GoalCompletionOverlay } from "@/components/GoalCompletionOverlay";
import { StreakMilestoneOverlay } from "@/components/StreakMilestoneOverlay";
import { checkMilestones } from "@/lib/milestones";
import { TimerProvider } from "@/lib/TimerContext";
import { PremiumProvider } from "@/lib/premium";
import { AmbientSound } from "@/components/AmbientSound";
import { GuestBanner } from "@/components/GuestBanner";
import { AuthGate } from "@/components/AuthGate";
import { useTimer } from "@/lib/TimerContext";
import { hydrateMementoFromCloud, hydrateDayStartFromCloud } from "@/lib/settings";
import { hydrateFreezesFromCloud } from "@/lib/streakFreezes";
import { supabase, handleAccountSwitchIfNeeded } from "@/lib/supabase";
import { hydrateGoalsFromRemote, reclaimOrphanedGoals } from "@/lib/goals";
import { hydrateRhythmsFromRemote } from "@/lib/rhythms";
import { getUnlockedFreeSound, setUnlockedFreeSound } from "@/lib/freeSound";
import { hydrateProjectSettingsFromRemote } from "@/lib/projects";
import i18nInstance, { detectStoredLanguage } from "@/lib/i18n";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Focus Hourglass — Aesthetic Deep Work, Pomodoro & Virtual Focus Room" },
      { name: "description", content: "Boost your productivity with minimalist focus timers, custom rhythms, Memento Mori, and social focus rooms." },
      { name: "author", content: "Focus Hourglass" },
      { property: "og:title", content: "Focus Hourglass — Aesthetic Deep Work, Pomodoro & Virtual Focus Room" },
      { property: "og:description", content: "Boost your productivity with minimalist focus timers, custom rhythms, Memento Mori, and social focus rooms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      
      { name: "twitter:title", content: "Focus Hourglass — Aesthetic Deep Work, Pomodoro & Virtual Focus Room" },
      { name: "twitter:description", content: "Boost your productivity with minimalist focus timers, custom rhythms, Memento Mori, and social focus rooms." },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Inter:wght@300;400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function GlobalAmbientSound() {
  const { phase } = useTimer();
  return <AmbientSound running={phase === "running"} />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <AppRuntime />
      </AuthGate>
    </QueryClientProvider>
  );
}

function AppRuntime() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLanding = pathname === "/";
  useRealtimeSessions();

  // Apply the stored/browser language only after hydration; SSR always
  // renders "en", so switching earlier causes a hydration mismatch.
  useEffect(() => {
    // Defer past the hydration commit — switching during hydration causes a
    // server/client text mismatch in the sidebar labels.
    let raf2 = 0;
    // Two animation frames + a macrotask: lazy route chunks hydrate after the
    // root commits, so switching earlier mismatches their SSR text.
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        id = window.setTimeout(() => {
          const lang = detectStoredLanguage();
          if (lang !== i18nInstance.language) void i18nInstance.changeLanguage(lang);
        }, 120);
      });
    });
    let id = 0;
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    const run = () => checkMilestones();
    run();
    window.addEventListener("hourglass:sessions", run);
    window.addEventListener("hourglass:settings", run);
    return () => {
      window.removeEventListener("hourglass:sessions", run);
      window.removeEventListener("hourglass:settings", run);
    };
  }, []);

  // Hydrate app-config tables (goals, custom_rhythms, project_settings) from
  // Supabase whenever we have a signed-in session. DB is the source of truth;
  // localStorage is just an offline cache used between hydrations.
  useEffect(() => {
    let lastUserId: string | null | undefined = undefined;
    const hydrateFor = (uid: string | null) => {
      // Only re-hydrate when the effective user actually changes. Supabase
      // fires SIGNED_IN / TOKEN_REFRESHED on tab focus in some versions,
      // which would otherwise race against optimistic writes and blank the
      // UI if the query returns an empty result mid-restore.
      if (lastUserId === uid) return;
      lastUserId = uid;
      if (!uid) return;
      void hydrateGoalsFromRemote();
      void hydrateRhythmsFromRemote();
      // Project settings first, then an exact-match reclaim (slug/id hits
      // only). Untagged goals are NEVER auto-assigned — the user assigns
      // them manually from the Projects page.
      void hydrateProjectSettingsFromRemote()
        .then(() => reclaimOrphanedGoals());
      // Memento Mori mode + demographics live on the auth profile.
      void hydrateMementoFromCloud();
      // Custom day-start hour + streak freeze balance follow the account.
      void hydrateDayStartFromCloud();
      void hydrateFreezesFromCloud();
      // Restore the user's free ambient-sound unlock from cloud metadata
      // (local caches are wiped on sign-out / account switch).
      void supabase.auth.getUser().then(({ data }) => {
        const meta = data.user?.user_metadata as
          | { unlocked_free_sound_id?: string | null }
          | undefined;
        if (meta?.unlocked_free_sound_id && !getUnlockedFreeSound()) {
          setUnlockedFreeSound(meta.unlocked_free_sound_id);
        }
      });
    };
    void supabase.auth.getSession().then(({ data }) => {
      hydrateFor(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      handleAccountSwitchIfNeeded(uid);
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        hydrateFor(uid);
      } else if (event === "SIGNED_OUT") {
        lastUserId = null;
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);



  return (
    <TimerProvider>
      <PremiumProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        {!isLanding && <GuestBanner />}
        <Outlet />
        {/* Mounted once at the root so ambient audio keeps playing across
            navigation; the UI portals into the timer page when visible. */}
        <GlobalAmbientSound />
        <Toaster position="bottom-center" />
        {!isLanding && (
          <>
            <MilestoneOverlay />
            <OnboardingOverlay />
            <Day5RewardOverlay />
            <GoalCompletionOverlay />
            <StreakMilestoneOverlay />
          </>
        )}
      </PremiumProvider>
    </TimerProvider>
  );
}
