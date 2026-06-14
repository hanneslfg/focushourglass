import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";
import { DailyLogSidebar } from "@/components/DailyLogSidebar";
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
  return (
    <main className="min-h-screen flex bg-background text-foreground pb-20 md:pb-0">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <ProjectsView />
      </div>
      <DailyLogSidebar />
      <SettingsSidebar />
    </main>
  );
}
