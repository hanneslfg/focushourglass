import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FullScreenActivity, type View as ActivityView } from "@/components/ActivityGraph";
import { Sidebar } from "@/components/Sidebar";
import { StatsSidebar } from "@/components/StatsSidebar";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { TimerView } from "@/components/TimerView";
import { getSessions, type Session } from "@/lib/sessions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hourglass — Focus on one thing" },
      {
        name: "description",
        content:
          "A minimal productivity timer. Name your one thing, set the sand flowing, focus.",
      },
      { property: "og:title", content: "Hourglass" },
      { property: "og:description", content: "A minimal productivity timer." },
    ],
  }),
  component: Index,
});

function Index() {
  const [statsOpen, setStatsOpen] = useState(false);
  const [activityView, setActivityView] = useState<ActivityView>("month");
  const [sessions] = useState<Session[]>(() => getSessions());
  const fullScreenMode = activityView === "year" ? "12m" : activityView === "all" ? "all" : null;

  if (fullScreenMode) {
    return <FullScreenActivity mode={fullScreenMode} sessions={sessions} onClose={() => setActivityView("month")} />;
  }

  return (
    <main className="min-h-screen flex bg-background text-foreground pb-20 md:pb-0">
      <Sidebar />
      <TimerView />
      <StatsSidebar
        open={statsOpen}
        onOpenChange={setStatsOpen}
        activityView={activityView}
        onActivityViewChange={setActivityView}
      />
      <SettingsSidebar />
    </main>
  );
}
