/**
 * Safe localStorage wrapper.
 *
 * In-app browsers (WhatsApp, Instagram, some iOS WebViews) and privacy modes
 * can throw on `localStorage.getItem` / `setItem` (SecurityError, QuotaExceeded,
 * or the property accessor itself can throw). A single unhandled exception at
 * boot crashes the whole React tree.
 *
 * This module catches every access and transparently falls back to an
 * in-memory Map so the app keeps working as a guest session.
 */

const mem = new Map<string, string>();

function ls(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    // Accessing the property can itself throw in some sandboxed contexts.
    const s = window.localStorage;
    // Probe write access — Safari private mode used to throw here.
    const probe = "__hg_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

let cached: Storage | null | undefined;
function storage(): Storage | null {
  if (cached === undefined) cached = ls();
  return cached;
}

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      const s = storage();
      if (s) return s.getItem(key);
    } catch {
      /* fall through */
    }
    return mem.has(key) ? (mem.get(key) as string) : null;
  },
  setItem(key: string, value: string): void {
    try {
      const s = storage();
      if (s) {
        s.setItem(key, value);
        return;
      }
    } catch {
      /* fall through */
    }
    mem.set(key, value);
  },
  removeItem(key: string): void {
    try {
      const s = storage();
      if (s) {
        s.removeItem(key);
        return;
      }
    } catch {
      /* fall through */
    }
    mem.delete(key);
  },
  /** Supabase auth storage adapter shape (synchronous is fine). */
  length: 0,
  key(_i: number): string | null {
    return null;
  },
  clear(): void {
    try {
      storage()?.clear();
    } catch {
      /* ignore */
    }
    mem.clear();
  },
};
