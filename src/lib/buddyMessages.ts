/**
 * Persistent 1:1 "Quiet Chat" history between accountability buddies.
 *
 * Messages are stored in `public.buddy_messages` when the table is reachable
 * and always mirrored into localStorage, so history survives reloads even
 * offline or when the table has not been provisioned yet.
 */
import { safeStorage } from "./safeStorage";
import { supabase } from "./supabase";
import { myBuddyCode } from "./partners";

export interface BuddyMessage {
  id: string;
  from: string;
  to: string;
  name: string;
  text: string;
  at: string;
  mine: boolean;
}

export const BUDDY_MESSAGES_EVENT = "hourglass:buddyMessages";
const KEY = "hourglass.buddyMessages.v1";
const MAX_PER_THREAD = 300;

type Bag = Record<string, BuddyMessage[]>;

function readBag(): Bag {
  if (typeof window === "undefined") return {};
  try {
    const raw = safeStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Bag) : {};
  } catch {
    return {};
  }
}

function writeBag(bag: Bag) {
  try {
    safeStorage.setItem(KEY, JSON.stringify(bag));
  } catch {
    /* quota / private mode */
  }
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(BUDDY_MESSAGES_EVENT));
}

function sortAsc(list: BuddyMessage[]) {
  return [...list].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Locally cached thread — instantly available, no network round-trip. */
export function getLocalThread(partnerCode: string): BuddyMessage[] {
  return sortAsc(readBag()[partnerCode] ?? []);
}

function mergeLocal(partnerCode: string, incoming: BuddyMessage[]) {
  const bag = readBag();
  const existing = bag[partnerCode] ?? [];
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  bag[partnerCode] = sortAsc([...byId.values()]).slice(-MAX_PER_THREAD);
  writeBag(bag);
  return bag[partnerCode];
}

/** Records a message locally (used for both sent and received messages). */
export function cacheMessage(msg: BuddyMessage) {
  const partner = msg.mine ? msg.to : msg.from;
  if (!partner) return;
  mergeLocal(partner, [msg]);
}

interface Row {
  id: string;
  from_code: string;
  to_code: string;
  from_name: string | null;
  text: string;
  created_at: string;
}

function toMessage(row: Row, me: string): BuddyMessage {
  return {
    id: row.id,
    from: row.from_code,
    to: row.to_code,
    name: row.from_name || "Focus Buddy",
    text: row.text,
    at: row.created_at,
    mine: row.from_code === me,
  };
}

/**
 * Loads the durable thread from Supabase and merges it into the local cache.
 * Returns the merged thread; falls back to the cache on any error.
 */
export async function loadThread(partnerCode: string): Promise<BuddyMessage[]> {
  const me = myBuddyCode();
  try {
    const { data, error } = await supabase
      .from("buddy_messages")
      .select("id, from_code, to_code, from_name, text, created_at")
      .or(
        `and(from_code.eq.${me},to_code.eq.${partnerCode}),and(from_code.eq.${partnerCode},to_code.eq.${me})`,
      )
      .order("created_at", { ascending: true })
      .limit(MAX_PER_THREAD);
    if (error || !data) return getLocalThread(partnerCode);
    return mergeLocal(
      partnerCode,
      (data as Row[]).map((r) => toMessage(r, me)),
    );
  } catch {
    return getLocalThread(partnerCode);
  }
}

/** Persists an outgoing message (cache first, cloud best-effort). */
export async function sendBuddyMessage(
  partnerCode: string,
  text: string,
  myName: string,
): Promise<BuddyMessage | null> {
  const clean = text.trim().slice(0, 300);
  if (!clean || !partnerCode) return null;
  const me = myBuddyCode();
  const msg: BuddyMessage = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: me,
    to: partnerCode,
    name: myName,
    text: clean,
    at: new Date().toISOString(),
    mine: true,
  };
  cacheMessage(msg);
  try {
    await supabase.from("buddy_messages").insert({
      id: msg.id,
      from_code: me,
      to_code: partnerCode,
      from_name: myName,
      text: clean,
      created_at: msg.at,
    });
  } catch {
    /* cloud unavailable — local history still holds */
  }
  return msg;
}
