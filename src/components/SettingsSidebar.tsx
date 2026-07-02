import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  X,
  Volume2,
  VolumeX,
  Bell,
  Minus,
  Plus,
  Target,
} from "lucide-react";
import {
  getSettings,
  setSettings,
  type Settings,
  getTodayGoal,
  getTodayFocusedMinutes,
  setTodayOverride,
} from "@/lib/settings";
import { playClick } from "@/lib/click";

export function SettingsSidebar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("hourglass:open-settings", onOpen);
    return () => window.removeEventListener("hourglass:open-settings", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px] transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden
      />
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-full sm:w-[420px] bg-card border-r border-border shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="h-full flex flex-col">
          <header className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Preferences
              </div>
              <h2 className="font-display text-2xl tracking-tight mt-0.5 flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" strokeWidth={1.5} /> Settings
              </h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-10 w-10 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center touch-manipulation"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </header>
          <div
            className="flex-1 overflow-y-auto px-5 py-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
          >
            <SettingsPanel />
          </div>
        </div>
      </aside>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
      {children}
    </h3>
  );
}

function SettingsPanel() {
  const [settings, setLocal] = useState<Settings>({
    soundsEnabled: true,
    defaultDailyGoal: 180,
    dayStartHour: 0,
    weekStartsOn: 1,
  });
  const [goalInput, setGoalInput] = useState("180");
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );

  useEffect(() => {
    const sync = () => {
      setLocal(getSettings());
      setGoalInput(String(getSettings().defaultDailyGoal));
    };
    sync();
    if ("Notification" in window) setNotifPerm(Notification.permission);
    window.addEventListener("hourglass:settings", sync);
    return () => window.removeEventListener("hourglass:settings", sync);
  }, []);

  const [todayGoal, setTodayGoal] = useState(180);
  const [todayDone, setTodayDone] = useState(0);

  useEffect(() => {
    const sync = () => {
      setTodayGoal(getTodayGoal());
      setTodayDone(getTodayFocusedMinutes());
    };
    sync();
    window.addEventListener("hourglass:settings", sync);
    window.addEventListener("hourglass:sessions", sync);
    return () => {
      window.removeEventListener("hourglass:settings", sync);
      window.removeEventListener("hourglass:sessions", sync);
    };
  }, []);

  function toggleSounds() {
    setSettings({ soundsEnabled: !settings.soundsEnabled });
  }

  function setDayStart(h: number) {
    setSettings({ dayStartHour: Math.max(0, Math.min(4, h)) });
  }

  function setWeekStart(v: 0 | 1) {
    setSettings({ weekStartsOn: v });
  }

  function commitGoal() {
    const n = Math.max(15, Math.min(1440, Number(goalInput) || 180));
    setSettings({ defaultDailyGoal: n });
    setGoalInput(String(n));
  }

  function adjustTodayGoal(delta: number) {
    playClick();
    const next = Math.max(15, Math.min(1440, todayGoal + delta));
    setTodayOverride(next);
  }

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
  }

  return (
    <div className="space-y-7">
      <section>
        <SectionTitle>Audio</SectionTitle>
        <button
          onClick={toggleSounds}
          className="mt-3 w-full flex items-center justify-between rounded-md border border-border bg-background/40 px-4 py-3 hover:border-foreground/50 transition-colors touch-manipulation"
        >
          <span className="flex items-center gap-2.5 text-sm">
            {settings.soundsEnabled ? (
              <Volume2 className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <VolumeX className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            )}
            UI sounds
          </span>
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              settings.soundsEnabled ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${
                settings.soundsEnabled ? "translate-x-[18px]" : "translate-x-1"
              }`}
            />
          </span>
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          Master switch for click ticks and the completion gong.
        </p>
      </section>

      <section>
        <SectionTitle>Default daily goal</SectionTitle>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={15}
            max={1440}
            step={15}
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            onBlur={commitGoal}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 font-display text-xl tabular-nums text-foreground outline-none focus:border-foreground/60"
          />
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            min
          </span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          Saved locally. Defaults to 180 minutes (3h). Today&rsquo;s ad-hoc
          adjustments live alongside it and reset at midnight.
        </p>
      </section>

      <section>
        <SectionTitle>Today&rsquo;s goal</SectionTitle>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => adjustTodayGoal(-15)}
            className="h-9 w-9 rounded-full border border-border hover:border-foreground/60 active:bg-accent flex items-center justify-center touch-manipulation"
            aria-label="Lower today's goal"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
              <Target className="h-3 w-3" strokeWidth={1.75} />
              <span className="text-[10px] uppercase tracking-[0.22em]">Progress</span>
            </div>
            <div className="font-display text-xl tabular-nums tracking-tight mt-1">
              {todayDone}
              <span className="text-muted-foreground/60"> / {todayGoal}</span>
              <span className="text-xs text-muted-foreground/60 ml-1">min</span>
            </div>
            <div className="w-full h-1 rounded-full bg-border/60 overflow-hidden mt-2">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{
                  width: `${todayGoal > 0 ? Math.min(100, Math.round((todayDone / todayGoal) * 100)) : 0}%`,
                }}
              />
            </div>
          </div>
          <button
            onClick={() => adjustTodayGoal(15)}
            className="h-9 w-9 rounded-full border border-border hover:border-foreground/60 active:bg-accent flex items-center justify-center touch-manipulation"
            aria-label="Raise today's goal"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          Ad-hoc override for today only. Resets to default at midnight.
        </p>
      </section>

      <section>
        <SectionTitle>Time</SectionTitle>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">Day resets at</span>
            <select
              value={settings.dayStartHour}
              onChange={(e) => setDayStart(Number(e.target.value))}
              className="mt-1.5 w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-foreground/60"
            >
              <option value={0}>00:00 (Midnight)</option>
              <option value={1}>01:00 AM</option>
              <option value={2}>02:00 AM</option>
              <option value={3}>03:00 AM</option>
              <option value={4}>04:00 AM</option>
            </select>
          </label>
          <p className="text-[11px] text-muted-foreground/70 -mt-1">
            Late-night focus blocks completed before this hour count toward the
            previous day.
          </p>

          <label className="block">
            <span className="text-xs text-muted-foreground">Week starts on</span>
            <select
              value={settings.weekStartsOn}
              onChange={(e) => setWeekStart(Number(e.target.value) === 0 ? 0 : 1)}
              className="mt-1.5 w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-foreground/60"
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </label>
          <p className="text-[11px] text-muted-foreground/70 -mt-1">
            Controls weekly stats and the alignment of the activity grid.
          </p>
        </div>
      </section>

      <section>
        <SectionTitle>Notifications</SectionTitle>
        <div className="mt-3 rounded-md border border-border bg-background/40 px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm">
            <Bell className="h-4 w-4" strokeWidth={1.5} />
            Browser notifications
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground/70">
            We&rsquo;ll ping you the moment a session pushes you past your
            daily goal.
          </p>
          {notifPerm === "granted" && (
            <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-primary">
              Enabled
            </p>
          )}
          {notifPerm === "denied" && (
            <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Blocked in browser settings
            </p>
          )}
          {(notifPerm === "default" || notifPerm === "unsupported") && (
            <button
              onClick={enableNotifications}
              disabled={notifPerm === "unsupported"}
              className="mt-3 inline-flex items-center gap-2 px-3 min-h-9 rounded-md border border-border text-xs hover:border-foreground/60 active:bg-accent transition-colors disabled:opacity-40 touch-manipulation"
            >
              Enable notifications
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
