import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FullScreenActivity, type View as ActivityView } from "@/components/ActivityGraph";
import { Sidebar } from "@/components/Sidebar";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { DailyLogSidebar } from "@/components/DailyLogSidebar";
import { AnalyticsView } from "@/components/AnalyticsView";
import { getSessions, type Session } from "@/lib/sessions";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Hourglass" },
      {
        name: "description",
        content:
          "Your full focus analytics: activity grid, project breakdown, and timeline.",
      },
      { property: "og:title", content: "Analytics — Hourglass" },
      {
        property: "og:description",
        content: "Full focus analytics dashboard.",
      },
    ],
  }),
  component: AnalyticsRoute,
});

function AnalyticsRoute() {
  const [activityView, setActivityView] = useState<ActivityView>("month");
  const [sessions] = useState<Session[]>(() => getSessions());
  const fullScreenMode =
    activityView === "year" ? "12m" : activityView === "all" ? "all" : null;

  if (fullScreenMode) {
    return (
      <FullScreenActivity
        mode={fullScreenMode}
        sessions={sessions}
        onClose={() => setActivityView("month")}
      />
    );
  }

  return (
    <main className="min-h-screen flex bg-background text-foreground pb-20 md:pb-0">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <AnalyticsView
          activityView={activityView}
          onActivityViewChange={setActivityView}
        />
      </div>
      <DailyLogSidebar />
      <SettingsSidebar />
    </main>
  );
}
