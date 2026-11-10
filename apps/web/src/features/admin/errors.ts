import { errorMessage, isApiError } from "../../lib/api";

/** Presentable text for a failed request. 501 is the API's "not built yet" answer, so it is not shown as a crash. */
export function failureMessage(error: unknown): string {
  if (isApiError(error) && error.status === 501) return "Fitur ini belum tersedia di server. Hubungi pengelola sistem.";
  if (isApiError(error) && error.status === 409) return error.message || "Data berubah di tempat lain. Muat ulang halaman lalu coba lagi.";
  return errorMessage(error);
}
