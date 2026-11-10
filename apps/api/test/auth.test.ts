import test from "node:test";
import assert from "node:assert/strict";
import { DEMO, setup } from "./helpers.ts";

test("login sukses menyetel cookie sesi dan /me mengembalikan pengguna", async () => {
  const { login, get, close } = await setup();
  const { response, cookie } = await login(...DEMO.reviewer);
  assert.equal(response.status, 200);
  assert.match(cookie, /^nirmala_session=/);
  const me = await (await get("/api/auth/me", cookie)).json() as { user: { role: string } | null };
  assert.equal(me.user?.role, "reviewer");
  close();
});

test("password salah ditolak dan tanpa cookie", async () => {
  const { login, close } = await setup();
  const { response, cookie } = await login("reviewer.demo", "salah");
  assert.equal(response.status, 401);
  assert.equal(cookie, "");
  close();
});

test("logout menghapus sesi di server", async () => {
  const { app, login, get, close } = await setup();
  const { cookie } = await login(...DEMO.reviewer);
  const out = await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });
  assert.equal(out.status, 204);
  const me = await (await get("/api/auth/me", cookie)).json() as { user: unknown };
  assert.equal(me.user, null);
  close();
});

test("cookie yang tanda tangannya dipalsukan tidak diterima", async () => {
  const { get, close } = await setup();
  const me = await (await get("/api/auth/me", "nirmala_session=session_x.palsu")).json() as { user: unknown };
  assert.equal(me.user, null);
  close();
});

test("endpoint admin: 401 tanpa login, 403 untuk non-admin, 200 untuk admin", async () => {
  const { login, get, close } = await setup();
  assert.equal((await get("/api/users")).status, 401);
  const reviewer = await login(...DEMO.reviewer);
  assert.equal((await get("/api/users", reviewer.cookie)).status, 403);
  const admin = await login(...DEMO.admin);
  const response = await get("/api/users", admin.cookie);
  assert.equal(response.status, 200);
  const body = await response.json() as { users: { role: string }[] };
  assert.ok(body.users.some((user) => user.role === "uki"), "peran uki tersedia");
  close();
});

test("endpoint prototipe yang belum diporting mengembalikan 501 dengan pesan jelas", async () => {
  const { login, get, close } = await setup();
  const { cookie } = await login(...DEMO.reviewer);
  const response = await get("/api/chr", cookie);
  assert.equal(response.status, 501);
  assert.match(((await response.json()) as { error: string }).error, /Fase 4/);
  close();
});
