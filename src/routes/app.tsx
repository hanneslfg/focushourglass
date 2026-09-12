import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";
import { DailyLogSidebar } from "@/components/DailyLogSidebar";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { TimerView } from "@/components/TimerView";
import { AuthGate } from "@/components/AuthGate";

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
    <AuthGate>
      <main className="min-h-screen flex bg-background text-foreground pb-20 md:pb-0">
        <Sidebar />
        <TimerView />
        <DailyLogSidebar />
        <SettingsSidebar />
      </main>
    </AuthGate>
  );
}
