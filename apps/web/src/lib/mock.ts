/**
 * Mock layer for `VITE_MOCK=1`. Feature modules register handlers from
 * `features/<fitur>/mock.ts`; lib/api.ts routes every request here instead of
 * the network. Later registrations win, so a feature may override a default.
 *
 *   registerMock("GET", "/triage/items", ({ query }) => ({ items: [], total: 0 }));
 *   registerMock("GET", "/triage/items/:id", ({ params }) => itemById(params.id), { delay: 400 });
 *   registerMock("POST", "/chr/:id/publish", () => { throw new ApiError(409, "CHR sudah terbit.") });
 *
 * Paths are relative to /api (no "/api" prefix). Return plain data for a 200,
 * or `respond(status, data)` for another status. Throw `ApiError` to inject an
 * error. Callers can also force an error with `?__fail=<status>` on the path.
 */
import { ApiError } from "./api-error";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface MockContext {
  method: HttpMethod;
  /** Path without "/api" and without the query string. */
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}

export type MockHandler = (ctx: MockContext) => unknown | Promise<unknown>;

export interface MockOptions {
  /** Milliseconds, or [min, max] for a random delay. Default 120-280 ms. */
  delay?: number | [number, number];
  /** Always fail this route. `probability` (0-1) makes it flaky. */
  fail?: { status: number; message?: string; probability?: number };
}

/** Non-200 answer from a handler. */
export class MockResponse {
  constructor(
    readonly status: number,
    readonly data?: unknown
  ) {}
}

export function respond(status: number, data?: unknown): MockResponse {
  return new MockResponse(status, data);
}

interface Route {
  method: HttpMethod;
  pattern: string;
  segments: string[];
  handler: MockHandler;
  options: MockOptions;
}

const routes: Route[] = [];

const control: { delay: number | [number, number] | null; failNext: { status: number; message?: string } | null } = {
  delay: null,
  failNext: null
};

export function registerMock(method: HttpMethod, pathPattern: string, handler: MockHandler, options: MockOptions = {}): void {
  const pattern = normalize(pathPattern);
  // Replace an earlier registration of the same route so overrides are explicit.
  const existing = routes.findIndex((route) => route.method === method && route.pattern === pattern);
  const route: Route = { method, pattern, segments: pattern.split("/").filter(Boolean), handler, options };
  if (existing >= 0) routes.splice(existing, 1);
  routes.unshift(route);
}

/** Global knobs for manual testing: `setMockDelay(1500)`, `failNextMockRequest(500)`. */
export function setMockDelay(delay: number | [number, number] | null): void {
  control.delay = delay;
}

export function failNextMockRequest(status: number, message?: string): void {
  control.failNext = { status, message };
}

if (typeof window !== "undefined") {
  (window as unknown as { __nirmalaMock?: unknown }).__nirmalaMock = { setMockDelay, failNextMockRequest, routes: () => routes.map((r) => `${r.method} ${r.pattern}`) };
}

function normalize(path: string): string {
  const clean = path.split("?")[0];
  return "/" + clean.split("/").filter(Boolean).join("/");
}

function matchRoute(route: Route, method: HttpMethod, segments: string[]): Record<string, string> | null {
  if (route.method !== method) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < route.segments.length; i += 1) {
    const expected = route.segments[i];
    if (expected === "*") return params;
    const actual = segments[i];
    if (actual === undefined) return null;
    if (expected.startsWith(":")) params[expected.slice(1)] = decodeURIComponent(actual);
    else if (expected !== actual) return null;
  }
  return route.segments.length === segments.length ? params : null;
}

function wait(delay: number | [number, number]): Promise<void> {
  const ms = Array.isArray(delay) ? delay[0] + Math.random() * (delay[1] - delay[0]) : delay;
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export interface MockResult {
  status: number;
  data: unknown;
}

export async function handleMockRequest(method: HttpMethod, pathWithQuery: string, body: unknown): Promise<MockResult> {
  const [rawPath, rawQuery = ""] = pathWithQuery.split("?");
  const path = normalize(rawPath);
  const segments = path.split("/").filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(rawQuery));

  let matched: { route: Route; params: Record<string, string> } | null = null;
  for (const route of routes) {
    const params = matchRoute(route, method, segments);
    if (params) {
      matched = { route, params };
      break;
    }
  }

  const delay = matched?.route.options.delay ?? control.delay ?? [120, 280];
  await wait(delay);

  if (control.failNext) {
    const { status, message } = control.failNext;
    control.failNext = null;
    throw new ApiError(status, message ?? "Kesalahan yang disimulasikan.");
  }
  if (query.__fail) throw new ApiError(Number(query.__fail) || 500, "Kesalahan yang disimulasikan.");

  if (!matched) {
    console.warn(`[mock] tidak ada handler untuk ${method} ${path}. Daftarkan dengan registerMock() di features/<fitur>/mock.ts.`);
    throw new ApiError(404, `Mock belum tersedia: ${method} ${path}`);
  }

  const fail = matched.route.options.fail;
  if (fail && Math.random() < (fail.probability ?? 1)) {
    throw new ApiError(fail.status, fail.message ?? "Kesalahan yang disimulasikan.");
  }

  const result = await matched.route.handler({ method, path, params: matched.params, query, body });
  if (result instanceof MockResponse) return { status: result.status, data: result.data };
  return { status: 200, data: result };
}
