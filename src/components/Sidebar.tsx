import { Link, useRouterState } from "@tanstack/react-router";
import { Hourglass as HourglassIcon, CalendarDays } from "lucide-react";

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/", label: "Timer", icon: HourglassIcon },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
  ];
  return (
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
    </aside>
  );
}
