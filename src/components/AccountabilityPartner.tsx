import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Link2,
  Share2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { getSessions, type Session } from "@/lib/sessions";
import { effectiveDayKey, getTodayFocusedMinutes } from "@/lib/settings";
import {
  PARTNERS_EVENT,
  consumeInviteFromUrl,
  fetchPartnerActivity,
  getPartner,
  getPrivacy,
  inviteUrl,
  isActive,
  removePartner,
  setPartner,
  setPrivacy,
  type Partner,
  type PartnerActivity,
} from "@/lib/partners";

function fmtHM(mins: number) {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function AccountabilityPartner() {
  const [partner, setPartnerState] = useState<Partner | null>(null);
  const [privacy, setPrivacyState] = useState({ shareNames: true });
  const [mine, setMine] = useState(0);
  const [mySessions, setMySessions] = useState<Session[]>([]);
  const [activity, setActivity] = useState<PartnerActivity | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const syncLocal = useCallback(() => {
    setPartnerState(getPartner());
    setPrivacyState(getPrivacy());
    setMine(getTodayFocusedMinutes());
    const today = effectiveDayKey(new Date());
    setMySessions(
      getSessions()
        .filter((s) => effectiveDayKey(s.completedAt) === today)
        .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)),
    );
  }, []);

  useEffect(() => {
    consumeInviteFromUrl();
    syncLocal();
    window.addEventListener(PARTNERS_EVENT, syncLocal);
    window.addEventListener("hourglass:sessions", syncLocal);
    window.addEventListener("hourglass:settings", syncLocal);
    return () => {
      window.removeEventListener(PARTNERS_EVENT, syncLocal);
      window.removeEventListener("hourglass:sessions", syncLocal);
      window.removeEventListener("hourglass:settings", syncLocal);
    };
  }, [syncLocal]);

  useEffect(() => {
    if (!partner) {
      setActivity(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const a = await fetchPartnerActivity(partner.code);
      if (!cancelled) setActivity(a);
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [partner]);

  const online = isActive(activity?.lastActiveAt ?? null);

  return (
    <>
      {partner ? (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="w-full max-w-md rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md px-4 py-3.5 text-left transition-all hover:border-white/[0.12] hover:bg-white/[0.04]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
              Accountability
            </div>
            <span className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/80">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  online ? "bg-emerald-400/80" : "bg-muted-foreground/40"
                }`}
              />
              {online ? "Active" : "Offline"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                You
              </div>
              <div className="font-display text-2xl tabular-nums tracking-tight">
                {fmtHM(mine)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 truncate">
                {partner.name}
              </div>
              <div className="font-display text-2xl tabular-nums tracking-tight">
                {activity?.available ? fmtHM(activity.minutes) : "—"}
              </div>
            </div>
          </div>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="w-full max-w-md rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md px-4 py-3 transition-all hover:border-white/[0.12] hover:bg-white/[0.04] flex items-center justify-center gap-2"
        >
          <UserPlus className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
          <span className="text-xs text-foreground/85">Invite partner</span>
        </button>
      )}

      {inviteOpen && (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onLinked={() => {
            setInviteOpen(false);
            syncLocal();
          }}
        />
      )}

      {modalOpen && partner && (
        <PartnerModal
          partner={partner}
          privacy={privacy}
          mine={mine}
          mySessions={mySessions}
          activity={activity}
          onClose={() => setModalOpen(false)}
          onTogglePrivacy={() => setPrivacyState(setPrivacy({ shareNames: !privacy.shareNames }))}
          onUnlink={() => {
            removePartner();
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-card shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CopyRow({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="w-full rounded-lg border border-border bg-background/40 px-3 py-2.5 flex items-center gap-2 text-left hover:border-foreground/40 transition-colors"
    >
      <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        <span className="block text-xs text-foreground/85 truncate">{value}</span>
      </span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-amber-300 shrink-0" strokeWidth={2} />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" strokeWidth={1.75} />
      )}
    </button>
  );
}

function InviteModal({
  onClose,
  onLinked,
}: {
  onClose: () => void;
  onLinked: () => void;
}) {
  const url = useMemo(() => inviteUrl(), []);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  return (
    <Shell title="Accountability partner" onClose={onClose}>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        Send your invite link to a friend. When they open it, you're linked and
        can see each other's focus for the day.
      </p>
      <CopyRow value={url} label="Your invite link" />

      <div className="mt-5 space-y-2">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Or enter their buddy code
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Buddy code"
          className="w-full rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm outline-none focus:border-foreground/50"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 30))}
          placeholder="Their name (optional)"
          className="w-full rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm outline-none focus:border-foreground/50"
        />
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        <button
          type="button"
          onClick={() => {
            if (setPartner(code, name)) onLinked();
            else setError("Enter a valid buddy code (not your own).");
          }}
          className="w-full rounded-lg border border-border px-3 py-2.5 text-sm hover:border-foreground/60 transition-colors"
        >
          Link partner
        </button>
      </div>
    </Shell>
  );
}

function PartnerModal({
  partner,
  privacy,
  mine,
  mySessions,
  activity,
  onClose,
  onTogglePrivacy,
  onUnlink,
}: {
  partner: Partner;
  privacy: { shareNames: boolean };
  mine: number;
  mySessions: Session[];
  activity: PartnerActivity | null;
  onClose: () => void;
  onTogglePrivacy: () => void;
  onUnlink: () => void;
}) {
  const [shared, setShared] = useState(false);

  const summary = useMemo(() => {
    const lines = [
      `Focus Hourglass — today: ${fmtHM(mine)} across ${mySessions.length} session${mySessions.length === 1 ? "" : "s"}`,
    ];
    for (const s of mySessions) {
      const label = privacy.shareNames
        ? ` — ${s.task || "Untitled"}${s.projectName ? ` [${s.projectName}]` : ""}`
        : "";
      lines.push(`• ${fmtTime(s.completedAt)} · ${s.focusedMinutes}m${label}`);
    }
    lines.push("https://focushourglass.com");
    return lines.join("\n");
  }, [mine, mySessions, privacy.shareNames]);

  async function shareStats() {
    const data = { title: "Focus Hourglass", text: summary };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch {
      /* dismissed — fall through */
    }
    try {
      await navigator.clipboard.writeText(summary);
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Shell title="Accountability" onClose={onClose}>
      {/* Live activity feed */}
      <section>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
          Live activity feed
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-background/40 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              You
            </div>
            <div className="font-display text-2xl tabular-nums">{fmtHM(mine)}</div>
          </div>
          <div className="rounded-lg border border-border bg-background/40 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 truncate">
              {partner.name}
            </div>
            <div className="font-display text-2xl tabular-nums">
              {activity?.available ? fmtHM(activity.minutes) : "—"}
            </div>
          </div>
        </div>

        <ul className="mt-4 space-y-2">
          {mySessions.map((s) => (
            <li
              key={s.id}
              className="flex items-baseline justify-between gap-2 text-xs"
            >
              <span className="truncate text-foreground/85">
                You
                {privacy.shareNames
                  ? ` · ${s.task || "Untitled"}${s.projectName ? ` [${s.projectName}]` : ""}`
                  : " · Focus block"}
              </span>
              <span className="tabular-nums text-muted-foreground shrink-0">
                {s.focusedMinutes} min
              </span>
            </li>
          ))}
          {activity?.sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-baseline justify-between gap-2 text-xs"
            >
              <span className="truncate text-foreground/85">
                {partner.name}
                {s.task ? ` · ${s.task}${s.project ? ` [${s.project}]` : ""}` : " · Focus block"}
              </span>
              <span className="tabular-nums text-muted-foreground shrink-0">
                {s.minutes} min
              </span>
            </li>
          ))}
        </ul>

        {!activity?.available && (
          <p className="mt-3 text-[11px] text-muted-foreground/70 italic">
            Waiting for {partner.name}'s data — their sessions appear here once
            they share their focus.
          </p>
        )}
      </section>

      {/* Privacy & permissions */}
      <section className="mt-6 pt-5 border-t border-border">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
          Privacy & permissions
        </div>
        <button
          type="button"
          onClick={onTogglePrivacy}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-sm text-foreground/90">
              Share task / project names
            </span>
            <span className="block text-[11px] text-muted-foreground">
              Off still shares your focus duration.
            </span>
          </span>
          <span
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              privacy.shareNames ? "bg-amber-300/80" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all ${
                privacy.shareNames ? "left-[18px]" : "left-0.5"
              }`}
            />
          </span>
        </button>
      </section>

      {/* Share + invite */}
      <section className="mt-6 pt-5 border-t border-border space-y-3">
        <button
          type="button"
          onClick={shareStats}
          className="w-full rounded-lg border border-border px-3 py-2.5 text-sm hover:border-foreground/60 transition-colors inline-flex items-center justify-center gap-2"
        >
          {shared ? (
            <Check className="h-3.5 w-3.5 text-amber-300" strokeWidth={2} />
          ) : (
            <Share2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
          )}
          {shared ? "Summary copied" : "Share daily stats"}
        </button>
        <CopyRow value={inviteUrl()} label="Invite another buddy" />
        <button
          type="button"
          onClick={onUnlink}
          className="w-full text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-red-400 transition-colors"
        >
          Unlink partner
        </button>
      </section>
    </Shell>
  );
}
