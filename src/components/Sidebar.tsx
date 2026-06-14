import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Hourglass as HourglassIcon,
  FolderKanban,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import {
  supabase,
  signInWithGoogle,
  signOut,
  getUserId,
  setUserId,
  migrateSessions,
} from "@/lib/supabase";

function openSettings() {
  window.dispatchEvent(new Event("hourglass:open-settings"));
}

interface AuthUser {
  email: string;
  avatar: string | null;
  name: string;
}

function useAuthUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    let mounted = true;
    function applySession(u: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined) {
      if (!u) {
        setUser(null);
        return;
      }
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const avatar =
        (typeof meta.avatar_url === "string" && meta.avatar_url) ||
        (typeof meta.picture === "string" && meta.picture) ||
        null;
      const name =
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        u.email ||
        "Signed in";
      setUser({ email: u.email ?? "", avatar, name });
      const localId = getUserId();
      if (localId && localId !== u.id) {
        migrateSessions(localId, u.id).finally(() => setUserId(u.id));
      } else {
        setUserId(u.id);
      }
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      applySession(data.session?.user as Parameters<typeof applySession>[0]);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") applySession(session?.user as Parameters<typeof applySession>[0]);
      else if (event === "SIGNED_OUT") setUser(null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return user;
}

function AvatarBlock({ collapsed = false }: { collapsed?: boolean }) {
  const user = useAuthUser();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (!user) {
    return (
      <button
        onClick={async () => {
          setBusy(true);
          await signInWithGoogle();
          setBusy(false);
        }}
        disabled={busy}
        className={`group flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/60 transition-colors disabled:opacity-50 ${
          collapsed ? "h-10 w-10" : "h-10 w-10"
        }`}
        aria-label="Sign in"
        title="Sign in with Google"
      >
        <UserIcon className="h-4 w-4" strokeWidth={1.5} />
      </button>
    );
  }

  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-10 w-10 rounded-full overflow-hidden border border-border hover:border-foreground/60 transition-colors flex items-center justify-center bg-card"
        aria-label="Account"
        title={user.name}
      >
        {user.avatar ? (
          <img
            src={user.avatar}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs font-medium text-foreground/80">{initial}</span>
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute z-50 bottom-12 left-1/2 -translate-x-1/2 md:left-12 md:translate-x-0 md:bottom-0 w-56 rounded-md border border-border bg-card shadow-lg p-2">
            <div className="px-2.5 py-2 border-b border-border mb-1">
              <div className="text-xs text-foreground truncate">{user.name}</div>
              {user.email && (
                <div className="text-[10px] text-muted-foreground truncate">
                  {user.email}
                </div>
              )}
            </div>
            <button
              onClick={async () => {
                setBusy(true);
                await signOut();
                setBusy(false);
                setOpen(false);
              }}
              disabled={busy}
              className="w-full inline-flex items-center gap-2 px-2.5 h-8 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/", label: "Timer", icon: HourglassIcon },
    { to: "/projects", label: "Projects", icon: FolderKanban },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
  ];
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-16 shrink-0 flex-col items-center border-r border-border bg-card/40 py-6 gap-2">
        <div className="mb-6 font-display text-xl tracking-tight text-foreground/90 select-none">
          H
        </div>
        {items.map((it) => {
          const active = path === it.to;
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`group flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
              aria-label={it.label}
              title={it.label}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-2">
          <button
            onClick={openSettings}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <AvatarBlock />
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
                <span className="text-[10px] leading-none tracking-wide">
                  {it.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={openSettings}
            className="flex flex-1 flex-col items-center justify-center gap-1 min-h-11 touch-manipulation transition-colors active:bg-accent/60 text-muted-foreground"
            aria-label="Settings"
          >
            <SettingsIcon className="h-5 w-5" strokeWidth={1.5} />
            <span className="text-[10px] leading-none tracking-wide">
              Settings
            </span>
          </button>
          <div className="flex flex-1 items-center justify-center">
            <AvatarBlock />
          </div>
        </div>
      </nav>
    </>
  );
}
