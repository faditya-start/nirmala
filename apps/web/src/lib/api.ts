/**
 * Typed fetch client for the NIRMALA API (same-origin `/api`).
 *
 *   const { cycles } = await api.get<{ cycles: Cycle[] }>("/cycles");
 *   await api.post("/auth/login", { username, password }, { skipUnauthorized: true });
 *
 * - credentials: include, JSON in/out.
 * - Non-2xx -> `ApiError` (status + the server's `error` message).
 * - 401 -> notifies `onUnauthorized` listeners (AuthProvider clears the user and
 *   the route guard sends the person to /login); with no listener it navigates
 *   to /login directly.
 * - `VITE_MOCK=1` answers from handlers registered in lib/mock.ts.
 */
import { ApiError } from "./api-error";
import { handleMockRequest, type HttpMethod } from "./mock";

export { ApiError, isApiError, errorMessage } from "./api-error";

export const API_BASE = "/api";
const DEFAULT_TIMEOUT_MS = 60_000;
export const IS_MOCK = import.meta.env.VITE_MOCK === "1";

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Do not treat a 401 as "session ended" (used by the login call itself). */
  skipUnauthorized?: boolean;
  /** Give up after this many ms (default 60 000). 0 = no timeout, for long uploads. */
  timeoutMs?: number;
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Subscribe to 401 responses. Returns an unsubscribe function. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function withQuery(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  if (!text) return path;
  return path + (path.includes("?") ? "&" : "?") + text;
}

function handleUnauthorized(): void {
  if (unauthorizedListeners.size > 0) {
    unauthorizedListeners.forEach((listener) => listener());
    return;
  }
  if (typeof window !== "undefined" && window.location.pathname !== "/login") window.location.assign("/login");
}

export async function request<T>(method: HttpMethod, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const target = withQuery(path.startsWith("/") ? path : `/${path}`, options.query);

  let status: number;
  let data: unknown;

  if (IS_MOCK) {
    try {
      const result = await handleMockRequest(method, target, body);
      status = result.status;
      data = result.data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && !options.skipUnauthorized) handleUnauthorized();
      throw error;
    }
  } else {
    let response: Response;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const signals = [options.signal, timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined].filter((item): item is AbortSignal => Boolean(item));
    try {
      response = await fetch(`${API_BASE}${target}`, {
        method,
        credentials: "include",
        signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
        headers: {
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new ApiError(0, "Server terlalu lama menjawab. Coba lagi sebentar lagi.");
      }
      throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.");
    }
    status = response.status;
    const text = status === 204 ? "" : await response.text();
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      // A 2xx that is not JSON is almost always a proxy or SPA fallback page, not the API: do not hand HTML to a screen.
      if (status >= 200 && status < 300 && text) throw new ApiError(502, "Respons server tidak dikenali. Hubungi Admin bila terus terjadi.");
      data = text || undefined;
    }
  }

  if (status >= 200 && status < 300) return data as T;

  const serverMessage =
    data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
      ? (data as { error: string }).error
      : null;
  if (status === 401 && !options.skipUnauthorized) handleUnauthorized();
  throw new ApiError(status, serverMessage ?? defaultMessage(status), data);
}

function defaultMessage(status: number): string {
  if (status === 401) return "Sesi berakhir. Silakan masuk kembali.";
  if (status === 403) return "Anda tidak punya akses untuk tindakan ini.";
  if (status === 404) return "Data tidak ditemukan.";
  if (status >= 500) return "Server sedang bermasalah. Coba lagi sebentar lagi.";
  return "Permintaan tidak dapat diproses.";
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, body ?? {}, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PUT", path, body ?? {}, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, body ?? {}, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, undefined, options)
};
