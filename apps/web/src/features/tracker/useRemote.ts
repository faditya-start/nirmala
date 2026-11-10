import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isApiError } from "../../lib/api";

export interface Remote<T> {
  /** Last good answer. Kept while a newer request runs, so tables do not flash empty on filter changes. */
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads data for the given `key` (any value that changes when the request should change).
 * A newer request always wins; answers from older ones are dropped, so fast filter or navigation changes cannot race.
 */
export function useRemote<T>(load: (signal: AbortSignal) => Promise<T>, key: string, enabled = true): Remote<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: enabled });
  const loadRef = useRef(load);
  loadRef.current = load;
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState((prev) => ({ ...prev, error: null, loading: true }));
    loadRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState((prev) => ({ ...prev, error, loading: false }));
      });
    return () => controller.abort();
  }, [key, version, enabled]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { ...state, reload };
}

export function errorStatus(error: unknown): number | null {
  return isApiError(error) ? error.status : null;
}

/** Presentable text for a failed request. 501 (endpoint not built yet) and network loss get their own wording. */
export function describeError(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 501) return "Fitur ini belum tersedia di server. Hubungi Admin bila seharusnya sudah aktif.";
    if (error.status === 0) return error.message;
  }
  return errorMessage(error);
}
