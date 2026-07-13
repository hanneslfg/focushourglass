/**
 * Focus / break rhythms — custom rhythms sync with public.custom_rhythms;
 * the active-rhythm pointer (which rhythm is running + the current block
 * index) stays local because it is ephemeral timer state, not app config.
 */
import { safeStorage } from "./safeStorage";
import {
  deleteRhythmRemote,
  fetchCustomRhythmsRemote,
  upsertRhythmRemote,
} from "./remoteConfig";

export type BlockKind = "focus" | "break";

export interface RhythmBlock {
  id: string;
  kind: BlockKind;
  minutes: number;
}

export interface Rhythm {
  id: string;
  name: string;
  description?: string;
  blocks: RhythmBlock[];
  builtin?: boolean;
}

interface RhythmStore {
  custom: Rhythm[];
  activeId: string | null;
  activeIndex: number;
}

const KEY = "hourglass.rhythms.v1";

export const BUILTIN_RHYTHMS: Rhythm[] = [
  {
    id: "builtin.ultradian",
    name: "Classic Ultradian",
    description: "90 minutes focus · 30 minutes break",
    builtin: true,
    blocks: [
      { id: "u-f1", kind: "focus", minutes: 90 },
      { id: "u-b1", kind: "break", minutes: 30 },
    ],
  },
  {
    id: "builtin.pomodoro",
    name: "Classic Pomodoro",
    description: "4 × 25/5 · long 15-min break",
    builtin: true,
    blocks: [
      { id: "p-f1", kind: "focus", minutes: 25 },
      { id: "p-b1", kind: "break", minutes: 5 },
      { id: "p-f2", kind: "focus", minutes: 25 },
      { id: "p-b2", kind: "break", minutes: 5 },
      { id: "p-f3", kind: "focus", minutes: 25 },
      { id: "p-b3", kind: "break", minutes: 5 },
      { id: "p-f4", kind: "focus", minutes: 25 },
      { id: "p-b4", kind: "break", minutes: 15 },
    ],
  },
];

function read(): RhythmStore {
  const empty: RhythmStore = { custom: [], activeId: null, activeIndex: 0 };
  if (typeof window === "undefined") return empty;
  try {
    const raw = safeStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<RhythmStore>;
    return {
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
      activeIndex:
        typeof parsed.activeIndex === "number" && parsed.activeIndex >= 0
          ? parsed.activeIndex
          : 0,
    };
  } catch {
    return empty;
  }
}

function write(s: RhythmStore) {
  try {
    safeStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("hourglass:rhythm"));
  } catch {
    // ignore
  }
}

export function getAllRhythms(): Rhythm[] {
  return [...BUILTIN_RHYTHMS, ...read().custom];
}

export function getCustomRhythms(): Rhythm[] {
  return read().custom;
}

export function getRhythm(id: string): Rhythm | null {
  return getAllRhythms().find((r) => r.id === id) ?? null;
}

export function saveCustomRhythm(rhythm: Rhythm) {
  void (async () => {
    const res = await upsertRhythmRemote(rhythm);
    if (!res.ok && !res.notAuthed) return;
    const s = read();
    const idx = s.custom.findIndex((r) => r.id === rhythm.id);
    if (idx >= 0) s.custom[idx] = rhythm;
    else s.custom.push(rhythm);
    write(s);
  })();
}

export function deleteCustomRhythm(id: string) {
  void (async () => {
    const res = await deleteRhythmRemote(id);
    if (!res.ok && !res.notAuthed) return;
    const s = read();
    s.custom = s.custom.filter((r) => r.id !== id);
    if (s.activeId === id) {
      s.activeId = null;
      s.activeIndex = 0;
    }
    write(s);
  })();
}

export interface ActiveRhythmState {
  rhythm: Rhythm;
  index: number;
  block: RhythmBlock;
}

export function getActiveRhythm(): ActiveRhythmState | null {
  const s = read();
  if (!s.activeId) return null;
  const r = getRhythm(s.activeId);
  if (!r || r.blocks.length === 0) return null;
  const index = Math.min(s.activeIndex, r.blocks.length - 1);
  return { rhythm: r, index, block: r.blocks[index] };
}

export function activateRhythm(id: string, startIndex = 0) {
  const s = read();
  s.activeId = id;
  s.activeIndex = startIndex;
  write(s);
}

export function deactivateRhythm() {
  const s = read();
  s.activeId = null;
  s.activeIndex = 0;
  write(s);
}

export function advanceRhythm(): ActiveRhythmState | null {
  const s = read();
  if (!s.activeId) return null;
  const r = getRhythm(s.activeId);
  if (!r) {
    s.activeId = null;
    s.activeIndex = 0;
    write(s);
    return null;
  }
  const next = s.activeIndex + 1;
  if (next >= r.blocks.length) {
    s.activeId = null;
    s.activeIndex = 0;
    write(s);
    return null;
  }
  s.activeIndex = next;
  write(s);
  return { rhythm: r, index: next, block: r.blocks[next] };
}

/**
 * Replace the local custom-rhythm cache with the authoritative list from
 * public.custom_rhythms. Preserves the local activeId / activeIndex.
 */
export async function hydrateRhythmsFromRemote(): Promise<void> {
  const remote = await fetchCustomRhythmsRemote();
  if (!remote) return;
  const s = read();
  // Safety net: don't wipe local custom rhythms if remote came back empty
  // (transient auth/network state on tab focus).
  if (remote.length === 0 && s.custom.length > 0) return;
  s.custom = remote;
  if (s.activeId && !BUILTIN_RHYTHMS.some((r) => r.id === s.activeId) &&
      !remote.some((r) => r.id === s.activeId)) {
    s.activeId = null;
    s.activeIndex = 0;
  }
  write(s);
}

