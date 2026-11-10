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
