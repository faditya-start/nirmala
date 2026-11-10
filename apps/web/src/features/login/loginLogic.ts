/** Pure helpers for the login screen (no imports, so they can be tested with plain `node --test`). */

export const LOGIN_FAILED_MESSAGE = "Username atau kata sandi tidak sesuai. Periksa lagi, lalu coba masuk kembali.";
export const LOGIN_THROTTLED_MESSAGE = "Terlalu banyak percobaan masuk. Tunggu beberapa saat, lalu coba lagi.";
export const LOGIN_UNREACHABLE_MESSAGE = "Tidak dapat terhubung ke server. Periksa koneksi, lalu coba lagi.";
export const LOGIN_SERVER_MESSAGE = "Server sedang bermasalah. Coba lagi beberapa saat lagi.";
export const LOGIN_UNKNOWN_MESSAGE = "Tidak dapat masuk. Coba lagi.";

/**
 * Where to go after signing in. The auth guard passes the requested route as `state.from`.
 * Only same-origin app paths are accepted (no `//host`, no scheme, not the login page itself);
 * anything else falls back to the dashboard.
 */
export function safeRedirectTarget(from: unknown, fallback = "/dashboard"): string {
  if (typeof from !== "string") return fallback;
  if (!from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\")) return fallback;
  const path = from.split(/[?#]/)[0];
  if (path === "/login" || path === "/") return fallback;
  return from;
}

/** Message for a failed login call. 401 uses the designed copy; it never reveals which field was wrong. */
export function loginFailureMessage(error: unknown): string {
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : undefined;
  const message = typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : "";
  if (status === 401) return LOGIN_FAILED_MESSAGE;
  if (status === 429) return LOGIN_THROTTLED_MESSAGE;
  if (status !== undefined && status >= 500) return LOGIN_SERVER_MESSAGE;
  if (status !== undefined && status >= 400 && message) return message;
  if (status === 0 || (status === undefined && error instanceof TypeError)) return LOGIN_UNREACHABLE_MESSAGE;
  return LOGIN_UNKNOWN_MESSAGE;
}
