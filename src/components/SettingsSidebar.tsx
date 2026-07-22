import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Settings as SettingsIcon,
  X,
  Volume2,
  VolumeX,
  Bell,
  Minus,
  Plus,
  Target,
  Eye,
  Languages,
  Sparkles,
  Check,
  Lock,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { usePremium } from "@/lib/premium";
import {
  getSettings,
  setSettings,
  type Settings,
  getTodayGoal,
  getTodayFocusedMinutes,
  setTodayOverride,
} from "@/lib/settings";
import { playClick } from "@/lib/click";
import { LegalFooter } from "@/components/LegalFooter";
import { SUPPORTED_LANGUAGES, setLanguage, getLanguage, type LanguageCode } from "@/lib/i18n";

export function SettingsSidebar() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

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
                {t("settings.preferences")}
              </div>
              <h2 className="font-display text-2xl tracking-tight mt-0.5 flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" strokeWidth={1.5} /> {t("settings.title")}
              </h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-10 w-10 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center touch-manipulation"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </header>
          <div
            className="flex-1 overflow-y-auto px-5 py-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
          >
            <SettingsPanel />
            <LegalFooter className="mt-10 pt-6 border-t border-border/40" />
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
  const { t, i18n } = useTranslation();
  const { isPremium, isPaywallEnabled, triggerPaywall, setPremiumLocal, refreshPremium } = usePremium();
  const [devCode, setDevCode] = useState("");
  const [devSubmitting, setDevSubmitting] = useState(false);

  async function submitDevCode() {
    const code = devCode.trim();
    if (!code) return;
    if (code !== "HANNES_LIFETIME_2026") {
      toast.error("Invalid developer code");
      return;
    }
    setDevSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      if (!userId) {
        toast.error("Please sign in first to unlock premium.");
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({ is_premium: true })
        .eq("user_id", userId);
      if (error) {
        console.error("[dev-bypass] update failed", error);
        toast.error("Could not unlock premium. Please try again.");
        return;
      }
      setPremiumLocal(true);
      await refreshPremium();
      setDevCode("");
      toast.success("Developer Access Granted: Lifetime Premium Unlocked! ⏳");
    } finally {
      setDevSubmitting(false);
    }
  }
  const [settings, setLocal] = useState<Settings>({
    soundsEnabled: true,
    defaultDailyGoal: 180,
    dayStartHour: 0,
    weekStartsOn: 1,
    warmupEnabled: false,
  });
  const [goalInput, setGoalInput] = useState("180");
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [lang, setLangState] = useState<LanguageCode>("en");

  useEffect(() => {
    setLangState(getLanguage());
    const onLang = () => setLangState(getLanguage());
    window.addEventListener("hourglass:lang", onLang);
    return () => window.removeEventListener("hourglass:lang", onLang);
  }, []);

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

  void i18n; // ensure re-render on language change

  return (
    <div className="space-y-7">
      {isPaywallEnabled && (
        <section>
          <SectionTitle>Premium</SectionTitle>
          {isPremium ? (
            <div className="mt-3 flex items-center gap-2.5 rounded-md border border-[#E2B05C]/40 bg-[#E2B05C]/[0.06] px-4 py-3">
              <Sparkles className="h-4 w-4 text-[#E2B05C]" strokeWidth={1.75} />
              <div className="flex-1">
                <div className="text-sm text-white/90 font-medium">Hourglass Premium active</div>
                <div className="text-[11px] text-white/50 mt-0.5">Thank you for supporting the project.</div>
              </div>
              <Check className="h-4 w-4 text-[#E2B05C]" strokeWidth={2} />
            </div>
          ) : (
            <button
              type="button"
              onClick={triggerPaywall}
              className="mt-3 w-full text-left rounded-xl p-[1px] bg-gradient-to-b from-[#E2B05C]/70 via-[#E2B05C]/25 to-[#E2B05C]/50 shadow-[0_10px_30px_-15px_rgba(226,176,92,0.55)] transition-all hover:from-[#F0C97A]/80 hover:to-[#C8933F]/70 active:scale-[0.99] touch-manipulation"
            >
              <div className="rounded-[11px] bg-[#0F0F0F] px-4 py-3.5 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-b from-[#F0C97A] to-[#C8933F] flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-black" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#E2B05C]">Upgrade to Premium</div>
                  <div className="text-[11px] text-white/55 mt-0.5">Unlimited projects, reports, white noise & more.</div>
                </div>
                <span className="text-[10px] uppercase tracking-[0.22em] text-[#E2B05C]/80 shrink-0">Go</span>
              </div>
            </button>
          )}
        </section>
      )}

      <section>
        <SectionTitle>{t("settings.language")}</SectionTitle>
        <div className="mt-3 flex items-center gap-2">
          <Languages className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <select
            value={lang}
            onChange={(e) => {
              const next = e.target.value as LanguageCode;
              setLanguage(next);
              setLangState(next);
            }}
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-foreground/60"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          {t("settings.languageHint")}
        </p>
      </section>

      <section>
        <SectionTitle>{t("settings.audio")}</SectionTitle>
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
            {t("settings.uiSounds")}
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
          {t("settings.audioHint")}
        </p>
      </section>

      <section>
        <SectionTitle>Focus Warm-up Calibration</SectionTitle>
        <button
          onClick={() => {
            if (!isPremium && !settings.warmupEnabled) {
              triggerPaywall();
              return;
            }
            setSettings({ warmupEnabled: !settings.warmupEnabled });
          }}
          className="mt-3 w-full flex items-center justify-between rounded-md border border-border bg-background/40 px-4 py-3 hover:border-foreground/50 transition-colors touch-manipulation"
        >
          <span className="flex items-center gap-2.5 text-sm">
            <Eye className="h-4 w-4" strokeWidth={1.5} />
            {t("settings.warmupToggle")}
            {!isPremium && (
              <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-[#E2B05C]/90 border border-[#E2B05C]/40 rounded-full px-1.5 py-0.5 ml-1">
                <Lock className="h-2.5 w-2.5" strokeWidth={2.25} /> Premium
              </span>
            )}
          </span>
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              settings.warmupEnabled && isPremium ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${
                settings.warmupEnabled && isPremium ? "translate-x-[18px]" : "translate-x-1"
              }`}
            />
          </span>
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          A pre-session breathing & focus calibration ritual to prime your attention before the timer starts. {t("settings.warmupHint")}
        </p>
      </section>


      <section>
        <SectionTitle>{t("settings.defaultDailyGoal")}</SectionTitle>
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
            {t("common.min")}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          {t("settings.defaultDailyGoalHint")}
        </p>
      </section>

      <section>
        <SectionTitle>{t("settings.todaysGoal")}</SectionTitle>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => adjustTodayGoal(-15)}
            className="h-9 w-9 rounded-full border border-border hover:border-foreground/60 active:bg-accent flex items-center justify-center touch-manipulation"
            aria-label={t("settings.lowerToday")}
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
              <Target className="h-3 w-3" strokeWidth={1.75} />
              <span className="text-[10px] uppercase tracking-[0.22em]">{t("settings.progress")}</span>
            </div>
            <div className="font-display text-xl tabular-nums tracking-tight mt-1">
              {todayDone}
              <span className="text-muted-foreground/60"> / {todayGoal}</span>
              <span className="text-xs text-muted-foreground/60 ml-1">{t("common.min")}</span>
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
            aria-label={t("settings.raiseToday")}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          {t("settings.todaysGoalHint")}
        </p>
      </section>

      <section>
        <SectionTitle>{t("settings.time")}</SectionTitle>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">{t("settings.dayResetsAt")}</span>
            <select
              value={settings.dayStartHour}
              onChange={(e) => setDayStart(Number(e.target.value))}
              className="mt-1.5 w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-foreground/60"
            >
              <option value={0}>00:00 ({t("settings.midnight")})</option>
              <option value={1}>01:00</option>
              <option value={2}>02:00</option>
              <option value={3}>03:00</option>
              <option value={4}>04:00</option>
            </select>
          </label>
          <p className="text-[11px] text-muted-foreground/70 -mt-1">
            {t("settings.dayResetHint")}
          </p>

          <label className="block">
            <span className="text-xs text-muted-foreground">{t("settings.weekStartsOn")}</span>
            <select
              value={settings.weekStartsOn}
              onChange={(e) => setWeekStart(Number(e.target.value) === 0 ? 0 : 1)}
              className="mt-1.5 w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-foreground/60"
            >
              <option value={1}>{t("settings.monday")}</option>
              <option value={0}>{t("settings.sunday")}</option>
            </select>
          </label>
          <p className="text-[11px] text-muted-foreground/70 -mt-1">
            {t("settings.weekStartHint")}
          </p>
        </div>
      </section>

      <section>
        <SectionTitle>{t("settings.notifications")}</SectionTitle>
        <div className="mt-3 rounded-md border border-border bg-background/40 px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm">
            <Bell className="h-4 w-4" strokeWidth={1.5} />
            {t("settings.browserNotifications")}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground/70">
            {t("settings.notifHint")}
          </p>
          {notifPerm === "granted" && (
            <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-primary">
              {t("settings.enabled")}
            </p>
          )}
          {notifPerm === "denied" && (
            <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {t("settings.blocked")}
            </p>
          )}
          {(notifPerm === "default" || notifPerm === "unsupported") && (
            <button
              onClick={enableNotifications}
              disabled={notifPerm === "unsupported"}
              className="mt-3 inline-flex items-center gap-2 px-3 min-h-9 rounded-md border border-border text-xs hover:border-foreground/60 active:bg-accent transition-colors disabled:opacity-40 touch-manipulation"
            >
              {t("settings.enableNotifications")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

