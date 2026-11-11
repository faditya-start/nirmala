import { readStorage, writeStorage } from "./storage";

/**
 * Theme preference. "system" removes data-theme so tokens.css follows prefers-color-scheme;
 * "light" and "dark" force a palette. The choice lives in localStorage under THEME_KEY and is applied
 * before first paint by public/theme-init.js (keep the key there in sync; the CSP forbids inline scripts).
 */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_KEY = "nirmala.theme";

export const THEME_LABEL: Record<ThemePreference, string> = {
  system: "Ikuti sistem",
  light: "Terang",
  dark: "Gelap"
};

/** Any stored value other than light or dark (missing, stale, tampered) means "system". */
export function parseTheme(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/** Order of the single-button cycle used when the sidebar is collapsed. */
export function nextTheme(current: ThemePreference): ThemePreference {
  return current === "system" ? "light" : current === "light" ? "dark" : "system";
}

export function readTheme(): ThemePreference {
  return parseTheme(readStorage(THEME_KEY));
}

export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}

export function saveTheme(preference: ThemePreference): void {
  writeStorage(THEME_KEY, preference === "system" ? null : preference);
  applyTheme(preference);
}
