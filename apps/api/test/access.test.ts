import test from "node:test";
import assert from "node:assert/strict";
import { DEMO, setup } from "./helpers.ts";

type Units = { organizationUnits: { id: string; code: string }[] };

test("reviewer eselon I A tidak bisa membaca eselon I B", async () => {
  const { login, get, close } = await setup();
  const { cookie } = await login(...DEMO.reviewer);

  const list = await (await get("/api/organization-units", cookie)).json() as Units;
  assert.deepEqual(list.organizationUnits.map((unit) => unit.code), ["90001"]);

  assert.equal((await get("/api/organization-units/org_90001", cookie)).status, 200);
  const other = await get("/api/organization-units/org_90002", cookie);
  assert.equal(other.status, 403);
  close();
});

test("UKI juga dibatasi ke eselon I miliknya", async () => {
  const { login, get, close } = await setup();
  const { cookie } = await login(...DEMO.uki);
  assert.equal((await get("/api/organization-units/org_90002", cookie)).status, 403);
  close();
});

test("pimpinan dan admin melihat semua eselon I", async () => {
  const { login, get, close } = await setup();
  for (const credentials of [DEMO.leader, DEMO.admin]) {
    const { cookie } = await login(...credentials);
    const list = await (await get("/api/organization-units", cookie)).json() as Units;
    assert.deepEqual(list.organizationUnits.map((unit) => unit.code).sort(), ["90001", "90002"]);
    assert.equal((await get("/api/organization-units/org_90002", cookie)).status, 200);
  }
  close();
});

test("tanpa login: 401", async () => {
  const { get, close } = await setup();
  assert.equal((await get("/api/organization-units")).status, 401);
  close();
});
