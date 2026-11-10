import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/api";

export interface Resource<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  reload: () => void;
}

/** Loads on mount and whenever `key` changes. A slower, older request never overwrites a newer one. */
export function useResource<T>(load: (() => Promise<T>) | null, key: string): Resource<T> {
  const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>({ data: null, error: null, loading: load !== null });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const run = loadRef.current;
    if (!run) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let current = true;
    setState((previous) => ({ ...previous, error: null, loading: true }));
    run().then(
      (data) => current && setState({ data, error: null, loading: false }),
      (error: unknown) => current && setState({ data: null, error: error instanceof Error ? error : new Error(String(error)), loading: false })
    );
    return () => {
      current = false;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { ...state, reload };
}
