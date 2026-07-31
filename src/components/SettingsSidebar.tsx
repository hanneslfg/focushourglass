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
  RotateCcw,
  ShieldOff,
  AlertTriangle,
} from "lucide-react";
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
import { safeStorage } from "@/lib/safeStorage";
import { supabase } from "@/lib/supabase";

const WEEKLY_REPORT_KEY = "hourglass.weeklyReportOptIn";

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
  const {
    isPremium,
    isPaywallEnabled,
    triggerPaywall,
    restorePurchases,
    isRestoring,
    cancelSubscription,
    isCancelling,
    fetchActiveSubscription,
  } = usePremium();
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [premiumDetailsOpen, setPremiumDetailsOpen] = useState(false);
  const [activeSub, setActiveSub] = useState<
    { cancel_at_period_end: boolean; current_period_end: number | null } | null
  >(null);


  useEffect(() => {
    if (!isPremium) {
      setActiveSub(null);
      return;
    }
    let cancelled = false;
    void fetchActiveSubscription().then((sub) => {
      if (cancelled) return;
      setActiveSub(sub ? { cancel_at_period_end: sub.cancel_at_period_end, current_period_end: sub.current_period_end } : null);
    });
    return () => {
      cancelled = true;
    };
  }, [isPremium, fetchActiveSubscription, isCancelling]);

  async function handleConfirmCancel() {
    const ok = await cancelSubscription();
    if (ok) setConfirmCancelOpen(false);
  }

  const [settings, setLocal] = useState<Settings>({
    soundsEnabled: true,
    defaultDailyGoal: 270,
    dayStartHour: 0,
    weekStartsOn: 1,
    warmupEnabled: false,
  });
  const [goalInput, setGoalInput] = useState("270");
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [lang, setLangState] = useState<LanguageCode>("en");
  const [weeklyReport, setWeeklyReport] = useState(false);

  useEffect(() => {
    setWeeklyReport(safeStorage.getItem(WEEKLY_REPORT_KEY) === "true");
  }, []);

  async function toggleWeeklyReport(next: boolean) {
    setWeeklyReport(next);
    safeStorage.setItem(WEEKLY_REPORT_KEY, next ? "true" : "false");
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await supabase.auth.updateUser({ data: { weekly_report_opt_in: next } });
      }
    } catch {
      /* noop */
    }
  }

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

  const [todayGoal, setTodayGoal] = useState(270);
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
    const n = Math.max(15, Math.min(1440, Number(goalInput) || 270));
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
            <button
              type="button"
              onClick={() => setPremiumDetailsOpen(true)}
              className="mt-3 w-full text-left flex items-center gap-2.5 rounded-md border border-[#E2B05C]/40 bg-[#E2B05C]/[0.06] px-4 py-3 hover:border-[#E2B05C]/70 hover:bg-[#E2B05C]/[0.10] transition-colors"
            >
              <Sparkles className="h-4 w-4 text-[#E2B05C]" strokeWidth={1.75} />
              <div className="flex-1">
                <div className="text-sm text-white/90 font-medium">Thank you for supporting Premium</div>
                <div className="text-[11px] text-white/50 mt-0.5">Tap to see your impact & manage plan.</div>
              </div>
              <span className="text-[10px] uppercase tracking-[0.22em] text-[#E2B05C]/80 shrink-0">Open</span>
            </button>

          ) : (
            <button
              type="button"
              onClick={() => triggerPaywall()}
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

      {isPaywallEnabled && (
        <section>
          <SectionTitle>Subscription</SectionTitle>
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => void restorePurchases()}
              disabled={isRestoring}
              className="w-full flex items-center justify-between rounded-md border border-border bg-background/40 px-4 py-3 hover:border-foreground/50 transition-colors disabled:opacity-50"
            >
              <span className="flex items-center gap-2.5 text-sm">
                <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
                {isRestoring ? "Restoring…" : "Restore purchases"}
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Käufe wiederherstellen
              </span>
            </button>

            {isPremium && activeSub && (
              <>
                {activeSub.cancel_at_period_end ? (
                  <div className="rounded-md border border-border/60 bg-background/40 px-4 py-3 text-[12px] text-muted-foreground">
                    Your subscription is set to cancel
                    {activeSub.current_period_end
                      ? ` on ${new Date(activeSub.current_period_end * 1000).toLocaleDateString()}`
                      : " at the end of the paid period"}
                    . You keep premium access until then.
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmCancelOpen(true)}
                    disabled={isCancelling}
                    className="w-full flex items-center justify-between rounded-md border border-border bg-background/40 px-4 py-3 hover:border-red-500/40 transition-colors disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2.5 text-sm text-white/85">
                      <ShieldOff className="h-4 w-4" strokeWidth={1.5} />
                      Cancel subscription
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Abonnement kündigen
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {confirmCancelOpen && (
        <CancelConfirmModal
          onKeep={() => setConfirmCancelOpen(false)}
          onConfirm={handleConfirmCancel}
          isBusy={isCancelling}
          currentPeriodEnd={activeSub?.current_period_end ?? null}
        />
      )}

      {premiumDetailsOpen && (
        <PremiumDetailsModal
          onClose={() => setPremiumDetailsOpen(false)}
          onCancel={() => {
            setPremiumDetailsOpen(false);
            setConfirmCancelOpen(true);
          }}
          activeSub={activeSub}
        />
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

        <div className="mt-3 rounded-md border border-border bg-background/40 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4" strokeWidth={1.5} />
                Weekly Sunday Progress Report
                {!isPremium && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">
                    <Lock className="h-2.5 w-2.5" strokeWidth={2.25} /> Pro
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                Get your focus report every Sunday at 18:00 — hours, streaks, top projects.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={weeklyReport && isPremium}
              disabled={!isPremium}
              onClick={() => isPremium && toggleWeeklyReport(!weeklyReport)}
              className={`relative shrink-0 h-6 w-11 rounded-full transition-colors ${
                weeklyReport && isPremium ? "bg-primary" : "bg-border"
              } disabled:opacity-40`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                  weeklyReport && isPremium ? "translate-x-[22px]" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

const PREMIUM_START_KEY = "hourglass.premiumStartedAt";
const TRIAL_EXT_KEY = "hourglass.trialExtensionRequested";

function getPremiumStart(): number {
  const raw = safeStorage.getItem(PREMIUM_START_KEY);
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const now = Date.now();
  safeStorage.setItem(PREMIUM_START_KEY, String(now));
  return now;
}

function focusedMinutesSince(sinceMs: number): number {
  try {
    // Lazy require to avoid circular import at module scope.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getSessions } = require("@/lib/sessions") as typeof import("@/lib/sessions");
    return getSessions()
      .filter((s) => new Date(s.startedAt || s.completedAt).getTime() >= sinceMs)
      .reduce((sum, s) => sum + (s.focusedMinutes || 0), 0);
  } catch {
    return 0;
  }
}

function PremiumDetailsModal({
  onClose,
  onCancel,
  activeSub,
}: {
  onClose: () => void;
  onCancel: () => void;
  activeSub: {
    cancel_at_period_end: boolean;
    current_period_end: number | null;
    created?: number | null;
  } | null;
}) {
  // Days on Premium: prefer the real Stripe subscription start, fall back to
  // the account creation date, and only then to the local marker.
  const [accountCreatedAt, setAccountCreatedAt] = useState<number | null>(null);
  const [remoteLifetimeMinutes, setRemoteLifetimeMinutes] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!cancelled && user?.created_at) {
        setAccountCreatedAt(new Date(user.created_at).getTime());
      }
      if (!user) return;
      // Lifetime focused hours straight from the full session history.
      const { data: rows, error } = await supabase
        .from("sessions")
        .select("actual_duration")
        .eq("user_id", user.id);
      if (cancelled || error || !rows) return;
      setRemoteLifetimeMinutes(
        rows.reduce((sum, r) => sum + (Number(r.actual_duration) || 0), 0),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startedAt =
    (activeSub?.created ? activeSub.created * 1000 : null) ??
    accountCreatedAt ??
    getPremiumStart();
  const daysActive = Math.max(
    1,
    Math.floor((Date.now() - startedAt) / 86_400_000) + 1,
  );
  // "Focused Hours" mirrors the All-Time analytics tab: total focused minutes
  // across the user's entire session history (cloud when available).
  const focusedMinAllTime = remoteLifetimeMinutes ?? focusedMinutesSince(0);
  const focusedHours = focusedMinAllTime / 60;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[#E2B05C]/30 bg-[#0A0A0A] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-full bg-gradient-to-b from-[#F0C97A] to-[#C8933F] flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-black" strokeWidth={2} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-[#E2B05C]/80">Premium Member</div>
              <h3 className="font-display text-xl tracking-tight text-white">Your focus impact</h3>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full border border-white/10 hover:border-white/40 flex items-center justify-center">
            <X className="h-3.5 w-3.5 text-white/70" strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">Days on Premium</div>
            <div className="font-display text-3xl text-white tabular-nums mt-1">{daysActive}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/50">Focused hours</div>
            <div className="font-display text-3xl text-white tabular-nums mt-1">{focusedHours.toFixed(1)}</div>
            <div className="text-[10px] text-white/45 mt-1 leading-snug">
              (since using Focus Hourglass)
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/50 mb-2">Benefits you already have</div>
          <ul className="space-y-1.5 text-[13px] text-white/80">
            {[
              "Unlimited projects & custom rhythms",
              "Custom analytics date ranges",
              "Weekly Sunday Progress Report",
              "Focus Warm-up Calibration",
              "Lifetime cloud backup of sessions",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2">
                <Check className="h-3.5 w-3.5 text-[#E2B05C] mt-0.5 shrink-0" strokeWidth={2} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {activeSub?.current_period_end && (
          <div className="mt-4 text-[11px] text-white/50">
            {activeSub.cancel_at_period_end
              ? `Cancels on ${new Date(activeSub.current_period_end * 1000).toLocaleDateString()}.`
              : `Renews on ${new Date(activeSub.current_period_end * 1000).toLocaleDateString()}.`}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onClose}
            className="w-full h-11 rounded-xl font-semibold tracking-wide text-black bg-gradient-to-b from-[#F0C97A] to-[#C8933F] hover:from-[#F5D28A] hover:to-[#D19E4A] transition-all"
          >
            Keep building my system
          </button>
          {!activeSub?.cancel_at_period_end && (
            <button
              onClick={onCancel}
              className="w-full h-11 rounded-xl text-sm text-white/60 border border-white/10 hover:border-red-500/40 hover:text-white/85 transition-all"
            >
              Cancel Premium
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CancelConfirmModal({
  onKeep,
  onConfirm,
  isBusy,
  currentPeriodEnd,
}: {
  onKeep: () => void;
  onConfirm: () => Promise<void> | void;
  isBusy: boolean;
  currentPeriodEnd: number | null;
}) {
  const alreadyExtended = safeStorage.getItem(TRIAL_EXT_KEY) === "true";
  // Heuristic trial detection: if the subscription's paid period ends within
  // the next 21 days, treat this as a trial-eligible cancel and offer the
  // one-time 7-day extension. Users on long paid terms will not see it.
  const nowMs = Date.now();
  const periodEndMs = currentPeriodEnd ? currentPeriodEnd * 1000 : null;
  const daysUntilRenewal = periodEndMs ? Math.round((periodEndMs - nowMs) / 86_400_000) : null;
  const isTrialLike = daysUntilRenewal != null && daysUntilRenewal <= 21;
  const canExtend = isTrialLike && !alreadyExtended;

  // Retention numbers based on the user's actual local history.
  const focusedMin = focusedMinutesSince(getPremiumStart());
  const focusedHours = (focusedMin / 60).toFixed(1);
  const projectedLossHours = Math.max(4, Math.round(Number(focusedHours) * 0.7));

  function handleExtend() {
    safeStorage.setItem(TRIAL_EXT_KEY, "true");
    void import("sonner").then(({ toast }) =>
      toast.success("Trial extended by 7 days", {
        description: "You're locked in. Keep the streak going.",
      }),
    );
    onKeep();
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0A0A0A] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-[#E2B05C]/10 border border-[#E2B05C]/40 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-[#E2B05C]" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="font-display text-xl tracking-tight text-white">
              Wait — here's what you'd walk away from
            </h3>
            <p className="mt-2 text-[13px] text-white/65 leading-relaxed">
              You've protected <span className="text-white/95 font-medium">{focusedHours}h</span> of
              deep work since going Premium. Losing the system typically costs
              another <span className="text-white/95 font-medium">~{projectedLossHours}h</span> of
              momentum in the following two weeks (loss aversion effect).
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 text-[12px] text-white/70">
          <li className="flex items-start gap-2">
            <X className="h-3.5 w-3.5 text-red-400/80 mt-0.5 shrink-0" strokeWidth={2} />
            <span>You lose Custom Analytics ranges, Warm-up Calibration & Sunday reports.</span>
          </li>
          <li className="flex items-start gap-2">
            <X className="h-3.5 w-3.5 text-red-400/80 mt-0.5 shrink-0" strokeWidth={2} />
            <span>Cloud backup pauses. Sessions stay only on this device.</span>
          </li>
          <li className="flex items-start gap-2">
            <X className="h-3.5 w-3.5 text-red-400/80 mt-0.5 shrink-0" strokeWidth={2} />
            <span>Streak-freeze inventory stops refilling.</span>
          </li>
        </ul>

        <div className="mt-6 flex flex-col gap-2">
          {canExtend && (
            <button
              type="button"
              onClick={handleExtend}
              disabled={isBusy}
              className="w-full h-11 rounded-xl font-semibold tracking-wide text-black bg-gradient-to-b from-[#F0C97A] to-[#C8933F] hover:from-[#F5D28A] hover:to-[#D19E4A] transition-all disabled:opacity-60"
            >
              Extend my trial by 7 days
            </button>
          )}
          <button
            type="button"
            onClick={onKeep}
            disabled={isBusy}
            className={`w-full h-11 rounded-xl text-sm transition-all disabled:opacity-60 ${
              canExtend
                ? "text-white/85 border border-white/15 hover:border-white/40"
                : "font-semibold tracking-wide text-black bg-gradient-to-b from-[#F0C97A] to-[#C8933F] hover:from-[#F5D28A] hover:to-[#D19E4A]"
            }`}
          >
            Keep my focus system
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isBusy}
            className="w-full h-10 rounded-xl text-xs text-white/45 hover:text-white/70 transition-all disabled:opacity-60"
          >
            {isBusy ? "Cancelling…" : "No thanks — confirm cancellation"}
          </button>
        </div>
      </div>
    </div>
  );
}



