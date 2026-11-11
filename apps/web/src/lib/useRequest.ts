import { useCallback, useEffect, useRef, useState } from "react";

export interface RequestState<T> {
  /** Last good answer for the current key (or the previous key's with `keepPreviousData`). */
  data: T | null;
  error: unknown;
  /** True while a request runs, including a `reload()` that keeps the old data on screen. */
  loading: boolean;
  /** Runs the request again and keeps the old data visible until the new answer arrives. */
  reload: () => Promise<void>;
}

export interface UseRequestOptions {
  /**
   * On a key change keep showing the previous data (tables that must not flash empty while filtering).
   * Default false: the old data is dropped so one item's data is never shown under another item's URL.
   */
  keepPreviousData?: boolean;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Race-safe loader. Fetches when `key` changes (pass null to stay idle) and aborts the previous request;
 * an answer that arrives late for an older key is ignored, so quick filter or navigation changes cannot
 * show stale data. `load` always receives an AbortSignal: hand it to `api.get(path, { signal })`.
 *
 *   const { data, error, loading, reload } = useRequest(`items?${query}`, (signal) => api.get<Page>("/items", { query, signal }));
 */
export function useRequest<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>, options: UseRequestOptions = {}): RequestState<T> {
  const { keepPreviousData = false } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(key !== null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const keyRef = useRef(key);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async (runKey: string | null) => {
    controllerRef.current?.abort();
    if (runKey === null) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const result = await loadRef.current(controller.signal);
      if (controller.signal.aborted || keyRef.current !== runKey) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (controller.signal.aborted || keyRef.current !== runKey || isAbort(caught)) return;
      setError(caught);
    } finally {
      if (!controller.signal.aborted && keyRef.current === runKey) setLoading(false);
    }
  }, []);

  useEffect(() => {
    keyRef.current = key;
    if (!keepPreviousData) setData(null);
    setError(null);
    void run(key);
    return () => controllerRef.current?.abort();
  }, [key, keepPreviousData, run]);

  const reload = useCallback(() => run(keyRef.current), [run]);
  return { data, error, loading, reload };
}
