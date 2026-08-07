import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const STORAGE_KEY = "hourglass.lang.v1";

export function detectStoredLanguage(): LanguageCode {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
    if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) return saved;
    const nav = window.navigator.language?.slice(0, 2).toLowerCase();
    if (nav && SUPPORTED_LANGUAGES.some((l) => l.code === nav)) return nav as LanguageCode;
  } catch {
    /* ignore */
  }
  return "en";
}

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        de: { translation: de },
        fr: { translation: fr },
        es: { translation: es },
      },
      // Always init with "en" so SSR markup matches the first client render.
      // The stored/browser language is applied after hydration (see __root).
      lng: "en",
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      returnNull: false,
    });
}

export function setLanguage(code: LanguageCode) {
  i18n.changeLanguage(code);
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, code);
      window.dispatchEvent(new CustomEvent("hourglass:lang", { detail: code }));
    }
  } catch {
    /* ignore */
  }
}

export function getLanguage(): LanguageCode {
  return (i18n.language?.slice(0, 2) as LanguageCode) || "en";
}

export default i18n;
