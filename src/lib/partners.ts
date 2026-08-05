import { safeStorage } from "./safeStorage";
import { getUserId } from "./supabase";

/** 3-tier granular sharing permissions, per buddy. */
export interface PartnerPerms {
  /** Total focus minutes today + current streak. */
  progress: boolean;
  /** Active project name + task title. */
  tasks: boolean;
  /** Live status broadcast (Focusing / On Break / Offline). */
  live: boolean;
}

export interface Partner {
  /** Buddy code (their user id). */
  code: string;
  /** Friendly name the user gave them. */
  name: string;
  linkedAt: string;
  perms: PartnerPerms;
}

const PARTNERS_KEY = "hourglass.partners.v2";
const LEGACY_KEY = "hourglass.partner.v1";
const DISPLAY_NAME_KEY = "hourglass.displayName.v1";

export const PARTNERS_EVENT = "hourglass:partner";

export const DEFAULT_PERMS: PartnerPerms = {
  progress: true,
  tasks: true,
  live: true,
};

/** Conservative defaults applied when accepting an invite link. */
export const INVITE_PERMS: PartnerPerms = {
  progress: true,
  tasks: false,
  live: false,
};

export const FALLBACK_BUDDY_NAME = "Focus Buddy";

/** The name other people see in the Virtual Focus Room. */
export function getMyDisplayName(): string {
  if (typeof window === "undefined") return FALLBACK_BUDDY_NAME;
  const v = (safeStorage.getItem(DISPLAY_NAME_KEY) ?? "").trim();
  return v || FALLBACK_BUDDY_NAME;
}

export function hasMyDisplayName(): boolean {
  if (typeof window === "undefined") return false;
  return !!(safeStorage.getItem(DISPLAY_NAME_KEY) ?? "").trim();
}

export function setMyDisplayName(name: string) {
  const clean = name.trim().slice(0, 30);
  if (!clean) return;
  safeStorage.setItem(DISPLAY_NAME_KEY, clean);
  emit();
}


function emit() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(PARTNERS_EVENT));
}

/** Your own buddy code — shareable, derived from your user id. */
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

function normalize(raw: unknown): Partner[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Partial<Partner> => !!p && typeof p === "object")
    .filter((p) => typeof p.code === "string" && p.code.trim().length > 0)
    .map((p) => ({
      code: String(p.code).trim(),
      name: (p.name ?? "").trim() || FALLBACK_BUDDY_NAME,
      linkedAt: p.linkedAt ?? new Date().toISOString(),
      perms: { ...DEFAULT_PERMS, ...(p.perms ?? {}) },
    }));
}

export function getPartners(): Partner[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = safeStorage.getItem(PARTNERS_KEY);
    if (raw) return normalize(JSON.parse(raw));
    // Migrate the old single-partner shape.
    const legacy = safeStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const list = normalize([JSON.parse(legacy)]);
      if (list.length) savePartners(list);
      return list;
    }
    return [];
  } catch {
    return [];
  }
}

function savePartners(list: Partner[]) {
  safeStorage.setItem(PARTNERS_KEY, JSON.stringify(list));
}

export function addPartner(code: string, name?: string): boolean {
  const clean = code.trim();
  if (!clean || clean === myBuddyCode()) return false;
  const list = getPartners();
  if (list.some((p) => p.code === clean)) return false;
  list.push({
    code: clean,
    name: (name ?? "").trim() || "Your partner",
    linkedAt: new Date().toISOString(),
    perms: { ...DEFAULT_PERMS },
  });
  savePartners(list);
  emit();
  return true;
}

export function removePartner(code: string) {
  savePartners(getPartners().filter((p) => p.code !== code));
  emit();
}

export function renamePartner(code: string, name: string) {
  savePartners(
    getPartners().map((p) =>
      p.code === code ? { ...p, name: name.trim() || p.name } : p,
    ),
  );
  emit();
}

export function setPartnerPerms(code: string, patch: Partial<PartnerPerms>) {
  savePartners(
    getPartners().map((p) =>
      p.code === code ? { ...p, perms: { ...p.perms, ...patch } } : p,
    ),
  );
  emit();
}

/** Map of buddy code → the permissions I grant them. */
export function permsByPartner(): Record<string, PartnerPerms> {
  const out: Record<string, PartnerPerms> = {};
  for (const p of getPartners()) out[p.code] = p.perms;
  return out;
}

/** Pick up ?buddy=CODE from the URL and link that partner once. */
export function consumeInviteFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("buddy");
  if (!code) return false;
  const linked = addPartner(code);
  params.delete("buddy");
  const qs = params.toString();
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
  );
  return linked;
}

/** Online-ish heuristic: active within the last 2 hours. */
export function isActive(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) return false;
  return Date.now() - new Date(lastActiveAt).getTime() < 2 * 60 * 60 * 1000;
}

export function fmtHM(mins: number) {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
