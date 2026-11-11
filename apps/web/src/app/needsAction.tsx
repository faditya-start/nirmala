import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NavCountsResponse } from "@nirmala/shared";
import { api } from "../lib/api";
import type { NeedsActionItem, NeedsActionResponse } from "../lib/types";
import { useAuth } from "./auth";
import { useCycle } from "./cycle";

export interface NeedsActionValue {
  /** Total "perlu tindakan"; null when unknown (loading or the request failed) so the UI hides the badge. */
  count: number | null;
  items: NeedsActionItem[];
  loading: boolean;
  failed: boolean;
  /** Re-reads both GET /needs-action and GET /nav-counts. Call it after an action that changes a queue. */
  refresh: () => Promise<void>;
  /** GET /nav-counts for the sidebar badges; null when unknown (loading or failed), so the badge stays hidden. */
  navCounts: NavCountsResponse | null;
}

const NeedsActionContext = createContext<NeedsActionValue | null>(null);

const REFRESH_MS = 60_000;

export function NeedsActionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { active } = useCycle();
  const userId = user?.id ?? null;
  const cycleId = active ? String(active.id) : null;
  const [data, setData] = useState<NeedsActionResponse | null>(null);
  const [navCounts, setNavCounts] = useState<NavCountsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const ticket = useRef(0);

  const refresh = useCallback(async () => {
    // Only the newest refresh may write state, so a slow older answer (or one that lands after sign-out) is dropped.
    const mine = ++ticket.current;
    const current = () => mine === ticket.current;
    setLoading(true);
    const query = { cycleId };
    // Independent requests: a failing badge must never hide the other one or crash the shell.
    const needs = api
      .get<NeedsActionResponse>("/needs-action", { query })
      .then((result) => {
        if (!current()) return;
        setData({ count: Number(result.count) || 0, items: Array.isArray(result.items) ? result.items : [] });
        setFailed(false);
      })
      .catch(() => {
        if (!current()) return;
        setData(null);
        setFailed(true);
      });
    const counts = api
      .get<NavCountsResponse>("/nav-counts", { query })
      .then((result) => current() && setNavCounts({ triageUnreviewed: Number(result.triageUnreviewed) || 0, trackerPending: Number(result.trackerPending) || 0 }))
      .catch(() => current() && setNavCounts(null));
    await Promise.all([needs, counts]);
    if (current()) setLoading(false);
  }, [cycleId]);

  useEffect(() => {
    if (!userId) {
      ticket.current += 1;
      setData(null);
      setNavCounts(null);
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
      navCounts
    }),
    [data, navCounts, loading, failed, refresh]
  );

  return <NeedsActionContext.Provider value={value}>{children}</NeedsActionContext.Provider>;
}

/** GET /api/needs-action -> header "Perlu tindakan" badge and popover list; GET /api/nav-counts -> sidebar badges. Failure hides the count. */
export function useNeedsAction(): NeedsActionValue {
  const value = useContext(NeedsActionContext);
  if (!value) throw new Error("useNeedsAction harus dipakai di dalam <NeedsActionProvider>.");
  return value;
}
