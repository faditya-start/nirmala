import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { readStorage, writeStorage } from "../lib/storage";
import type { Cycle, CyclesResponse } from "../lib/types";
import { useAuth } from "./auth";

const STORAGE_KEY = "nirmala.activeCycle";

export type CycleStatus = "idle" | "loading" | "ready" | "error";

export interface CycleContextValue {
  cycles: Cycle[];
  /** The selected cycle, or null while loading or when there are none. */
  active: Cycle | null;
  status: CycleStatus;
  setActiveId: (id: string) => void;
  reload: () => Promise<void>;
}

const CycleContext = createContext<CycleContextValue | null>(null);

/** Picks the stored cycle if it still exists, else the first active cycle, else the first one. */
function pickActive(cycles: Cycle[], storedId: string | null): Cycle | null {
  if (cycles.length === 0) return null;
  return (
    cycles.find((cycle) => String(cycle.id) === storedId) ??
    cycles.find((cycle) => cycle.status === "aktif") ??
    cycles[0]
  );
}

export function CycleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [status, setStatus] = useState<CycleStatus>("idle");
  const [activeId, setActiveIdState] = useState<string | null>(() => readStorage(STORAGE_KEY));

  const reload = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await api.get<CyclesResponse>("/cycles");
      setCycles(result.cycles ?? []);
      setStatus("ready");
    } catch {
      setCycles([]);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setCycles([]);
      setStatus("idle");
      return;
    }
    void reload();
  }, [userId, reload]);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    writeStorage(STORAGE_KEY, id);
  }, []);

  const active = useMemo(() => pickActive(cycles, activeId), [cycles, activeId]);

  const value = useMemo<CycleContextValue>(() => ({ cycles, active, status, setActiveId, reload }), [cycles, active, status, setActiveId, reload]);
  return <CycleContext.Provider value={value}>{children}</CycleContext.Provider>;
}

/** The "Siklus aktif" selection shared by the sidebar picker and every feature. Read `active.id` for API calls. */
export function useCycle(): CycleContextValue {
  const value = useContext(CycleContext);
  if (!value) throw new Error("useCycle harus dipakai di dalam <CycleProvider>.");
  return value;
}
