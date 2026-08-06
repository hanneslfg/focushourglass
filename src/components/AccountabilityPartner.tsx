import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Flame,
  Link2,
  Lock,
  Send,
  Sparkle,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useTimer } from "@/lib/TimerContext";
import { getTodayGoal, getTodayFocusedMinutes } from "@/lib/settings";
import { getDailyStreak } from "@/lib/streaks";
import {
  PARTNERS_EVENT,
  addPartner,
  pendingInviteCode,
  fmtHM,
  getMyDisplayName,
  getPartners,
  inviteUrl,
  removePartner,
  setPartnerPerms,
  type Partner,
} from "@/lib/partners";
import { BuddyInviteOnboarding } from "@/components/BuddyInviteOnboarding";
import { useFocusRoom, type BuddyState } from "@/lib/focusRoom";


function fmtAgo(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusMeta(b: BuddyState) {
  if (b.status === "focusing")
    return { dot: "bg-emerald-400", label: "Focusing", tone: "text-emerald-300/90" };
  if (b.status === "break")
    return { dot: "bg-amber-300", label: "On break", tone: "text-amber-200/90" };
  return { dot: "bg-muted-foreground/40", label: "Offline", tone: "text-muted-foreground" };
}

export function AccountabilityPartner() {
  const { phase, blockKind, task, project, remaining } = useTimer();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [mine, setMine] = useState(0);
  const [streak, setStreak] = useState(0);
  const [goalMinutes, setGoalMinutes] = useState(180);
  const [view, setView] = useState<"none" | "list" | "room">("none");
  const [activeFriend, setActiveFriend] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [myName, setMyName] = useState("Focus Buddy");

  const sync = useCallback(() => {
    setPartners(getPartners());
    setMine(getTodayFocusedMinutes());
    setStreak(getDailyStreak());
    setGoalMinutes(getTodayGoal());
    setMyName(getMyDisplayName());
  }, []);

  useEffect(() => {
    setInvite(pendingInviteCode());
    sync();
    window.addEventListener(PARTNERS_EVENT, sync);
    window.addEventListener("hourglass:sessions", sync);
    window.addEventListener("hourglass:settings", sync);
    return () => {
      window.removeEventListener(PARTNERS_EVENT, sync);
      window.removeEventListener("hourglass:sessions", sync);
      window.removeEventListener("hourglass:settings", sync);
    };
  }, [sync]);

  const running = phase === "running";
  const myStatus = running
    ? blockKind === "break"
      ? ("break" as const)
      : ("focusing" as const)
    : phase === "paused"
      ? ("break" as const)
      : ("offline" as const);

  const meState = useMemo(
    () => ({
      status: myStatus,
      task: task || undefined,
      project: project?.name,
      remainingSec: running ? Math.max(0, Math.round(remaining)) : undefined,
      goalMinutes,
      displayName: myName,
    }),
    [myStatus, task, project?.name, remaining, running, goalMinutes, myName],
  );


  const { buddies, messages, sendMessage, roomMinutes } = useFocusRoom(
    meState,
    partners.length > 0,
  );

  const onlineCount = buddies.filter((b) => b.status !== "offline").length;

  return (
    <>
      <button
        type="button"
        onClick={() => (partners.length ? setRoomOpen(true) : setInviteOpen(true))}
        className="w-full max-w-md rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.015] backdrop-blur-md px-5 py-5 text-left transition-all hover:border-amber-200/25 hover:from-white/[0.07]"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
            Accountability
          </span>
          {partners.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/80">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  onlineCount ? "bg-emerald-400" : "bg-muted-foreground/40"
                }`}
              />
              {onlineCount} online
            </span>
          )}
        </div>

        <div className="mt-3 font-display text-xl tracking-tight text-foreground/95">
          Virtual Focus Room
        </div>

        {partners.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Invite a partner and focus side by side — shared progress, streaks
            and a distraction-safe chat.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Metric label="You" value={fmtHM(mine)} />
              <Metric label="Room" value={fmtHM(roomMinutes)} />
              <Metric label="Buddies" value={String(partners.length)} />
            </div>
            <div className="mt-4 space-y-2">
              {buddies.slice(0, 3).map((b) => {
                const s = statusMeta(b);
                return (
                  <div key={b.code} className="flex items-center gap-2 text-[11px]">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.dot}`} />
                    <span className="truncate text-foreground/85">{b.name}</span>
                    <span className={`ml-auto shrink-0 tabular-nums ${s.tone}`}>
                      {b.sharesProgress ? fmtHM(b.minutes) : s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-4 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-200/80">
          {partners.length ? "Enter focus room" : "Invite a partner"}
          <Sparkle className="h-3 w-3" strokeWidth={1.75} />
        </div>
      </button>

      {invite && (
        <BuddyInviteOnboarding
          code={invite}
          onDismiss={() => setInvite(null)}
          onAccepted={() => {
            setInvite(null);
            sync();
            setRoomOpen(true);
          }}
        />
      )}


      {inviteOpen && (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onLinked={() => {
            setInviteOpen(false);
            sync();
          }}
        />
      )}

      {roomOpen && (
        <FocusRoomModal
          buddies={buddies}
          partners={partners}
          mine={mine}
          streak={streak}
          goalMinutes={goalMinutes}
          roomMinutes={roomMinutes}
          messages={messages}
          onSend={sendMessage}
          chatLocked={running}
          onClose={() => setRoomOpen(false)}
          onInvite={() => {
            setRoomOpen(false);
            setInviteOpen(true);
          }}
        />
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
        {label}
      </div>
      <div className="font-display text-lg tabular-nums tracking-tight">{value}</div>
    </div>
  );
}

function Shell({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
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
      <div
        className={`relative w-full ${wide ? "max-w-lg" : "max-w-md"} max-h-[88vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-card shadow-2xl p-5`}
      >
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl tracking-tight">{title}</h3>
            {subtitle && (
              <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
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
    <Shell
      title="Accountability partners"
      subtitle="Focus together, quietly."
      onClose={onClose}
    >
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        Send your invite link to a friend. When they open it you're linked and
        can see each other's focus in the Virtual Focus Room.
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
        {error && <p className="text-[11px] text-destructive">{error}</p>}
        <button
          type="button"
          onClick={() => {
            if (addPartner(code, name)) onLinked();
            else setError("Enter a valid, new buddy code (not your own).");
          }}
          className="w-full rounded-lg border border-border px-3 py-2.5 text-sm hover:border-foreground/60 transition-colors"
        >
          Link partner
        </button>
      </div>
    </Shell>
  );
}

function FocusRoomModal({
  buddies,
  partners,
  mine,
  streak,
  goalMinutes,
  roomMinutes,
  messages,
  onSend,
  chatLocked,
  onClose,
  onInvite,
}: {
  buddies: BuddyState[];
  partners: Partner[];
  mine: number;
  streak: number;
  goalMinutes: number;
  roomMinutes: number;
  messages: { id: string; name: string; text: string; at: string; mine: boolean }[];
  onSend: (text: string) => void;
  chatLocked: boolean;
  onClose: () => void;
  onInvite: () => void;
}) {
  const [openPerms, setOpenPerms] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatLocked) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, chatLocked]);

  const hours = (roomMinutes / 60).toFixed(1);

  return (
    <Shell
      wide
      title="Virtual Focus Room"
      subtitle={`Together you focused for ${hours} hours today.`}
      onClose={onClose}
    >
      {/* You */}
      <div className="rounded-xl border border-amber-200/20 bg-amber-200/[0.04] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground/90">You</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-200/90">
            <Flame className="h-3 w-3" strokeWidth={1.75} />
            {streak} day streak
          </span>
        </div>
        <Progress value={mine} max={goalMinutes} />
        <div className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
          {fmtHM(mine)} / {fmtHM(goalMinutes)} today
        </div>
      </div>

      {/* Buddies */}
      <div className="mt-4 space-y-2">
        {buddies.map((b) => {
          const s = statusMeta(b);
          const partner = partners.find((p) => p.code === b.code);
          const isOpen = openPerms === b.code;
          return (
            <div
              key={b.code}
              className="rounded-xl border border-border bg-background/40 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenPerms(isOpen ? null : b.code)}
                className="w-full px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${s.dot}`} />
                    <span className="truncate text-sm text-foreground/90">{b.name}</span>
                  </span>
                  <span className={`shrink-0 text-[11px] ${s.tone}`}>
                    {b.status === "focusing" && b.remainingSec != null
                      ? `Focusing · ${Math.ceil(b.remainingSec / 60)}m left`
                      : b.status === "offline"
                        ? `Offline · ${fmtAgo(b.lastActiveAt)}`
                        : s.label}
                  </span>
                </div>
                {b.sharesTasks && (b.task || b.project) && (
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {b.task || "Focus block"}
                    {b.project ? ` · ${b.project}` : ""}
                  </div>
                )}
                <Progress value={b.minutes} max={b.goalMinutes || goalMinutes} />
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                  <span>{b.sharesProgress ? `${fmtHM(b.minutes)} today` : "Progress hidden"}</span>
                  {b.sharesProgress && (
                    <span className="inline-flex items-center gap-1 text-amber-200/85">
                      <Flame className="h-3 w-3" strokeWidth={1.75} />
                      {b.streak} day streak
                    </span>
                  )}
                </div>
              </button>

              {isOpen && partner && (
                <div className="border-t border-border px-4 py-3 space-y-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    What {partner.name} can see
                  </div>
                  <PermToggle
                    label="Share daily progress & streak"
                    hint="Focus hours completed today and your streak count."
                    on={partner.perms.progress}
                    onToggle={() =>
                      setPartnerPerms(partner.code, { progress: !partner.perms.progress })
                    }
                  />
                  <PermToggle
                    label="Share task details"
                    hint="Active project names and task titles."
                    on={partner.perms.tasks}
                    onToggle={() =>
                      setPartnerPerms(partner.code, { tasks: !partner.perms.tasks })
                    }
                  />
                  <PermToggle
                    label="Share live online status"
                    hint="Broadcast Focusing / On break / Offline."
                    on={partner.perms.live}
                    onToggle={() =>
                      setPartnerPerms(partner.code, { live: !partner.perms.live })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removePartner(partner.code)}
                    className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                    Unlink
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quiet chat */}
      <section className="mt-5 pt-4 border-t border-border">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Quiet chat
          </span>
          {chatLocked && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-200/80">
              <Lock className="h-3 w-3" strokeWidth={1.75} />
              Locked
            </span>
          )}
        </div>

        <div
          ref={listRef}
          className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background/40 p-3 space-y-2"
        >
          {messages.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/70 italic">
              No messages yet — say hi during your next break.
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="text-[12px] leading-relaxed">
                <span className={m.mine ? "text-amber-200/90" : "text-foreground/85"}>
                  {m.mine ? "You" : m.name}
                </span>
                <span className="text-muted-foreground"> · {m.text}</span>
              </div>
            ))
          )}
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground/80">
          🔒 Chat is locked during focus sessions to preserve Deep Work.
        </p>

        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (chatLocked || !draft.trim()) return;
            onSend(draft);
            setDraft("");
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 300))}
            disabled={chatLocked}
            placeholder={chatLocked ? "Locked while focusing…" : "Message your buddies"}
            className="flex-1 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm outline-none focus:border-foreground/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={chatLocked || !draft.trim()}
            className="h-10 w-10 shrink-0 rounded-lg border border-border flex items-center justify-center hover:border-foreground/60 transition-colors disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </form>
      </section>

      <button
        type="button"
        onClick={onInvite}
        className="mt-4 w-full rounded-lg border border-border px-3 py-2.5 text-sm hover:border-foreground/60 transition-colors inline-flex items-center justify-center gap-2"
      >
        <UserPlus className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
        Invite another buddy
      </button>
    </Shell>
  );
}

function Progress({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className="h-full rounded-full bg-amber-300/70 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function PermToggle({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-[13px] text-foreground/90">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          on ? "bg-amber-300/80" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
