/**
 * Free ambient sound unlock.
 *
 * During onboarding every user picks exactly ONE ambient track to unlock for
 * free forever. All other tracks stay behind the Premium paywall.
 *
 * The choice is stored locally (`hourglass.unlocked_free_sound.v1`) and mirrored
 * into Supabase user metadata as `unlocked_free_sound_id` so it survives a
 * device change.
 */
import { safeStorage } from "@/lib/safeStorage";
import { publicSupabase } from "@/lib/supabase";

export const FREE_SOUND_KEY = "hourglass.unlocked_free_sound.v1";
export const SOUND_BUCKET = "focus-sounds";

export type FocusSound = { name: string; title: string; url: string };

export function titleizeSound(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function listFocusSounds(): Promise<FocusSound[]> {
  try {
    const { data, error } = await publicSupabase.storage
      .from(SOUND_BUCKET)
      .list("", { limit: 100, sortBy: { column: "name", order: "asc" } });
    if (error || !data) return [];
    return data
      .filter((f) => /\.(mp3|ogg|wav|m4a|aac|webm)$/i.test(f.name))
      .map((f) => {
        const { data: pub } = publicSupabase.storage
          .from(SOUND_BUCKET)
          .getPublicUrl(f.name);
        return { name: f.name, title: titleizeSound(f.name), url: pub.publicUrl };
      });
  } catch {
    return [];
  }
}

/** The sound id (storage file name) the user unlocked for free, if any. */
export function getUnlockedFreeSound(): string | null {
  return safeStorage.getItem(FREE_SOUND_KEY);
}

export function setUnlockedFreeSound(name: string) {
  safeStorage.setItem(FREE_SOUND_KEY, name);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hourglass:freeSound", { detail: name }));
  }
}

/**
 * Access check. A track is free when it is the user's chosen unlock. Users who
 * never made a choice (legacy accounts) fall back to "Space Travel".
 */
export function isSoundFree(
  sound: { name: string; title: string } | null | undefined,
  unlocked: string | null,
): boolean {
  if (!sound) return true;
  if (unlocked) return sound.name === unlocked;
  return `${sound.name} ${sound.title}`.toLowerCase().includes("space travel");
}
