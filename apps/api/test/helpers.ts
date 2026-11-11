import { createApp } from "../src/app.ts";
import { createMigratedDatabase } from "../src/db/migrate.ts";
import { seedMasterData } from "../src/db/seed.ts";

export async function setup() {
  const database = createMigratedDatabase();
  await seedMasterData(database);
  const app = createApp({ database, sessionSecret: "test-secret" });

  async function login(username: string, password: string) {
    const response = await app.request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
    const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
    return { response, cookie };
  }
  const get = (path: string, cookie?: string) => app.request(path, { headers: cookie ? { cookie } : {} });

  return { app, database, login, get, close: () => database.close() };
}

export const DEMO = {
  reviewer: ["reviewer.demo", "Review123!"],
  uki: ["uki.demo", "Uki12345!"],
  leader: ["pimpinan.demo", "Pimpin123!"],
  admin: ["admin.demo", "Admin123!"]
} as const;

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const fixturePath = (name: string) => join(dirname(fileURLToPath(import.meta.url)), "../fixtures/synthetic", name);

import { seedSyntheticSnapshots } from "../src/db/seed.ts";
import type { TriageItemRow, TriageListResponse } from "@nirmala/shared";

/** Setup + siklus demo dengan snapshot Awal (deteksi + skor sudah jalan), seperti `npm run db:seed`. */
export async function setupSeeded() {
  const env = await setup();
  const { cycleId } = await seedSyntheticSnapshots(env.database);
  const sessions = {
    reviewer: await env.login(...DEMO.reviewer), uki: await env.login(...DEMO.uki),
    leader: await env.login(...DEMO.leader), admin: await env.login(...DEMO.admin)
  };
  const call = (method: string, path: string, cookie?: string, body?: unknown) => env.app.request(path, {
    method, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const list = async (cookie: string, query = "") => (await (await env.get(`/api/triage/items?cycleId=${cycleId}${query}`, cookie)).json()) as TriageListResponse;
  const findItem = async (cookie: string, description: string, satker?: string): Promise<TriageItemRow> => {
    const found = (await list(cookie, `&q=${encodeURIComponent(description)}&pageSize=100`)).items.filter((item) => item.description === description && (!satker || item.workUnitCode === satker));
    if (found.length !== 1) throw new Error(`item "${description}" ditemukan ${found.length}x`);
    return found[0];
  };
  return { ...env, cycleId, sessions, call, list, findItem };
}
