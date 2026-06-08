import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";
import { TimerView } from "@/components/TimerView";

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
  return (
    <main className="min-h-screen flex bg-background text-foreground pb-16 md:pb-0">
      <Sidebar />
      <TimerView />
    </main>
  );
}
