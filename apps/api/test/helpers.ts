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
