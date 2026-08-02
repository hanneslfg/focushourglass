import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { MementoMoriPage } from "@/components/MementoMori";

export const Route = createFileRoute("/memento-mori")({
  head: () => ({
    meta: [
      { title: "Memento Mori — Hourglass" },
      {
        name: "description",
        content:
          "An unpausable countdown of your estimated remaining lifetime, with a brevity-of-life perspective on the weeks and summers you have left.",
      },
      { property: "og:title", content: "Memento Mori — Hourglass" },
      {
        property: "og:description",
        content: "An unpausable life countdown to make your time visible.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MementoMoriRoute,
});

function MementoMoriRoute() {
  return (
    <main className="min-h-screen flex bg-[#08080a] text-foreground pb-20 md:pb-0">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <MementoMoriPage />
      </div>
      <SettingsSidebar />
    </main>
  );
}
