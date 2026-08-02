import { safeStorage } from "./safeStorage";

const GUEST_KEY = "hourglass.guestMode.v1";

export function isGuestMode(): boolean {
  if (typeof window === "undefined") return false;
  return safeStorage.getItem(GUEST_KEY) === "1";
}

export function setGuestMode(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) safeStorage.setItem(GUEST_KEY, "1");
  else safeStorage.removeItem(GUEST_KEY);
  window.dispatchEvent(new Event("hourglass:guest"));
}
