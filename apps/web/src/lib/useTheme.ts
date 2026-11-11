import { useCallback, useEffect, useState } from "react";
import { applyTheme, readTheme, saveTheme, THEME_KEY, type ThemePreference } from "./theme";

/** Current theme preference plus a setter that persists and applies it. Follows changes made in other tabs. */
export function useTheme(): [ThemePreference, (preference: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(readTheme);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      // key === null: storage was cleared.
      if (event.key !== THEME_KEY && event.key !== null) return;
      const next = readTheme();
      applyTheme(next);
      setPreference(next);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((next: ThemePreference) => {
    saveTheme(next);
    setPreference(next);
  }, []);

  return [preference, update];
}
