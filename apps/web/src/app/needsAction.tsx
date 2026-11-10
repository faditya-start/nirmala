import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { NeedsActionItem, NeedsActionResponse } from "../lib/types";
import { useAuth } from "./auth";

export interface NeedsActionValue {
  /** Total "perlu tindakan"; null when unknown (loading or the request failed) so the UI hides the badge. */
  count: number | null;
  items: NeedsActionItem[];
  loading: boolean;
  failed: boolean;
  refresh: () => Promise<void>;
  /** Sum of item counts whose href is `path` or below it (used for sidebar badges). */
  countFor: (path: string) => number | null;
}

const NeedsActionContext = createContext<NeedsActionValue | null>(null);

const REFRESH_MS = 60_000;

export function NeedsActionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [data, setData] = useState<NeedsActionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<NeedsActionResponse>("/needs-action");
      setData({ count: Number(result.count) || 0, items: Array.isArray(result.items) ? result.items : [] });
      setFailed(false);
    } catch {
      // Never crash the shell over a badge: hide the count and keep going.
      setData(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setData(null);
      setFailed(false);
      return;
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, refresh]);

  const value = useMemo<NeedsActionValue>(
    () => ({
      count: data ? data.count : null,
      items: data?.items ?? [],
      loading,
      failed,
      refresh,
      countFor: (path) => {
        if (!data) return null;
        const matching = data.items.filter((item) => item.href === path || item.href.startsWith(`${path}/`));
        return matching.length ? matching.reduce((sum, item) => sum + item.count, 0) : null;
      }
    }),
    [data, loading, failed, refresh]
  );

  return <NeedsActionContext.Provider value={value}>{children}</NeedsActionContext.Provider>;
}

/** GET /api/needs-action -> header "Perlu tindakan" badge, popover list and sidebar counts. Failure hides the count. */
export function useNeedsAction(): NeedsActionValue {
  const value = useContext(NeedsActionContext);
  if (!value) throw new Error("useNeedsAction harus dipakai di dalam <NeedsActionProvider>.");
  return value;
}
