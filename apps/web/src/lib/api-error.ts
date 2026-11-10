/** Error thrown by the API client (real or mock). `message` is user-presentable Indonesian text. */
export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Message safe to show to a person, whatever was thrown. */
export function errorMessage(error: unknown, fallback = "Terjadi kesalahan. Coba lagi."): string {
  if (error instanceof ApiError && error.message) return error.message;
  return fallback;
}

/**
 * Presentable text for a failed request, for inline error states.
 * 501 (endpoint not built yet), network loss (status 0) and 5xx get their own wording; 4xx shows the server's message.
 */
export function describeError(error: unknown, fallback = "Terjadi kesalahan. Coba lagi."): string {
  if (error instanceof ApiError) {
    if (error.status === 501) return "Fitur ini belum tersedia di server. Hubungi Admin bila seharusnya sudah aktif.";
    if (error.status === 0) return error.message || "Tidak dapat terhubung ke server. Periksa koneksi, lalu coba lagi.";
    if (error.status >= 500) return "Server sedang bermasalah. Coba lagi sebentar lagi.";
    return error.message || fallback;
  }
  return fallback;
}
