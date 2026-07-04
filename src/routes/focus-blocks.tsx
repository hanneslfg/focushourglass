import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";
import { DailyLogSidebar } from "@/components/DailyLogSidebar";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { FocusBlocksView } from "@/components/FocusBlocksView";

export const Route = createFileRoute("/focus-blocks")({
  head: () => ({
    meta: [
      { title: "Focus Blocks — Hourglass" },
      {
        name: "description",
        content:
          "Build custom focus and break rhythms. Chain intervals into an ultradian, Pomodoro, or your own pattern.",
      },
      { property: "og:title", content: "Focus Blocks — Hourglass" },
      {
        property: "og:description",
        content: "Custom multi-stage focus and break rhythms.",
      },
    ],
  }),
  component: FocusBlocksRoute,
});

function FocusBlocksRoute() {
  return (
    <main className="min-h-screen flex bg-background text-foreground pb-20 md:pb-0">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <FocusBlocksView />
      </div>
      <DailyLogSidebar />
      <SettingsSidebar />
    </main>
  );
}
