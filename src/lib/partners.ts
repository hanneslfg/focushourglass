import { safeStorage } from "./safeStorage";
import { getUserId } from "./supabase";
import { effectiveDayKey } from "./settings";

export interface Partner {
  /** Buddy code (their user id). */
  code: string;
  /** Friendly name the user gave them. */
  name: string;
  linkedAt: string;
}

export interface PartnerPrivacy {
  /** Share task / project names with the partner (duration is always shared). */
  shareNames: boolean;
}

export interface PartnerSessionSummary {
  id: string;
  minutes: number;
  completedAt: string;
  task?: string;
  project?: string;
}

export interface PartnerActivity {
  minutes: number;
  sessions: PartnerSessionSummary[];
  /** Last time the partner completed a session (ISO), if any. */
  lastActiveAt: string | null;
  /** True when remote data could actually be read. */
  available: boolean;
}

const PARTNER_KEY = "hourglass.partner.v1";
const PRIVACY_KEY = "hourglass.partner.privacy.v1";

export const PARTNERS_EVENT = "hourglass:partner";

function emit() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(PARTNERS_EVENT));
}

/** Your own buddy code — short, shareable, derived from your user id. */
export function myBuddyCode(): string {
  return getUserId();
}

export function inviteUrl(): string {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://focushourglass.com";
  return `${base}/?buddy=${encodeURIComponent(myBuddyCode())}`;
}

export function getPartner(): Partner | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = safeStorage.getItem(PARTNER_KEY);
    return raw ? (JSON.parse(raw) as Partner) : null;
  } catch {
    return null;
  }
}

export function setPartner(code: string, name?: string) {
  const clean = code.trim();
  if (!clean || clean === myBuddyCode()) return false;
  const partner: Partner = {
    code: clean,
    name: (name ?? "").trim() || "Your partner",
    linkedAt: new Date().toISOString(),
  };
  safeStorage.setItem(PARTNER_KEY, JSON.stringify(partner));
  emit();
  return true;
}

export function removePartner() {
  safeStorage.removeItem(PARTNER_KEY);
  emit();
}

export function getPrivacy(): PartnerPrivacy {
  if (typeof window === "undefined") return { shareNames: true };
  try {
    const raw = safeStorage.getItem(PRIVACY_KEY);
    if (!raw) return { shareNames: true };
    const parsed = JSON.parse(raw) as Partial<PartnerPrivacy>;
    return { shareNames: parsed.shareNames !== false };
  } catch {
    return { shareNames: true };
  }
}

export function setPrivacy(patch: Partial<PartnerPrivacy>) {
  const next = { ...getPrivacy(), ...patch };
  safeStorage.setItem(PRIVACY_KEY, JSON.stringify(next));
  emit();
  return next;
}

/** Pick up ?buddy=CODE from the URL and link that partner once. */
export function consumeInviteFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("buddy");
  if (!code) return false;
  const linked = getPartner() ? false : setPartner(code);
  params.delete("buddy");
  const qs = params.toString();
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
  );
  return linked;
}

/**
 * Best-effort read of the partner's focus for today. Returns
 * `available: false` when the backend does not expose their rows (e.g. row
 * level security), so the UI can show a waiting state instead of zeroes.
 */
export async function fetchPartnerActivity(
  code: string,
): Promise<PartnerActivity> {
  const empty: PartnerActivity = {
    minutes: 0,
    sessions: [],
    lastActiveAt: null,
    available: false,
  };
  if (typeof window === "undefined" || !code) return empty;
  try {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id, task_name, project_tag, actual_duration, started_at, completed_at",
      )
      .eq("user_id", code)
      .order("started_at", { ascending: false })
      .limit(50);
    if (error || !data) return empty;

    const today = effectiveDayKey(new Date());
    const rows = (
      data as Array<{
        id: string;
        task_name: string | null;
        project_tag: string | null;
        actual_duration: number | null;
        started_at: string;
        completed_at: string | null;
      }>
    ).filter((r) => effectiveDayKey(r.completed_at ?? r.started_at) === today);

    const sessions: PartnerSessionSummary[] = rows.map((r) => ({
      id: r.id,
      minutes: Math.max(0, Math.round(r.actual_duration ?? 0)),
      completedAt: r.completed_at ?? r.started_at,
      task: r.task_name ?? undefined,
      project: r.project_tag ?? undefined,
    }));

    return {
      minutes: sessions.reduce((sum, s) => sum + s.minutes, 0),
      sessions,
      lastActiveAt: sessions[0]?.completedAt ?? null,
      available: true,
    };
  } catch {
    return empty;
  }
}

/** Online-ish heuristic: active within the last 2 hours. */
export function isActive(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) return false;
  return Date.now() - new Date(lastActiveAt).getTime() < 2 * 60 * 60 * 1000;
}
