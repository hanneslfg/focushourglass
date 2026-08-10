import { createFileRoute, Link } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";
import { DailyLogSidebar } from "@/components/DailyLogSidebar";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { TimerView } from "@/components/TimerView";

const TITLE = "Focus Hourglass — Aesthetic Deep Work, Pomodoro & Virtual Focus Room";
const DESCRIPTION =
  "Boost your productivity with minimalist focus timers, custom rhythms, Memento Mori, and social focus rooms.";
const URL = "https://www.focushourglass.com/";
const OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c2e3f20e-03f4-4783-b42d-6bb55b5a1592/id-preview-f372b578--c58e05b9-28c8-4b4a-9943-bced0d439556.lovable.app-1780490616026.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [
      { rel: "canonical", href: URL },
      { rel: "icon", href: "/favicon.ico" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Focus Hourglass",
          url: URL,
          applicationCategory: "ProductivityApplication",
          operatingSystem: "Web",
          description: DESCRIPTION,
        }),
      },
    ],
  }),
  component: Index,
});


function Index() {
  return (
    <main className="min-h-screen flex bg-background text-foreground pb-20 md:pb-0">
      <Sidebar />
      <TimerView />
      <DailyLogSidebar />
      <SettingsSidebar />
      <nav
        aria-label="Legal"
        className="hidden md:flex fixed bottom-3 left-1/2 -translate-x-1/2 z-10 items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/30"
      >
        <Link to="/privacy" className="hover:text-muted-foreground transition-colors">
          Privacy
        </Link>
        <span aria-hidden className="opacity-40">·</span>
        <Link to="/terms" className="hover:text-muted-foreground transition-colors">
          Terms
        </Link>
      </nav>
    </main>
  );
}
