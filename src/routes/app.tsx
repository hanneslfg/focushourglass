import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { DailyLogSidebar } from "@/components/DailyLogSidebar";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { TimerView } from "@/components/TimerView";
import { useAuthState } from "@/components/AuthGate";

const TITLE = "Focus Hourglass App — Deep Work Timer & Daily Focus Budget";
const DESCRIPTION =
  "Your three 90-minute focus blocks, live timer, agenda, project goals and analytics — the Focus Hourglass workspace.";
const URL = "https://www.focushourglass.com/app";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }, { rel: "icon", href: "/favicon.ico" }],
  }),
  component: AppPage,
});

function AppPage() {
  return (
    <RequireSession>
      <main className="min-h-screen flex bg-background text-foreground pb-20 md:pb-0">
        <Sidebar />
        <TimerView />
        <DailyLogSidebar />
        <SettingsSidebar />
      </main>
    </RequireSession>
  );
}

function RequireSession({ children }: { children: ReactNode }) {
  const { session } = useAuthState();
  const navigate = useNavigate();

  useEffect(() => {
    if (!session) void navigate({ to: "/", replace: true });
  }, [navigate, session]);

  if (!session) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background" aria-busy="true">
        <span className="sr-only">Loading</span>
        <span className="h-6 w-6 rounded-full border border-border/60 border-t-primary animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
