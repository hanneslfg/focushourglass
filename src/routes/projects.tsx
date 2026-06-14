import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FullScreenActivity, type View as ActivityView } from "@/components/ActivityGraph";
import { Sidebar } from "@/components/Sidebar";
import { StatsSidebar } from "@/components/StatsSidebar";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { ProjectsView } from "@/components/ProjectsView";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "Projects — Hourglass" },
      {
        name: "description",
        content:
          "Track long-term focus across projects: hours, activity grid, and task history.",
      },
      { property: "og:title", content: "Projects — Hourglass" },
      {
        property: "og:description",
        content: "Long-term focus tracking by project.",
      },
    ],
  }),
  component: ProjectsRoute,
});

function ProjectsRoute() {
  const [statsOpen, setStatsOpen] = useState(false);
  const [activityView, setActivityView] = useState<ActivityView>("month");
  const fullScreenMode = activityView === "year" ? "12m" : activityView === "all" ? "all" : null;

  if (fullScreenMode) {
    return <FullScreenActivity mode={fullScreenMode} sessions={[]} onClose={() => setActivityView("month")} />;
  }

  return (
    <main className="min-h-screen flex bg-background text-foreground pb-20 md:pb-0">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <ProjectsView />
      </div>
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
