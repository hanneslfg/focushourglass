/**
 * Virtual Focus Room — lightweight realtime presence + "Quiet Chat".
 *
 * Uses Supabase Realtime presence/broadcast only (no tables): each client
 * joins one shared channel, tracks its own state and receives everyone
 * else's. We only surface buddies the user has explicitly linked, and each
 * side filters what it broadcasts through the per-buddy permission tiers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { getTodayFocusedMinutes } from "./settings";
import { getDailyStreak } from "./streaks";
import {
  DEFAULT_PERMS,
  getPartners,
  myBuddyCode,
  permsByPartner,
  type PartnerPerms,
} from "./partners";

const ROOM = "hourglass-focus-room";

export type BuddyStatus = "focusing" | "break" | "offline";

export interface BuddyState {
  code: string;
  name: string;
  status: BuddyStatus;
  /** Minutes focused today (0 when not shared). */
  minutes: number;
  goalMinutes: number;
  streak: number;
  sharesProgress: boolean;
  sharesTasks: boolean;
  sharesLive: boolean;
  task?: string;
  project?: string;
  /** Seconds left in their current block, when shared. */
  remainingSec?: number;
  lastActiveAt: string | null;
}

export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  at: string;
  mine: boolean;
}

interface PresencePayload {
  code: string;
  name: string;
  status: BuddyStatus;
  minutes: number;
  goalMinutes: number;
  streak: number;
  task?: string;
  project?: string;
  remainingSec?: number;
  at: string;
  perms: Record<string, PartnerPerms>;
}

export interface MyRoomState {
  status: BuddyStatus;
  task?: string;
  project?: string;
  remainingSec?: number;
  goalMinutes: number;
  displayName: string;
}

export function useFocusRoom(me: MyRoomState, enabled: boolean) {
  const [buddies, setBuddies] = useState<BuddyState[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const meRef = useRef(me);
  meRef.current = me;

  const partners = getPartners();
  const partnerKey = partners.map((p) => `${p.code}:${p.name}`).join("|");

  const buildPayload = useCallback((): PresencePayload => {
    const s = meRef.current;
    return {
      code: myBuddyCode(),
      name: s.displayName,
      status: s.status,
      minutes: getTodayFocusedMinutes(),
      goalMinutes: s.goalMinutes,
      streak: getDailyStreak(),
      task: s.task,
      project: s.project,
      remainingSec: s.remainingSec,
      at: new Date().toISOString(),
      perms: permsByPartner(),
    };
  }, []);

  const applyState = useCallback(
    (raw: Record<string, unknown[]>) => {
      const mine = myBuddyCode();
      const list = getPartners();
      const seen = new Map<string, PresencePayload>();
      for (const entries of Object.values(raw)) {
        for (const e of entries) {
          const p = e as unknown as PresencePayload;
          if (!p || typeof p.code !== "string" || p.code === mine) continue;
          const prev = seen.get(p.code);
          if (!prev || prev.at < p.at) seen.set(p.code, p);
        }
      }
      setBuddies(
        list.map((partner) => {
          const p = seen.get(partner.code);
          const perms = p?.perms?.[mine] ?? DEFAULT_PERMS;
          if (!p) {
            return {
              code: partner.code,
              name: partner.name,
              status: "offline" as BuddyStatus,
              minutes: 0,
              goalMinutes: 0,
              streak: 0,
              sharesProgress: false,
              sharesTasks: false,
              sharesLive: false,
              lastActiveAt: null,
            };
          }
          return {
            code: partner.code,
            name: partner.name || p.name,
            status: perms.live ? p.status : ("offline" as BuddyStatus),
            minutes: perms.progress ? p.minutes : 0,
            goalMinutes: perms.progress ? p.goalMinutes : 0,
            streak: perms.progress ? p.streak : 0,
            sharesProgress: perms.progress,
            sharesTasks: perms.tasks,
            sharesLive: perms.live,
            task: perms.tasks ? p.task : undefined,
            project: perms.tasks ? p.project : undefined,
            remainingSec: perms.live ? p.remainingSec : undefined,
            lastActiveAt: p.at,
          };
        }),
      );
    },
    [],
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const channel = supabase.channel(ROOM, {
      config: { presence: { key: myBuddyCode() }, broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      applyState(channel.presenceState() as unknown as Record<string, unknown[]>);
    });
    channel.on("broadcast", { event: "chat" }, ({ payload }) => {
      const msg = payload as { id: string; from: string; name: string; text: string; at: string; to: string[] };
      const mine = myBuddyCode();
      if (!msg?.text) return;
      if (Array.isArray(msg.to) && !msg.to.includes(mine)) return;
      if (!getPartners().some((p) => p.code === msg.from)) return;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id)
          ? prev
          : [...prev, { ...msg, mine: false }].slice(-100),
      );
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        void channel.track(buildPayload());
      }
    });

    const beat = window.setInterval(() => {
      void channel.track(buildPayload());
    }, 20_000);

    return () => {
      window.clearInterval(beat);
      setConnected(false);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, partnerKey, applyState, buildPayload]);

  // Re-broadcast whenever my visible state changes.
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !connected) return;
    void ch.track(buildPayload());
  }, [connected, buildPayload, me.status, me.task, me.project, me.remainingSec]);

  const sendMessage = useCallback(
    (text: string) => {
      const ch = channelRef.current;
      const clean = text.trim().slice(0, 300);
      if (!ch || !clean) return;
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from: myBuddyCode(),
        name: meRef.current.displayName,
        text: clean,
        at: new Date().toISOString(),
        to: getPartners().map((p) => p.code),
      };
      void ch.send({ type: "broadcast", event: "chat", payload: msg });
      setMessages((prev) => [...prev, { ...msg, mine: true }].slice(-100));
    },
    [],
  );

  const roomMinutes = useMemo(
    () =>
      buddies.reduce((sum, b) => sum + b.minutes, 0) + getTodayFocusedMinutes(),
    [buddies],
  );

  return { buddies, messages, sendMessage, connected, roomMinutes };
}
