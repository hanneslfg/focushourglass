import { Link, useRouterState } from "@tanstack/react-router";
import { Hourglass as HourglassIcon, CalendarDays, Settings as SettingsIcon } from "lucide-react";

function openSettings() {
  window.dispatchEvent(new Event("hourglass:open-settings"));
}

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/", label: "Timer", icon: HourglassIcon },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
  ];
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-16 shrink-0 flex-col items-center border-r border-border bg-card/40 py-6 gap-2">
        <div className="mb-6 font-display text-xl tracking-tight text-foreground/90 select-none">H</div>
        {items.map((it) => {
          const active = path === it.to;
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`group flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
              aria-label={it.label}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          );
        })}
        <div className="mt-auto">
          <button
            onClick={openSettings}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label="Settings"
          >
            <SettingsIcon className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-stretch justify-around h-16">
          {items.map((it) => {
            const active = path === it.to;
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`flex flex-1 flex-col items-center justify-center gap-1 min-h-11 touch-manipulation transition-colors active:bg-accent/60 ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
                aria-label={it.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" strokeWidth={1.5} />
                <span className="text-[10px] leading-none tracking-wide">{it.label}</span>
              </Link>
            );
          })}
          <button
            onClick={openSettings}
            className="flex flex-1 flex-col items-center justify-center gap-1 min-h-11 touch-manipulation transition-colors active:bg-accent/60 text-muted-foreground"
            aria-label="Settings"
          >
            <SettingsIcon className="h-5 w-5" strokeWidth={1.5} />
            <span className="text-[10px] leading-none tracking-wide">Settings</span>
          </button>
        </div>
      </nav>
    </>
  );
}
