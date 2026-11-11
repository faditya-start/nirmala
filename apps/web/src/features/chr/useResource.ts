import { useCallback, useEffect, useRef, useState } from "react";

export interface Resource<T> {
  data: T | null;
  error: unknown;
  /** True only before the first answer; a reload keeps showing the old data. */
  loading: boolean;
  /** True while a reload runs. */
  refreshing: boolean;
  reload: () => Promise<T | null>;
}

/**
 * Loads data when `deps` change and exposes `reload`. A late answer from an older request is dropped,
 * so quick navigation never shows data for the wrong document.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const ticket = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(async (initial: boolean): Promise<T | null> => {
    const mine = ++ticket.current;
    const controller = new AbortController();
    if (initial) {
      setLoading(true);
      setData(null);
    } else {
      setRefreshing(true);
    }
    try {
      const result = await loadRef.current(controller.signal);
      if (mine !== ticket.current) return null;
      setData(result);
      setError(null);
      return result;
    } catch (caught) {
      if (mine !== ticket.current) return null;
      setError(caught);
      return null;
    } finally {
      if (mine === ticket.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void run(true);
    return () => {
      ticket.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => run(false), [run]);
  return { data, error, loading, refreshing, reload };
}
