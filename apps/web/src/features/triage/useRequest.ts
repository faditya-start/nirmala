import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/api";

export interface RequestState<T> {
  data: T | null;
  error: ApiError | Error | null;
  /** true selama permintaan berjalan (termasuk muat ulang dengan data lama masih tampil). */
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Mengambil data untuk `key`. Saat `key` berubah, data lama dibuang (tidak ada data milik item lain yang
 * tampil di bawah URL baru). `reload()` mengambil ulang tanpa mengosongkan data. Respons yang datang
 * terlambat dari `key` lama diabaikan.
 */
export function useRequest<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): RequestState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
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
      if (controller.signal.aborted || keyRef.current !== runKey) return;
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      if (!controller.signal.aborted && keyRef.current === runKey) setLoading(false);
    }
  }, []);

  useEffect(() => {
    keyRef.current = key;
    setData(null);
    setError(null);
    void run(key);
    return () => controllerRef.current?.abort();
  }, [key, run]);

  const reload = useCallback(() => run(keyRef.current), [run]);
  return { data, error, loading, reload };
}

/** Pesan galat untuk layar: 501 = belum tersedia, selain itu pesan server. */
export function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 501) return "Fitur ini belum tersedia di server.";
    if (error.status === 0) return error.message;
    if (error.status >= 500) return "Server sedang bermasalah. Coba lagi sebentar lagi.";
    return error.message || fallback;
  }
  return fallback;
}
