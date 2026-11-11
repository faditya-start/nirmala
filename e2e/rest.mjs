#!/usr/bin/env node
// Smoke/regression test for the NON-core screens against the REAL stack (no mock):
// dashboard, laporan (+ CSV), admin (rules, weights + recalculate job, users, cycles + DIPA, audit),
// public pages (P1, P2) and the production single-process mode.
//
//   BASE_URL=http://127.0.0.1:5221 npm run e2e:rest                      # dev stack (web proxies /api to the API)
//   BASE_URL=... PROD_URL=http://127.0.0.1:8822 npm run e2e:rest         # also the production checks
//   ONLY=laporan,admin-users npm run e2e:rest                            # run selected sections
//
// Needs a database with the demo loop (docs/e2e.md) and CHROMIUM_PATH. State changes made by the run
// (a test user, a test cycle, DIPA mark + retract, rule/weight edits) are reverted or harmless, so it can be re-run.
import { readFileSync } from "node:fs";
import { ACCOUNTS, BASE_URL, check, launch, login, newSession, record, summary } from "./rest-lib.mjs";

const PROD_URL = process.env.PROD_URL?.replace(/\/$/, "") ?? "";
const ONLY = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const want = (name) => ONLY.length === 0 || ONLY.includes(name);
const stamp = Date.now().toString(36);

/** fetch through the page so the session cookie rides along. */
const api = (page, method, path, body) =>
  page.evaluate(
    async ([method, path, body]) => {
      const r = await fetch(`/api${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, headers: Object.fromEntries(r.headers), json: await r.json().catch(() => null) };
    },
    [method, path, body]
  );
const equal = (actual, expected, what) => {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
const bodyText = (p) => p.locator("body").innerText();
const rowText = async (p, hasText) => (await p.locator("tbody tr").filter({ hasText }).first().innerText()).replace(/\s+/g, " ");

/** The Checkbox control hides its input under a styled box, so click its label. */
const tick = (scope, name) => scope.locator("label", { hasText: name }).click();

async function signedIn(browser, role, opts) {
  const s = await newSession(browser, opts);
  await login(s, role);
  return s;
}

/* ------------------------------------------------------------------ dashboard */
async function dashboard(browser) {
  for (const role of ["reviewer", "uki", "leader", "admin"]) {
    const s = await signedIn(browser, role);
    await check(s, `dashboard ${role}`, async (p) => {
      await p.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
      await p.getByRole("heading", { name: "Dashboard", level: 1 }).waitFor();
      const text = await bodyText(p);
      for (const label of ["Item dianalisis", "Item kena aturan", "Satker siap diajukan", "Sisa hari ke tenggat ADK", "Catatan per status", "Per eselon I"]) ok(text.includes(label), `missing "${label}"`);
      const d = (await api(p, "GET", "/cycles")).json.cycles.find((c) => c.status === "aktif");
      const dash = (await api(p, "GET", `/dashboard?cycleId=${d.id}`)).json;
      ok(text.includes(String(dash.kpis.itemsAnalyzed).replace(/\B(?=(\d{3})+(?!\d))/g, ".")), "itemsAnalyzed not shown");
      // the ADK countdown must say the same on the sidebar switcher and on the KPI card
      const sidebarDays = /sisa (\d+) hari/.exec(text)?.[1];
      const cardDays = /(\d+) hari\s*\n?\s*Tenggat/.exec(text)?.[1];
      if (sidebarDays) equal(cardDays, sidebarDays, "KPI card vs sidebar countdown");
      if (role === "leader") ok(text.includes("Cakupan tampilan"), "leader: Cakupan tampilan");
      if (role === "uki") ok(/Perlu tindakan saya/.test(text), "uki: Perlu tindakan saya");
      if (role === "reviewer") {
        await p.locator("tbody tr").first().click();
        await p.waitForURL(/\/triage\?.*organizationUnitId=/);
      }
    });
    await s.context.close();
  }
}

/* ------------------------------------------------------------------ laporan */
async function laporan(browser) {
  for (const role of ["admin", "reviewer", "uki", "leader"]) {
    const s = await signedIn(browser, role);
    await check(s, `laporan ${role}: metrics, validation, CSV`, async (p) => {
      await p.goto(`${BASE_URL}/laporan`);
      await p.getByRole("heading", { name: "Validasi engine" }).waitFor();
      await p.getByText(/^L1 · /).waitFor();
      const cycle = (await api(p, "GET", "/cycles")).json.cycles.find((c) => c.status === "aktif");
      const summaryJson = (await api(p, "GET", `/reports/summary?cycleId=${cycle.id}`)).json;
      const [download] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: /Ekspor CSV/ }).click()]);
      const buffer = readFileSync(await download.path());
      ok(buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf, "CSV lost its UTF-8 BOM");
      ok(/^nirmala-catatan-\d{4}-(pagu|alokasi)\.csv$/.test(download.suggestedFilename()), `filename ${download.suggestedFilename()}`);
      const lines = buffer.toString("utf8").replace(/^﻿/, "").split("\r\n").filter(Boolean);
      ok(lines[0].startsWith("nomor_chr,eselon_i_kode,"), "CSV header");
      equal(lines.length - 1, summaryJson.notesIssued, "CSV rows vs notesIssued");
      const scopeNote = await p.locator("main").innerText();
      if (role === "reviewer" || role === "uki") ok(/Ekspor CSV mengikuti akses Anda/.test(scopeNote), "scope note for limited roles");
    });
    if (role === "admin") {
      await check(s, "laporan admin: eselon I filter narrows numbers and CSV", async (p) => {
        const units = (await api(p, "GET", "/organization-units")).json.organizationUnits;
        ok(units.length >= 2, "need two eselon I");
        const cycle = (await api(p, "GET", "/cycles")).json.cycles.find((c) => c.status === "aktif");
        const unit = units[units.length - 1];
        const expected = (await api(p, "GET", `/reports/summary?cycleId=${cycle.id}&organizationUnitId=${unit.id}`)).json.notesIssued;
        await p.getByLabel("Eselon I").selectOption(unit.id);
        await p.waitForResponse((r) => r.url().includes("/reports/summary") && r.url().includes(unit.id));
        await p.getByText(`Ekspor CSV mengikuti akses Anda: hanya ${unit.shortName}.`).waitFor();
        const [download] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: /Ekspor CSV/ }).click()]);
        const lines = readFileSync(await download.path(), "utf8").split("\r\n").filter(Boolean);
        equal(lines.length - 1, expected, "CSV rows for the filtered eselon I");
      });
      await check(s, "laporan: export of an eselon I outside the scope is refused (API 403)", async (p) => {
        const r = await api(p, "GET", "/reports/export.csv?cycleId=x&organizationUnitId=org_tidak_ada");
        ok([403, 404].includes(r.status), `status ${r.status}`);
      });
    }
    await s.context.close();
  }
}

/* ------------------------------------------------------------------ admin: rules */
async function adminRules(browser) {
  const s = await signedIn(browser, "admin");
  await check(s, "admin rules: toggle off and on", async (p) => {
    await p.goto(`${BASE_URL}/admin/aturan`);
    await p.getByRole("table").waitFor();
    const sw = () => p.getByRole("switch", { name: /aturan R03/ });
    const before = await sw().getAttribute("aria-checked");
    await sw().click();
    await p.waitForFunction((b) => document.querySelector('[role=switch][aria-label$="aturan R03"]')?.getAttribute("aria-checked") !== b, before);
    await sw().click();
    await p.waitForFunction((b) => document.querySelector('[role=switch][aria-label$="aturan R03"]')?.getAttribute("aria-checked") === b, before);
  });
  await check(s, "admin rules: edit panel saves, reflects the name, then restores", async (p) => {
    await p.getByRole("button", { name: "Ubah aturan R02" }).click();
    const d = p.getByRole("dialog");
    await d.waitFor();
    const name = d.getByLabel("Nama aturan");
    const old = await name.inputValue();
    await name.fill(`${old} ${stamp}`);
    await d.getByRole("button", { name: "Simpan perubahan" }).click();
    await d.waitFor({ state: "hidden" });
    await p.getByText(`${old} ${stamp}`).first().waitFor();
    await p.getByRole("button", { name: "Ubah aturan R02" }).click();
    await d.waitFor();
    await d.getByLabel("Nama aturan").fill(old);
    await d.getByRole("button", { name: "Simpan perubahan" }).click();
    await d.waitFor({ state: "hidden" });
  });
  await check(s, "admin rules: every rule kind opens and saves", async (p) => {
    for (const code of ["R01", "R05", "R07", "R08"]) {
      await p.getByRole("button", { name: `Ubah aturan ${code}` }).click();
      const d = p.getByRole("dialog");
      await d.waitFor();
      const reason = d.getByLabel(/^Alasan/);
      const old = await reason.inputValue();
      await reason.fill(`${old} ${stamp}`);
      await d.getByRole("button", { name: "Simpan perubahan" }).click();
      await d.waitFor({ state: "hidden" });
      await p.getByRole("button", { name: `Ubah aturan ${code}` }).click();
      await d.waitFor();
      await d.getByLabel(/^Alasan/).fill(old);
      await d.getByRole("button", { name: "Simpan perubahan" }).click();
      await d.waitFor({ state: "hidden" });
    }
  });
  await check(s, "admin rules: invalid regex is rejected before saving", async (p) => {
    await p.getByRole("button", { name: "Ubah aturan R02" }).click();
    const d = p.getByRole("dialog");
    await d.waitFor();
    await d.getByLabel(/Pola uraian/).fill("(bad[");
    await d.getByRole("button", { name: "Simpan perubahan" }).click();
    await p.waitForTimeout(300);
    ok(await d.isVisible(), "panel closed on invalid pattern");
    ok(/tidak valid|Pola/i.test(await d.innerText()), "no pattern error shown");
    await d.getByRole("button", { name: "Batal" }).click();
    await d.getByRole("button", { name: "Buang perubahan" }).click();
  });
  await check(s, "admin rules: API refuses a bad regex with the contract message", async (p) => {
    s.expect(/400 PUT/);
    const rules = (await api(p, "GET", "/admin/rules")).json.rules;
    const r02 = rules.find((r) => r.code === "R02");
    const res = await api(p, "PUT", `/admin/rules/${r02.id}`, { params: { ...r02.params, include: "(bad[" } });
    equal(res.status, 400, "status");
    ok(/Pola tidak valid/.test(res.json.error), res.json.error);
  });
  await s.context.close();
}

/* ------------------------------------------------------------------ admin: weights */
async function adminWeights(browser) {
  const s = await signedIn(browser, "admin");
  await check(s, "admin weights: invalid total blocks save; new version; recalculate job polls to done", async (p) => {
    await p.goto(`${BASE_URL}/admin/bobot`);
    await p.getByRole("table").first().waitFor();
    const inputs = p.getByLabel(/^Bobot baru F/);
    equal(await inputs.count(), 5, "factor inputs");
    const values = (await inputs.evaluateAll((els) => els.map((e) => Number(e.value))));
    const save = p.getByRole("button", { name: /^Simpan/ });
    ok(await save.isDisabled(), "save enabled without changes");
    const a = values[0] >= values[1] ? [0, 1] : [1, 0];
    await inputs.nth(a[0]).fill(String(values[a[0]] + 1));
    ok(await save.isDisabled(), "save enabled while total != 100");
    await inputs.nth(a[1]).fill(String(values[a[1]] - 1));
    await save.click();
    await p.getByText(/tersimpan dan sekarang aktif/).waitFor();
    const cfg = (await api(p, "GET", "/admin/risk-config")).json;
    equal(cfg.active.weights[`F${a[0] + 1}`], values[a[0]] + 1, "active weight");
    await p.getByRole("button", { name: /Hitung ulang/ }).click();
    await p.getByText(/Hitung ulang selesai/).waitFor({ timeout: 30000 });
    await p.getByText(/item dinilai dengan bobot versi/).waitFor();
  });
  await check(s, "admin weights: thresholds high <= medium is refused in the form", async (p) => {
    await p.getByLabel("Sedang mulai dari").fill("90");
    await p.getByLabel("Tinggi mulai dari").fill("80");
    ok(await p.getByRole("button", { name: /^Simpan/ }).isDisabled(), "save enabled with medium >= high");
  });
  await s.context.close();
}

/* ------------------------------------------------------------------ admin: users */
async function adminUsers(browser) {
  const s = await signedIn(browser, "admin");
  const username = `qa.${stamp}`;
  const password = "Sangat-Rahasia-123";
  await check(s, "admin users: create (scope required), edit scopes, deactivate", async (p) => {
    await p.goto(`${BASE_URL}/admin/pengguna`);
    await p.getByRole("table").waitFor();
    await p.getByRole("button", { name: /Tambah pengguna/ }).click();
    const d = p.getByRole("dialog");
    await d.waitFor();
    await d.getByLabel("Username").fill(username);
    await d.getByLabel("Nama").fill("QA Pengguna");
    await d.getByLabel("Peran").selectOption("reviewer");
    await d.getByLabel("Kata sandi").fill(password);
    await d.getByRole("button", { name: /Simpan pengguna/ }).click();
    await d.getByText("Pilih minimal satu eselon I untuk peran ini.").first().waitFor();
    const units = (await api(p, "GET", "/organization-units")).json.organizationUnits;
    await tick(d, units[0].shortName);
    await d.getByRole("button", { name: /Simpan pengguna/ }).click();
    await d.waitFor({ state: "hidden" });
    ok((await rowText(p, username)).includes(units[0].shortName), "scope in the row");
    await p.getByRole("button", { name: `Ubah ${username}` }).click();
    await d.waitFor();
    await tick(d, units[0].shortName);
    await tick(d, units[1].shortName);
    await d.getByRole("button", { name: /Simpan perubahan/ }).click();
    await d.waitFor({ state: "hidden" });
    const row = await rowText(p, username);
    ok(row.includes(units[1].shortName) && !row.includes(units[0].shortName), `scopes after edit: ${row}`);
    await p.getByRole("switch", { name: new RegExp(`akun ${username}`) }).click();
    await p.getByRole("button", { name: "Nonaktifkan" }).last().click();
    await p.locator("tbody tr").filter({ hasText: username }).getByText("Nonaktif").waitFor();
  });
  await check(s, "admin users: a deactivated user cannot sign in", async (p) => {
    const fresh = await newSession(browser);
    fresh.expect(/401/);
    await fresh.page.goto(`${BASE_URL}/login`);
    await fresh.page.getByLabel("Username").fill(username);
    await fresh.page.getByLabel("Kata sandi").fill(password);
    await fresh.page.getByRole("button", { name: /^Masuk/ }).click();
    await fresh.page.getByText(/tidak valid|salah/i).first().waitFor();
    equal(new URL(fresh.page.url()).pathname, "/login", "stays on /login");
    await fresh.context.close();
  });
  await check(s, "admin users: reactivate, then the user signs in with an empty-state screens (no scope)", async (p) => {
    await p.getByRole("switch", { name: new RegExp(`akun ${username}`) }).click();
    await p.locator("tbody tr").filter({ hasText: username }).getByText("Aktif").waitFor();
    const id = (await api(p, "GET", "/users")).json.users.find((u) => u.username === username).id;
    equal((await api(p, "PUT", `/users/${id}/scopes`, { organizationUnitIds: [] })).status, 200, "clear scopes");
    const user = await newSession(browser);
    user.expect(/^$/);
    await user.page.goto(`${BASE_URL}/login`);
    await user.page.getByLabel("Username").fill(username);
    await user.page.getByLabel("Kata sandi").fill(password);
    await user.page.getByRole("button", { name: /^Masuk/ }).click();
    await user.page.waitForURL((u) => !u.pathname.startsWith("/login"));
    for (const path of ["/dashboard", "/laporan"]) {
      await check(user, `empty-scope reviewer ${path} renders without errors`, async (q) => {
        await q.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
        await q.locator("main h1").first().waitFor();
        ok(!/Terjadi kesalahan|belum bisa dimuat/i.test(await bodyText(q)), "error panel shown");
      });
    }
    await user.context.close();
    await p.getByRole("switch", { name: new RegExp(`akun ${username}`) }).click();
    await p.getByRole("button", { name: "Nonaktifkan" }).last().click();
    await p.locator("tbody tr").filter({ hasText: username }).getByText("Nonaktif").waitFor();
  });
  await check(s, "admin users: an admin cannot deactivate themselves (409 message shown)", async (p) => {
    s.expect(/409 PUT/);
    await p.getByRole("switch", { name: /akun admin\.demo/ }).click();
    await p.getByRole("button", { name: "Nonaktifkan" }).last().click();
    await p.getByText(/tidak dapat menonaktifkan dirinya sendiri/).first().waitFor();
    ok(await p.getByRole("switch", { name: /akun admin\.demo/ }).getAttribute("aria-checked") === "true", "switch flipped");
  });
  await s.context.close();
}

/* ------------------------------------------------------------------ admin: cycles + DIPA, public pages */
async function cyclesAndPublic(browser) {
  const admin = await signedIn(browser, "admin");
  const ap = admin.page;
  const visitor = () => newSession(browser); // a fresh context each time: /api/public/* is cached for 5 minutes

  await check(admin, "admin cycles: start clean (retract an earlier DIPA mark)", async (p) => {
    await p.goto(`${BASE_URL}/admin/siklus`);
    await p.getByRole("table").waitFor();
    const cycles = (await api(p, "GET", "/cycles")).json.cycles;
    for (const cycle of cycles.filter((c) => c.dipaIssuedAt)) await api(p, "DELETE", `/cycles/${cycle.id}/dipa-issued`);
  });

  await check(admin, "admin cycles: create, duplicate is refused, edit to Selesai", async (p) => {
    admin.expect(/409 POST/);
    const year = 2090 + (parseInt(stamp.slice(-2), 36) % 10);
    const existing = (await api(p, "GET", "/cycles")).json.cycles.some((c) => c.fiscalYear === year && c.stage === "alokasi");
    const used = existing ? year + 0 : year;
    await p.reload();
    await p.getByRole("table").waitFor();
    if (!existing) {
      await p.getByRole("button", { name: /Buat siklus/ }).first().click();
      const d = p.getByRole("dialog");
      await d.waitFor();
      await d.getByLabel("Tahun anggaran").fill(String(used));
      await d.getByLabel("Tenggat ADK").fill(`${used}-03-01`);
      await d.getByRole("button", { name: /Simpan siklus|Buat siklus|Simpan/ }).last().click();
      await d.waitFor({ state: "hidden" });
    }
    await p.getByRole("button", { name: /Buat siklus/ }).first().click();
    const dup = p.getByRole("dialog");
    await dup.waitFor();
    await dup.getByLabel("Tahun anggaran").fill(String(used));
    await dup.getByRole("button", { name: /Simpan siklus|Buat siklus|Simpan/ }).last().click();
    await dup.getByText(`Siklus TA ${used} tahap Alokasi sudah ada.`).waitFor();
    await dup.getByRole("button", { name: "Batal" }).click();
    await dup.waitFor({ state: "hidden" });
    const created = (await api(p, "GET", "/cycles")).json.cycles.find((c) => c.fiscalYear === used && c.stage === "alokasi");
    await p.getByRole("button", { name: `Ubah ${created.name}` }).click();
    const edit = p.getByRole("dialog");
    await edit.waitFor();
    await edit.getByLabel("Status").selectOption("selesai");
    await edit.getByRole("button", { name: "Simpan perubahan" }).click();
    await edit.waitFor({ state: "hidden" });
    equal((await api(p, "GET", "/cycles")).json.cycles.find((c) => c.id === created.id).status, "selesai", "status after edit");
  });

  await check(admin, "public: empty state before DIPA is marked (no 404 noise, no data)", async () => {
    const v = await visitor();
    await v.page.goto(`${BASE_URL}/transparansi`, { waitUntil: "networkidle" });
    await v.page.getByText("Belum ada siklus yang DIPA-nya terbit").waitFor();
    ok((await api(v.page, "GET", "/public/cycles")).json.cycles.length === 0, "public cycles not empty");
    await v.context.close();
  });

  await check(admin, "admin cycles: mark DIPA issued from the dialog", async (p) => {
    const active = (await api(p, "GET", "/cycles")).json.cycles.find((c) => c.status === "aktif");
    await p.goto(`${BASE_URL}/admin/siklus`);
    await p.getByRole("table").waitFor();
    await p.locator("tbody tr").filter({ hasText: String(active.fiscalYear) }).filter({ hasNotText: "Selesai" }).getByRole("button", { name: /Tandai DIPA terbit/ }).click();
    const d = p.getByRole("dialog");
    await d.waitFor();
    await d.getByRole("button", { name: /Tandai DIPA terbit/ }).click();
    await d.waitFor({ state: "hidden" });
    await p.getByText("Agregat tampil di Transparansi publik").first().waitFor();
    const second = await api(p, "POST", `/cycles/${active.id}/dipa-issued`, {});
    equal(second.status, 409, "second mark");
    admin.drain();
  });

  let publicJson;
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) {
    await check(admin, `public P2 at ${width}px: aggregates only, no horizontal scroll`, async () => {
      const v = await visitor();
      const p = v.page;
      await p.setViewportSize({ width, height });
      await p.goto(`${BASE_URL}/transparansi`, { waitUntil: "networkidle" });
      await p.getByText("Catatan per eselon I dan kategori").waitFor();
      const [scrollWidth, innerWidth] = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      ok(scrollWidth <= innerWidth, `horizontal scroll ${scrollWidth} > ${innerWidth}`);
      publicJson = (await api(p, "GET", "/public/transparency")).json;
      const text = await bodyText(p);
      ok(!/Rp\s?\d|Satker [A-Z]|rupiah per item:/.test(text.replace("nilai rupiah per item", "")), "per-item money or Satker name on the public page");
      if (width === 1440) {
        const totalRow = (await p.locator("tbody tr").last().innerText()).replace(/\s+/g, " ");
        ok(totalRow.startsWith("Total"), `total row: ${totalRow}`);
        await p.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/rest-p2.png` : undefined, fullPage: true }).catch(() => {});
      }
      await v.context.close();
    });
  }

  await check(admin, "public: API exposes aggregates only (privacy)", async (p) => {
    const keys = JSON.stringify(Object.keys(publicJson).sort());
    equal(keys, JSON.stringify(["cycle", "generatedAt", "kpis", "minNotes", "rows", "synthetic", "totals"]), "top-level keys");
    const satker = (await api(p, "GET", "/work-units")).json.workUnits;
    const raw = JSON.stringify(publicJson);
    for (const w of satker) ok(!raw.includes(w.name) && !raw.includes(`"${w.code}"`), `Satker ${w.code} leaked`);
    const units = (await api(p, "GET", "/organization-units")).json.organizationUnits;
    for (const row of publicJson.rows) {
      ok(row.kind === "lainnya" ? row.label === "Lainnya" : units.some((u) => u.shortName === row.label), `row label ${row.label}`);
      if (row.kind === "eselon") ok(row.total >= publicJson.minNotes, `eselon row below k: ${row.label} ${row.total}`);
    }
    const hasSmall = units.length >= 1 && publicJson.rows.some((r) => r.kind === "lainnya");
    record(`public: "Lainnya" merge ${hasSmall ? "exercised" : "not exercised (set PUBLIC_MIN_NOTES above the smallest eselon I total to exercise it)"}`, true);
    const report = (await api(p, "GET", `/reports/summary?cycleId=${publicJson.cycle.id}`)).json;
    equal(publicJson.kpis.notesTotal, report.notesIssued, "public total vs laporan notesIssued");
    ok(!(await api(p, "GET", "/public/transparency?cycleId=tidak-ada")).json.cycle, "unknown cycle should 404");
    admin.drain();
  });

  await check(admin, "public: P1 home at 390/768/1440", async () => {
    for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
      const v = await visitor();
      await v.page.setViewportSize({ width, height });
      await v.page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
      await v.page.getByRole("link", { name: /Masuk/ }).first().waitFor();
      const [sw, iw] = await v.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      ok(sw <= iw, `P1 horizontal scroll at ${width}`);
      const issues = v.drain();
      ok(issues.length === 0, issues.join(";"));
      await v.context.close();
    }
  });

  await check(admin, "admin cycles: retract DIPA; public is empty again", async (p) => {
    await p.goto(`${BASE_URL}/admin/siklus`);
    await p.getByRole("table").waitFor();
    const issued = (await api(p, "GET", "/cycles")).json.cycles.find((c) => c.dipaIssuedAt);
    await p.getByRole("button", { name: `Ubah ${issued.name}` }).click();
    const d = p.getByRole("dialog");
    await d.waitFor();
    await d.getByRole("button", { name: "Tarik penandaan DIPA" }).click();
    await d.getByRole("button", { name: "Ya, tarik penandaan" }).click();
    await d.waitFor({ state: "hidden" });
    await p.getByText("Belum", { exact: true }).first().waitFor();
    const v = await visitor();
    ok((await api(v.page, "GET", "/public/cycles")).json.cycles.length === 0, "public cycles after retract");
    await v.context.close();
  });
  await admin.context.close();
}

/* ------------------------------------------------------------------ admin: audit log */
async function adminAudit(browser) {
  const s = await signedIn(browser, "admin");
  await check(s, "admin audit: facets, filters, reset, pagination", async (p) => {
    await p.goto(`${BASE_URL}/admin/audit`);
    await p.getByRole("table").waitFor();
    const total = Number(/(\d+) entri/.exec(await bodyText(p))[1]);
    const facets = (await api(p, "GET", "/audit-logs/facets")).json;
    const options = await p.getByLabel("Aksi").locator("option").count();
    equal(options, facets.actions.length + 1, "Aksi options vs facets");
    await p.getByLabel("Aksi").selectOption(facets.actions[0]);
    await p.waitForResponse((r) => r.url().includes(`action=${encodeURIComponent(facets.actions[0])}`));
    const filtered = Number(/(\d+) entri/.exec(await bodyText(p))[1]);
    ok(filtered > 0 && filtered <= total, `filtered total ${filtered} of ${total}`);
    const rows = await p.locator("tbody tr").count();
    ok(rows === Math.min(filtered, 25), `rows ${rows}`);
    await p.getByLabel("Aksi").selectOption("");
    await p.getByLabel("Pengguna").selectOption(facets.actors[0].id);
    await p.waitForResponse((r) => r.url().includes(`actorUserId=${facets.actors[0].id}`));
    if (total > 25) {
      await p.getByLabel("Pengguna").selectOption("");
      await p.getByRole("button", { name: /Berikutnya|Halaman berikutnya|2/ }).first().click();
      await p.waitForResponse((r) => r.url().includes("page=2"));
      ok(/Menampilkan 26/.test(await bodyText(p)), "page 2 range");
    }
    const mine = (await api(p, "GET", "/audit-logs?pageSize=100")).json.logs.map((l) => l.action);
    ok(mine.includes("risk_config.recalculated") || mine.includes("rule.updated") || mine.length > 0, "audit has entries");
  });
  await s.context.close();
}

/* ------------------------------------------------------------------ state screens */
async function states(browser) {
  const cases = [
    ["reviewer", ["/admin/aturan", "/admin/bobot", "/admin/pengguna", "/admin/siklus", "/admin/audit"]],
    ["uki", ["/admin/aturan", "/admin/audit"]],
    ["leader", ["/admin/pengguna", "/admin/siklus"]]
  ];
  for (const [role, paths] of cases) {
    const s = await signedIn(browser, role);
    for (const path of paths) {
      await check(s, `403 screen: ${role} on ${path}`, async (p) => {
        await p.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
        await p.getByRole("heading", { name: "Akses ditolak" }).waitFor();
        ok(!/Katalog aturan\s*\n.*Isi aturan/.test(await bodyText(p)), "page content behind the 403");
      });
    }
    await check(s, `403 from the API: ${role} cannot read admin data`, async (p) => {
      s.expect(/403/);
      equal((await api(p, "GET", "/admin/rules")).status, 403, "rules");
      equal((await api(p, "GET", "/audit-logs")).status, 403, "audit");
      equal((await api(p, "GET", "/users")).status, 403, "users");
      s.drain();
    });
    await s.context.close();
  }
  const anon = await newSession(browser);
  await check(anon, "unauthenticated: internal routes redirect to /login, API answers 401", async (p) => {
    anon.expect(/401/);
    await p.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
    ok(new URL(p.url()).pathname === "/login", `url ${p.url()}`);
    equal((await api(p, "GET", "/dashboard?cycleId=x")).status, 401, "dashboard api");
    equal((await api(p, "GET", "/reports/export.csv?cycleId=x")).status, 401, "export api");
    anon.drain();
  });
  await anon.context.close();
}

/* ------------------------------------------------------------------ production single-process mode */
async function production(browser) {
  const base = PROD_URL;
  const s = await newSession(browser);
  await s.page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const hosts = new Set();
  s.page.on("request", (r) => hosts.add(new URL(r.url()).host));
  const get = (path) => s.context.request.get(`${base}${path}`);

  await check(s, "prod: index.html headers (CSP, nosniff, no-cache) and API health", async () => {
    const r = await get("/");
    equal(r.status(), 200, "status");
    const h = r.headers();
    ok(/default-src 'self'/.test(h["content-security-policy"] ?? ""), "CSP");
    ok(/script-src 'self'/.test(h["content-security-policy"]) && !/script-src[^;]*unsafe/.test(h["content-security-policy"]), "script-src must be self only");
    equal(h["x-content-type-options"], "nosniff", "nosniff");
    equal(h["cache-control"], "no-cache", "index cache-control");
    equal((await (await get("/api/health")).json()).status, "ok", "health");
  });
  await check(s, "prod: SPA fallback for deep links, JSON 404 for unknown API and asset", async () => {
    for (const path of ["/transparansi", "/admin/audit", "/chr/abc/cetak"]) {
      const r = await get(path);
      equal(r.status(), 200, `${path} status`);
      ok((r.headers()["content-type"] ?? "").startsWith("text/html"), `${path} content-type`);
    }
    const api404 = await get("/api/tidak-ada");
    equal(api404.status(), 404, "api 404");
    ok((api404.headers()["content-type"] ?? "").includes("json"), "api 404 is JSON");
    equal((await get("/assets/tidak-ada-abc123.js")).status(), 404, "missing asset");
    const cached = await get((await (await get("/")).text()).match(/\/assets\/[^"]+\.js/)[0]);
    ok(/immutable/.test(cached.headers()["cache-control"] ?? ""), "hashed asset not immutable");
    const publicCache = await get("/api/public/cycles");
    ok(/max-age=300/.test(publicCache.headers()["cache-control"] ?? ""), "public cache-control");
    ok(/no-store/.test((await get("/api/health")).headers()["cache-control"] ?? ""), "api no-store");
  });
  await check(s, "prod: sign in, dashboard, laporan, CSV download, admin page under the CSP", async (p) => {
    await p.goto(`${base}/login`);
    await p.getByLabel("Username").fill(ACCOUNTS.admin.username);
    await p.getByLabel("Kata sandi").fill(ACCOUNTS.admin.password);
    await p.getByRole("button", { name: /^Masuk/ }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"));
    await p.goto(`${base}/admin/audit`, { waitUntil: "networkidle" });
    await p.getByRole("table").waitFor();
    await p.goto(`${base}/laporan`, { waitUntil: "networkidle" });
    await p.getByRole("heading", { name: "Validasi engine" }).waitFor();
    const [download] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: /Ekspor CSV/ }).click()]);
    const buf = readFileSync(await download.path());
    ok(buf[0] === 0xef && buf[1] === 0xbb, "BOM missing in production");
    await p.goto(`${base}/admin/bobot`, { waitUntil: "networkidle" });
    await p.getByRole("table").first().waitFor();
    await p.getByRole("button", { name: /Hitung ulang/ }).click();
    await p.getByText(/Hitung ulang selesai/).waitFor({ timeout: 30000 });
  });
  await check(s, "prod: fonts are self-hosted, no external hosts, no CSP violation", async (p) => {
    await p.goto(`${base}/transparansi`, { waitUntil: "networkidle" });
    const state = await p.evaluate(async () => {
      await document.fonts.ready;
      return { fonts: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family), csp: window.__csp };
    });
    ok(state.fonts.some((f) => /Schibsted/.test(f)), `Schibsted not loaded: ${state.fonts}`);
    ok(state.fonts.some((f) => /Plex Mono/.test(f)), `IBM Plex Mono not loaded: ${state.fonts}`);
    equal(state.csp.length, 0, `CSP violations: ${state.csp.join(" | ")}`);
    const own = new URL(base).host;
    const external = [...hosts].filter((h) => h !== own);
    equal(external.length, 0, `external hosts: ${external}`);
  });
  await s.context.close();
}

/* ------------------------------------------------------------------ run */
const browser = await launch();
const sections = [
  ["dashboard", dashboard],
  ["laporan", laporan],
  ["admin-rules", adminRules],
  ["admin-weights", adminWeights],
  ["admin-users", adminUsers],
  ["cycles-public", cyclesAndPublic],
  ["admin-audit", adminAudit],
  ["states", states]
];
console.log(`e2e:rest against ${BASE_URL}${PROD_URL ? ` and ${PROD_URL} (production)` : ""}`);
for (const [name, fn] of sections) if (want(name)) await fn(browser);
if (PROD_URL && want("production")) await production(browser);
await browser.close();
process.exit(summary() ? 0 : 1);
