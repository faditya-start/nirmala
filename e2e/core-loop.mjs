#!/usr/bin/env node
/**
 * Smoke test end-to-end untuk loop inti NIRMALA terhadap stack NYATA (API + web, tanpa mock), di browser sungguhan.
 *
 * Alur: login -> impor Awal -> triage (filter, URL, halaman) -> detail (konfirmasi, dismiss) -> CHR (catatan, rekomendasi,
 * terbitkan, terkunci, cetak, tanggapan UKI, adendum) -> impor Revisi -> tracker (setujui massal, setujui, kembalikan,
 * justifikasi, terima) -> Satker -> CHR selesai. Memeriksa juga badge shell dan penjagaan peran/scope.
 *
 * Prasyarat: stack berjalan dengan DB baru (lihat docs/e2e.md; `npm run e2e:core:fresh` menyalakannya sendiri).
 * Env: BASE_URL (default http://localhost:5211), CHROMIUM_PATH, FIXTURE_DIR, ARTIFACT_DIR (screenshot saat gagal), HEADED=1.
 * Keluar 0 bila semua PASS, 1 bila ada FAIL. Hanya data sintetis.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.BASE_URL ?? "http://localhost:5211").replace(/\/$/, "");
const FIXTURES = resolve(process.env.FIXTURE_DIR ?? join(here, "../apps/api/fixtures/synthetic"));
const ARTIFACTS = resolve(process.env.ARTIFACT_DIR ?? join(here, "../e2e-artifacts"));
const CHROMIUM =
  process.env.CHROMIUM_PATH ??
  ["/home/milahlyy/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((path) => existsSync(path));
if (!CHROMIUM) {
  console.error("CHROMIUM_PATH belum diisi dan tidak ada Chromium di lokasi umum.");
  process.exit(2);
}

const USERS = {
  reviewer: ["reviewer.demo", "Review123!"],
  uki: ["uki.demo", "Uki12345!"],
  leader: ["pimpinan.demo", "Pimpin123!"],
  admin: ["admin.demo", "Admin123!"]
};

// ---------------------------------------------------------------- kerangka uji
const results = [];
let current = null;
const state = {};
let browser;
const sessions = {};

class Skip extends Error {}

function expectIssue(pattern) {
  current.allowed.push(pattern);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion gagal: ${message}`);
}

async function step(name, fn) {
  current = { name, allowed: [] };
  for (const session of Object.values(sessions)) session.issues.length = 0;
  const started = Date.now();
  try {
    await fn();
    const stray = Object.entries(sessions).flatMap(([role, session]) => session.issues.filter((issue) => !current.allowed.some((pattern) => pattern.test(issue))).map((issue) => `[${role}] ${issue}`));
    if (stray.length > 0) throw new Error(`Galat konsol/jaringan tak terduga:\n    ${[...new Set(stray)].join("\n    ")}`);
    results.push({ name, ok: true });
    console.log(`PASS  ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false, error });
    const message = String(error.message ?? error).split("\n").filter((line) => !/^\s*(-|\d+ ×|×)/.test(line.replace(/\x1b\[[0-9;]*m/g, ""))).slice(0, 8).join("\n      ");
    console.log(`FAIL  ${name}\n      ${message}`);
    await shot(name);
    if (process.env.E2E_DEBUG) for (const [role, one] of Object.entries(sessions)) console.log(`      [${role} @ ${one.page.url().replace(BASE, "")}] ${(await one.page.locator("body").innerText().catch(() => "")).replace(/\n+/g, " | ").slice(0, 500)}`);
  }
}

async function shot(name) {
  try {
    mkdirSync(ARTIFACTS, { recursive: true });
    for (const [role, session] of Object.entries(sessions)) {
      const slug = name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60);
      await session.page.screenshot({ path: join(ARTIFACTS, `${slug}.${role}.png`) });
    }
  } catch {
    // screenshot hanya bantuan diagnosis
  }
}

async function session(role, { fresh = false } = {}) {
  if (sessions[role] && !fresh) return sessions[role];
  if (sessions[role]) await sessions[role].context.close();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const issues = [];
  const rel = (url) => url.replace(BASE, "");
  page.on("console", (message) => {
    if (message.type() === "error") issues.push(`console.error: ${message.text().slice(0, 240)}`);
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().startsWith(BASE)) issues.push(`HTTP ${response.status()} ${response.request().method()} ${rel(response.url())}`);
  });
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "";
    if (!/ERR_ABORTED/.test(reason)) issues.push(`requestfailed ${rel(request.url())} ${reason}`); // ERR_ABORTED = permintaan dibatalkan saat pindah halaman
  });
  const api = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) api.push(`${request.method()} ${rel(request.url())}`);
  });
  sessions[role] = { context, page, issues, api };
  return sessions[role];
}

async function login(role) {
  const { page } = await session(role);
  const [username, password] = USERS[role];
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return page;
}

const body = (page) => page.locator("body").innerText();
const main = (page) => page.locator("main").innerText();
const has = async (page, pattern, scope = "main") => pattern.test(await page.locator(scope).innerText());
async function waitGone(page, pattern, scope = "main", timeout = 15_000) {
  await page.waitForFunction(({ source, flags, selector }) => !new RegExp(source, flags).test(document.querySelector(selector)?.innerText ?? ""), { source: pattern.source, flags: pattern.flags, selector: scope }, { timeout });
}
async function waitText(page, pattern, scope = "main", timeout = 15_000) {
  await page.waitForFunction(({ source, flags, selector }) => new RegExp(source, flags).test(document.querySelector(selector)?.innerText ?? ""), { source: pattern.source, flags: pattern.flags, selector: scope }, { timeout });
}
const navBadge = async (page, name) => {
  const text = await page.locator("nav").first().innerText();
  const match = new RegExp(`${name}\\s*(\\d+)`).exec(text);
  return match ? Number(match[1]) : 0;
};
const headerCount = async (page) => {
  const text = await page.getByRole("banner").innerText();
  const match = /Perlu tindakan\s*(\d+)/.exec(text);
  return match ? Number(match[1]) : 0;
};
async function waitHeaderCount(page, predicate, label) {
  const deadline = Date.now() + 10_000;
  let last = null;
  while (Date.now() < deadline) {
    last = await headerCount(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(300);
  }
  throw new Error(`Badge "Perlu tindakan" tidak sesuai (${label}); terakhir ${last}`);
}

async function uploadSnapshot(page, { file, organization, expectResult = true }) {
  await page.goto(`${BASE}/siklus`);
  await page.getByRole("button", { name: "Impor CSV" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  if (organization) await dialog.getByLabel("Eselon I").selectOption({ label: organization });
  await dialog.locator("input[type=file]").setInputFiles(join(FIXTURES, file));
  await dialog.getByRole("button", { name: /Unggah dan proses/ }).click();
  if (expectResult) await page.waitForURL((url) => url.searchParams.has("hasil"), { timeout: 60_000 });
  return dialog;
}

// ---------------------------------------------------------------- langkah
async function run() {
  browser = await chromium.launch({ executablePath: CHROMIUM, headless: !process.env.HEADED, args: ["--no-sandbox"] });
  console.log(`NIRMALA e2e core loop -> ${BASE}\n`);

  await step("preflight: API sehat dan web menyajikan SPA", async () => {
    const health = await fetch(`${BASE}/api/health`).then((response) => response.json());
    assert(health.status === "ok", "GET /api/health");
    const html = await fetch(`${BASE}/login`).then((response) => response.text());
    assert(/<div id="root"/.test(html), "web mengembalikan index.html");
    const unauthenticated = await fetch(`${BASE}/api/cycles`);
    assert(unauthenticated.status === 401, "GET /api/cycles tanpa sesi harus 401");
  });

  // ---- S1 login
  await step("S1 login: sandi salah menampilkan galat, tidak ada sesi", async () => {
    const { page } = await session("reviewer");
    expectIssue(/HTTP 401 POST \/api\/auth\/login/);
    expectIssue(/console\.error: Failed to load resource.*401/);
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Username").fill("reviewer.demo");
    await page.getByLabel("Kata sandi").fill("salah-sandi");
    await page.getByRole("button", { name: "Masuk" }).click();
    await page.getByRole("alert").waitFor();
    assert(/tidak sesuai/i.test(await page.getByRole("alert").innerText()), "pesan galat dari server tampil");
    assert(page.url().includes("/login"), "tetap di /login");
  });
  await step("S1 login: halaman internal tanpa sesi dialihkan ke /login lalu kembali setelah masuk", async () => {
    const { page } = await session("reviewer");
    expectIssue(/HTTP 401 GET \/api\/auth\/me/);
    expectIssue(/console\.error: Failed to load resource.*401/);
    await page.goto(`${BASE}/triage`);
    await page.waitForURL(/\/login/);
    await page.getByLabel("Username").fill(USERS.reviewer[0]);
    await page.getByLabel("Kata sandi").fill(USERS.reviewer[1]);
    await page.getByRole("button", { name: "Masuk" }).click();
    await page.waitForURL(/\/triage/);
  });

  // ---- S3 impor
  await step("S3 siklus: belum ada snapshot, dialog impor memakai eselon I milik reviewer", async () => {
    const { page } = await session("reviewer");
    await page.goto(`${BASE}/siklus`);
    await waitText(page, /Belum ada snapshot/);
    await page.getByRole("button", { name: "Impor CSV" }).first().click();
    const dialog = page.locator("dialog[open]");
    await dialog.waitFor();
    const options = await dialog.getByLabel("Eselon I").locator("option").allInnerTexts();
    assert(options.length === 1 && /DJCA/.test(options[0]), `reviewer hanya melihat DJCA (dapat: ${options.join(",")})`);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
  });
  await step("S3 impor Awal 90001: job async berjalan dan halaman hasil tampil", async () => {
    const { page, api } = await session("reviewer");
    api.length = 0;
    await uploadSnapshot(page, { file: "awal/es1_90001_2026.csv" });
    await waitText(page, /Baris dibaca/, "main", 60_000);
    const text = await main(page);
    const expected = readFileSync(join(FIXTURES, "awal/es1_90001_2026.csv"), "utf8").split("\n").filter(Boolean).length - 1;
    assert(new RegExp(`Baris dibaca\\s*${expected}\\b`).test(text), `baris dibaca = ${expected}\n${text.slice(0, 300)}`);
    assert(/Baris galat\s*0/.test(text), "tanpa baris galat");
    assert(/R0[1-7]/.test(text), "aturan yang terpicu tampil");
    assert(api.some((line) => /^POST .*\/snapshots/.test(line)), "POST snapshots");
    assert(api.some((line) => /GET \/api\/jobs\//.test(line)), "polling /api/jobs/:id (impor async)");
    state.resultUrl = page.url();
  });
  await step("S3 badge shell setelah impor: Risk Triage dan Perlu tindakan terisi tanpa muat ulang", async () => {
    const { page } = await session("reviewer");
    await waitHeaderCount(page, (count) => count > 0, "setelah impor");
    assert((await navBadge(page, "Risk Triage")) > 0, "badge nav Risk Triage > 0");
  });
  await step("S3 siklus: tabel snapshot, file sama tidak diproses ulang", async () => {
    const { page } = await session("reviewer");
    await page.goto(`${BASE}/siklus`);
    await waitText(page, /v1 · Awal/);
    await page.getByRole("button", { name: "Impor CSV" }).first().click();
    const dialog = page.locator("dialog[open]");
    await dialog.waitFor();
    await dialog.locator("input[type=file]").setInputFiles(join(FIXTURES, "awal/es1_90001_2026.csv"));
    await waitText(page, /File ini sama dengan snapshot/, "dialog[open]").catch(async (e) => { throw new Error((await page.locator("dialog[open]").innerText()).replace(/\n+/g, " | ")); });
    const buttons = await dialog.getByRole("button").allInnerTexts();
    assert(buttons.some((text) => /Lihat snapshot/.test(text)), `tombol lihat snapshot lama (ada: ${buttons.join("|")})`);
    await page.keyboard.press("Escape");
  });

  // ---- S4 triage
  await step("S4 triage: ringkasan, filter, status di URL, muat ulang mempertahankan filter", async () => {
    const { page } = await session("reviewer");
    await page.goto(`${BASE}/triage`);
    await waitText(page, /item kena aturan/);
    const summary = await main(page);
    assert(/\d+ item kena aturan · \d+ belum ditinjau/.test(summary), "ringkasan N item kena aturan");
    state.flagged = Number(/(\d+) item kena aturan/.exec(summary)[1]);
    assert(state.flagged >= 8, `minimal 8 item kena aturan (dapat ${state.flagged})`);
    await page.getByText("Hanya yang kena aturan").click();
    await page.waitForURL(/onlyFlagged=true/);
    await page.getByPlaceholder("Cari uraian item").fill("kaos");
    await page.waitForURL(/q=kaos/);
    await waitText(page, /Pengadaan kaos seragam/);
    await waitGone(page, /Honor satpam/);
    await page.reload();
    await waitText(page, /Pengadaan kaos seragam/);
    assert(await page.getByPlaceholder("Cari uraian item").inputValue() === "kaos", "kotak cari dipulihkan dari URL");
    assert(await page.getByLabel("Hanya yang kena aturan").isChecked(), "checkbox dipulihkan dari URL");
    await page.getByPlaceholder("Cari uraian item").fill("");
    await page.waitForURL((url) => !url.search.includes("q="));
    await page.getByLabel("Kategori").selectOption({ label: "Ketepatan penggunaan akun" });
    await page.waitForURL(/ruleCategory=/);
    await waitText(page, /Honor satpam/);
    await waitGone(page, /Pengadaan kaos/);
    await page.goto(`${BASE}/triage?page=2`);
    await waitText(page, /Menampilkan 26|26\s*[–-]/);
    assert(/page=2/.test(page.url()), "halaman 2 di URL");
  });

  // ---- S5 detail: konfirmasi dan dismiss
  async function openItem(page, fragment) {
    await page.goto(`${BASE}/triage?onlyFlagged=true&q=${encodeURIComponent(fragment)}`);
    await page.getByRole("link", { name: new RegExp(fragment, "i") }).first().click();
    await page.waitForURL(/\/triage\/[^/?]+/);
    await waitText(page, /Konteks item/);
  }
  async function confirmDefault(page) {
    await page.getByRole("button", { name: /Konfirmasi dan masukkan ke CHR/ }).click();
    await waitText(page, /Draf di CHR/);
  }

  await step("S5 detail: konfirmasi item R01 dengan ekspektasi bawaan, badge shell turun", async () => {
    const { page } = await session("reviewer");
    await page.goto(`${BASE}/triage`);
    await waitText(page, /item kena aturan/);
    const before = await navBadge(page, "Risk Triage");
    await openItem(page, "kaos seragam");
    const text = await main(page);
    assert(/Aturan yang terpicu/.test(text) && /Rincian skor/.test(text), "kartu aturan dan rincian skor tampil");
    await confirmDefault(page);
    assert(/Hapus item/.test(await main(page)), "ringkasan keputusan memuat ekspektasi");
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && (await navBadge(page, "Risk Triage")) !== before - 1) await page.waitForTimeout(300);
    assert((await navBadge(page, "Risk Triage")) === before - 1, `badge Risk Triage turun dari ${before}`);
  });
  await step("S5 detail: ubah ekspektasi (ganti akun via pemilih akun) lalu konfirmasi", async () => {
    const { page } = await session("reviewer");
    await openItem(page, "Honor satpam");
    const combo = page.getByRole("combobox").last();
    await combo.click();
    await combo.press("Control+A");
    await combo.pressSequentially("5211");
    const option = page.getByRole("option", { name: /521111 .*Perkantoran/ });
    await option.waitFor();
    await option.click();
    assert((await combo.inputValue()).startsWith("521111"), "akun terpilih terisi di kotak");
    await confirmDefault(page);
    assert(/ganti_akun|Ganti akun/.test(await main(page)) && /521111/.test(await main(page)), "ekspektasi ganti akun 521111");
  });
  await step("S5 detail: konfirmasi item R02 (kebersihan), R05 (masjid), dan R07 (koordinasi)", async () => {
    const { page } = await session("reviewer");
    for (const fragment of ["cleaning service", "masjid binaan", "Biaya koordinasi"]) {
      await openItem(page, fragment);
      await confirmDefault(page);
    }
  });
  await step("S5 detail: dismiss butuh alasan; keputusan bisa dibatalkan lalu dismiss ulang", async () => {
    const { page } = await session("reviewer");
    await openItem(page, "Langganan internet");
    await page.getByRole("radio", { name: "Dismiss" }).check({ force: true });
    const submit = page.getByRole("button", { name: "Simpan dismiss" });
    assert(await submit.isDisabled(), "tombol dismiss nonaktif sebelum alasan dipilih");
    const options = await page.getByLabel("Alasan dismiss (wajib)").locator("option").all();
    await page.getByLabel("Alasan dismiss (wajib)").selectOption({ index: options.length > 1 ? 1 : 0 });
    await page.getByLabel("Catatan (opsional)").fill("Langganan internet memang dibutuhkan satker daerah.");
    await submit.click();
    await waitText(page, /Dismiss/);
    await page.getByRole("button", { name: /Ubah keputusan/ }).click();
    await page.locator("dialog[open]").getByRole("button", { name: /Ya, batalkan keputusan/ }).click();
    await waitText(page, /Belum ditinjau/);
    await page.getByRole("radio", { name: "Dismiss" }).check({ force: true });
    await page.getByLabel("Alasan dismiss (wajib)").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Simpan dismiss" }).click();
    await waitText(page, /Dismiss/);
  });
  await step("S4 triage: filter keputusan menampilkan yang dikonfirmasi dan di-dismiss, dan jumlah belum ditinjau", async () => {
    const { page } = await session("reviewer");
    await page.goto(`${BASE}/triage?decision=confirm`);
    await waitText(page, /Honor satpam/);
    assert(!(await has(page, /Langganan internet/)), "dismiss tidak muncul di filter dikonfirmasi");
    await page.goto(`${BASE}/triage?decision=dismiss`);
    await waitText(page, /Langganan internet/);
    await page.goto(`${BASE}/triage?onlyFlagged=true&decision=belum_ditinjau`);
    await waitText(page, /Cetak kop surat/);
    assert(/\d+ item kena aturan · 2 belum ditinjau/.test(await main(page)), "tersisa 2 belum ditinjau (kop surat R04 dan laptop R06)");
  });

  await step("S5 detail: Sebelumnya/Berikutnya mengikuti daftar terfilter, dan membatalkan keputusan draf menghapus catatan CHR", async () => {
    const { page } = await session("reviewer");
    await page.goto(`${BASE}/triage?onlyFlagged=true&decision=confirm`);
    await waitText(page, /Honor satpam/);
    await page.locator("table a").first().click();
    await waitText(page, /item 1 dari 5/);
    await page.getByRole("link", { name: "Berikutnya", exact: true }).click();
    await waitText(page, /item 2 dari 5/);
    assert(page.url().includes("decision=confirm"), "filter terbawa ke detail berikutnya");
    await page.getByRole("link", { name: "Sebelumnya", exact: true }).click();
    await waitText(page, /item 1 dari 5/);
    // batalkan keputusan konfirmasi (CHR masih draf): catatan CHR ikut hilang, lalu konfirmasi ulang
    const title = (await page.locator("h1").first().innerText()).trim();
    await page.getByRole("button", { name: /Ubah keputusan/ }).click();
    await page.locator("dialog[open]").getByRole("button", { name: /Ya, batalkan keputusan/ }).click();
    await waitText(page, /Konfirmasi dan masukkan ke CHR/);
    await confirmDefault(page);
    assert(new RegExp(title.slice(0, 20)).test(await main(page)), "item yang sama dikonfirmasi ulang");
  });

  // ---- S6 CHR editor
  async function chrPage(page) {
    await page.goto(`${BASE}/chr`);
    await page.waitForURL(/\/chr\/[^/]+$/);
    await waitText(page, /Catatan per status/);
    state.chrUrl = page.url();
    state.chrId = new URL(page.url()).pathname.split("/").pop();
  }
  async function addManualNote(page, { title, text, instruction }) {
    await page.getByRole("button", { name: "Tambah catatan" }).first().click();
    const dialog = page.locator("dialog[open]");
    await dialog.waitFor();
    await dialog.getByLabel("Satker").selectOption({ index: 1 });
    await dialog.getByLabel("Judul catatan").fill(title);
    await dialog.getByLabel("Teks catatan").fill(text);
    await dialog.getByLabel("Jenis ekspektasi").selectOption("manual");
    await dialog.getByLabel("Instruksi tindak lanjut").fill(instruction);
    await dialog.getByRole("button", { name: "Simpan catatan" }).click();
    await dialog.waitFor({ state: "hidden" });
  }

  await step("S6 CHR draf: catatan dari triage terkelompok per kategori, badge CHR draf di Perlu tindakan", async () => {
    const { page } = await session("reviewer");
    await chrPage(page);
    const text = await main(page);
    assert(/Draf dokumen/.test(text), "judul 'Draf dokumen'");
    assert(/5 catatan di dokumen ini/.test(text), `5 catatan dari triage (teks: ${text.slice(0, 200)})`);
    assert(/A\. /.test(text), "grup kategori A.");
    assert(/Nomor dibuat saat CHR diterbitkan/.test(text), "nomor belum ada");
    await page.getByRole("banner").getByRole("button", { name: /Perlu tindakan/ }).click();
    const popover = await body(page);
    assert(/CHR draf|CHR/.test(popover), "popover memuat item CHR");
    await page.keyboard.press("Escape");
  });
  await step("S6 CHR draf: rekomendasi tersimpan otomatis dan bertahan setelah muat ulang", async () => {
    const { page } = await session("reviewer");
    const field = page.getByLabel("Rekomendasi reviewer");
    await field.fill("Satker diminta meninjau ulang belanja non-esensial sebelum DIPA diterbitkan.");
    await waitText(page, /Tersimpan otomatis pukul/, 'aside[aria-label="Isian dokumen"]');
    await page.reload();
    await waitText(page, /Catatan per status/);
    assert((await page.getByLabel("Rekomendasi reviewer").inputValue()).includes("belanja non-esensial"), "rekomendasi tersimpan di server");
  });
  await step("S6 CHR draf: tambah catatan manual, ubah, dan hapus catatan", async () => {
    const { page } = await session("reviewer");
    await addManualNote(page, { title: "Perjalanan dinas dobel", text: "Periksa kemungkinan duplikasi perjalanan dinas antar kegiatan.", instruction: "Lampirkan rincian perjalanan dinas per kegiatan." });
    await waitText(page, /6 catatan di dokumen ini/);
    await addManualNote(page, { title: "Catatan sementara", text: "Catatan ini akan dihapus.", instruction: "Tidak dipakai." });
    await waitText(page, /7 catatan di dokumen ini/);
    await page.locator("li", { hasText: "Perjalanan dinas dobel" }).getByRole("button", { name: /Ubah catatan/ }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Teks catatan").fill("Periksa kemungkinan duplikasi perjalanan dinas antar kegiatan (diubah).");
    await dialog.getByRole("button", { name: "Simpan catatan" }).click();
    await dialog.waitFor({ state: "hidden" });
    await waitText(page, /\(diubah\)/);
    assert((await page.locator("li", { hasText: "Perjalanan dinas dobel" }).count()) === 1, "satu catatan perjalanan dinas");
    await page.locator("li", { hasText: "Catatan sementara" }).getByRole("button", { name: /Hapus catatan/ }).click();
    await page.locator("dialog[open]").getByRole("button", { name: "Hapus catatan" }).click();
    await waitText(page, /6 catatan di dokumen ini/);
    await waitGone(page, /Catatan sementara/);
  });
  await step("S6 CHR draf: terbitkan lewat dialog, dokumen terkunci dan bernomor", async () => {
    const { page } = await session("reviewer");
    await page.getByRole("button", { name: "Terbitkan" }).first().click();
    const dialog = page.locator("dialog[open]");
    assert(/6 catatan/.test(await dialog.innerText()), "dialog menyebut 6 catatan");
    await dialog.getByRole("button", { name: "Terbitkan" }).click();
    await waitText(page, /Dokumen terbit dan terkunci/);
    const text = await main(page);
    const number = /CHR\/90001\/2026\/alokasi\/001/.exec(text);
    assert(number, `nomor CHR bentuk CHR/90001/2026/alokasi/001 (teks: ${text.slice(0, 200)})`);
    assert(await page.getByLabel("Rekomendasi reviewer").isDisabled() || (await page.getByLabel("Rekomendasi reviewer").getAttribute("readonly")) !== null, "rekomendasi tidak bisa diubah");
    assert((await page.getByRole("button", { name: /Ubah catatan/ }).count()) === 0, "tombol ubah catatan hilang");
    assert(await page.getByRole("button", { name: "Tambah adendum" }).count() > 0, "tombol Tambah adendum ada");
    assert(/Menunggu Revisi\s*6/.test(text), "6 catatan Menunggu Revisi");
  });
  await step("S6 badge shell setelah terbit: CHR draf hilang dari Perlu tindakan tanpa muat ulang", async () => {
    const { page } = await session("reviewer");
    await waitHeaderCount(page, (count) => count === 2, "2 item belum ditinjau tersisa, CHR draf sudah terbit");
    await page.reload();
    await waitText(page, /Dokumen terbit dan terkunci/);
  });
  await step("S7 cetak CHR: halaman A4 tanpa shell memuat nomor dan catatan", async () => {
    const { page } = await session("reviewer");
    await page.goto(`${BASE}/chr/${state.chrId}/cetak`);
    await waitText(page, /CHR\/90001\/2026\/alokasi\/001/, "body");
    const text = await body(page);
    assert(/Pengadaan kaos seragam/.test(text) && /Rekomendasi/.test(text), "isi dokumen tampil");
    assert((await page.locator("nav").count()) === 0 || !(await page.locator("nav").first().isVisible()), "tanpa sidebar");
    const pdf = await page.pdf({ format: "A4" });
    assert(pdf.length > 5_000, "cetak ke PDF menghasilkan dokumen");
  });
  await step("S6 UKI: melihat CHR terbit, tidak bisa mengubah, mengisi tanggapan eselon I", async () => {
    await login("uki");
    const { page } = await session("uki");
    await page.goto(`${BASE}/chr/${state.chrId}`);
    await waitText(page, /Dokumen terbit dan terkunci/);
    assert((await page.getByRole("button", { name: "Terbitkan" }).count()) === 0, "UKI tidak melihat tombol terbitkan");
    assert((await page.getByRole("button", { name: "Tambah adendum" }).count()) === 0, "UKI tidak melihat tambah adendum");
    await page.getByLabel("Tanggapan eselon I (PIC UKI)").fill("Satker akan menindaklanjuti catatan sebelum batas ADK.");
    await page.getByRole("button", { name: "Simpan tanggapan" }).click();
    await waitText(page, /Diisi Umar UKI/, 'aside[aria-label="Isian dokumen"]');
    await page.reload();
    await waitText(page, /Catatan per status/);
    assert((await page.getByLabel("Tanggapan eselon I (PIC UKI)").inputValue()).includes("menindaklanjuti"), "tanggapan tersimpan");
  });
  await step("S6 adendum: reviewer menambah catatan lewat adendum, versi 2 dan riwayat versi", async () => {
    const { page } = await session("reviewer");
    await page.goto(state.chrUrl);
    await waitText(page, /Dokumen terbit dan terkunci/);
    await page.getByRole("button", { name: "Tambah adendum" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Alasan adendum").fill("Temuan tambahan setelah koordinasi dengan Satker.");
    await dialog.getByRole("button", { name: /Tambah catatan/ }).first().click();
    await dialog.getByLabel("Satker").selectOption({ index: 1 });
    await dialog.getByLabel("Judul catatan").fill("Honorarium ganda");
    await dialog.getByLabel("Teks catatan").fill("Periksa honorarium ganda untuk narasumber yang sama.");
    await dialog.getByLabel("Jenis ekspektasi").selectOption("manual");
    await dialog.getByLabel("Instruksi tindak lanjut").fill("Lampirkan daftar penerima honor.");
    await dialog.getByRole("button", { name: "Tambahkan ke adendum" }).click();
    await dialog.getByRole("button", { name: "Terbitkan adendum" }).click();
    await dialog.waitFor({ state: "hidden" });
    await waitText(page, /7 catatan di dokumen ini/);
    await page.getByRole("button", { name: "Riwayat versi" }).click();
    const versions = page.locator("dialog[open]");
    await versions.waitFor();
    assert(/2/.test(await versions.innerText()), "riwayat versi memuat versi 2");
    await versions.getByLabel("Versi", { exact: true }).selectOption({ index: 0 });
    await waitText(page, /Jumlah catatan/, "dialog[open]");
    await page.keyboard.press("Escape");
  });

  // ---- Impor Revisi (cek otomatis)
  await step("S3 impor Revisi 90001: cek otomatis berjalan, hasil memuat perbandingan dan catatan dicek ulang", async () => {
    const { page } = await session("reviewer");
    await uploadSnapshot(page, { file: "revisi/es1_90001_2026.csv" });
    await waitText(page, /Baris dibaca/, "main", 60_000);
    const text = await main(page);
    assert(/snapshot v2 Revisi/.test(text), "judul snapshot v2 Revisi");
    assert(/Perbandingan dengan v1 Awal/.test(text), "perbandingan dengan v1");
    assert(/Catatan yang dicek ulang/.test(text), "bagian catatan dicek ulang");
    assert(/Terpenuhi/.test(text) && /Belum terpenuhi/.test(text), "hasil cek terpenuhi dan belum terpenuhi tampil");
    assert(/Hasil cek hanya usulan/.test(text), "disclaimer hasil cek hanya usulan");
  });
  await step("S3 badge shell setelah Revisi: Smart Tracker = 7 catatan Perlu Verifikasi", async () => {
    const { page } = await session("reviewer");
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && (await navBadge(page, "Smart Tracker")) !== 7) await page.waitForTimeout(300);
    assert((await navBadge(page, "Smart Tracker")) === 7, `badge Smart Tracker 7 (dapat ${await navBadge(page, "Smart Tracker")})`);
    await page.getByRole("link", { name: /Buka Smart Tracker/ }).click();
    await page.waitForURL(/\/tracker/);
  });

  // ---- S8/S9 tracker
  async function openNote(page, title, status = "perlu_verifikasi") {
    await page.goto(`${BASE}/tracker?status=${status}`);
    await page.getByRole("link", { name: new RegExp(title) }).first().click();
    await page.waitForURL(/\/tracker\/[^/?]+$/);
    await waitText(page, /Riwayat catatan/);
  }
  async function tabCount(page, name) {
    const text = await page.getByRole("tab", { name: new RegExp(name) }).innerText();
    return Number(/(\d+)\s*$/.exec(text.replace(/\n/g, " "))?.[1] ?? NaN);
  }

  async function expectTabCount(page, name, expected) {
    const deadline = Date.now() + 10_000;
    let last = NaN;
    while (Date.now() < deadline) {
      last = await tabCount(page, name).catch(() => NaN);
      if (last === expected) return;
      await page.waitForTimeout(250);
    }
    throw new Error(`Assertion gagal: tab ${name} = ${expected} (dapat ${last})`);
  }

  await step("S8 tracker: tab per status, 7 Perlu Verifikasi, status di URL", async () => {
    const { page } = await session("reviewer");
    await page.goto(`${BASE}/tracker`);
    await waitText(page, /Smart Tracker/);
    await page.getByRole("tab", { name: /Perlu Verifikasi/ }).waitFor();
    await expectTabCount(page, "Perlu Verifikasi", 7);
    await expectTabCount(page, "Menunggu Revisi", 0);
    await page.getByRole("tab", { name: /Closed/ }).click();
    await page.waitForURL(/status=closed/);
    await waitText(page, /Belum ada|Tidak ada/);
    await page.goBack();
    await page.waitForURL((url) => !url.search.includes("status=closed"));
    await waitText(page, /Jasa kebersihan/);
  });
  await step("S8 tracker: setujui massal hanya yang terpenuhi lewat dialog", async () => {
    const { page } = await session("reviewer");
    await page.goto(`${BASE}/tracker?status=perlu_verifikasi`);
    await waitText(page, /Jasa kebersihan/);
    await page.getByRole("checkbox", { name: "Pilih semua catatan yang terpenuhi di halaman ini" }).check({ force: true });
    const bulk = page.getByRole("region", { name: "Aksi massal" });
    await bulk.waitFor();
    const label = await bulk.innerText();
    const count = Number(/Setujui yang terpenuhi \((\d+)\)/.exec(label)?.[1]);
    assert(count === 2, `2 catatan terpenuhi terpilih (kaos dan honor satpam); dapat: ${label.replace(/\n/g, " ")}`);
    await bulk.getByRole("button", { name: /Setujui yang terpenuhi/ }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByRole("button", { name: "Setujui dan tutup" }).click();
    await dialog.waitFor({ state: "hidden" });
    await waitGone(page, /Pengadaan kaos seragam/);
    await expectTabCount(page, "Perlu Verifikasi", 5);
    await expectTabCount(page, "Closed", 2);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && (await navBadge(page, "Smart Tracker")) !== 5) await page.waitForTimeout(300);
    assert((await navBadge(page, "Smart Tracker")) === 5, "badge Smart Tracker turun ke 5 tanpa muat ulang");
  });
  await step("S9 detail: bukti cek tampil, setujui catatan manual (data tidak cukup) lalu tutup", async () => {
    const { page } = await session("reviewer");
    await openNote(page, "Perjalanan dinas dobel");
    const text = await main(page);
    assert(/Bukti cek/.test(text) && /Keputusan reviewer/.test(text), "bukti cek dan panel keputusan");
    assert(/data tidak cukup/i.test(text), "hasil data tidak cukup untuk ekspektasi manual");
    await page.getByRole("button", { name: "Setujui dan tutup" }).click();
    const dialog = page.locator("dialog[open]");
    if (await dialog.count()) await dialog.getByRole("button", { name: "Setujui dan tutup" }).click();
    await waitText(page, /Catatan Closed|Closed/);
  });
  await step("S9 detail: setujui walau belum terpenuhi butuh konfirmasi (koordinasi, rinci_item)", async () => {
    const { page } = await session("reviewer");
    await openNote(page, "Biaya koordinasi");
    await page.getByRole("button", { name: "Setujui dan tutup" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.waitFor();
    assert(/walau hasil cek belum terpenuhi/.test(await dialog.innerText()), "dialog peringatan");
    await dialog.getByRole("button", { name: "Setujui dan tutup" }).click();
    await waitText(page, /Catatan Closed|Closed/);
  });
  await step("S9 detail: kembalikan wajib beralasan, lalu status Menunggu Revisi", async () => {
    const { page } = await session("reviewer");
    await openNote(page, "Jasa kebersihan");
    await page.getByRole("button", { name: "Kembalikan ke Satker" }).click();
    assert((await page.getByRole("alert").count()) > 0 || /alasan/i.test(await main(page)), "alasan wajib");
    await page.getByLabel(/Alasan pengembalian/).fill("Akun belum diganti ke 521111, mohon diperbaiki.");
    await page.getByRole("button", { name: "Kembalikan ke Satker" }).click();
    await waitText(page, /Menunggu Revisi/);
  });
  await step("S9 UKI: melihat tracker eselon I miliknya, tidak ada tombol tutup, mengisi justifikasi", async () => {
    const { page } = await session("uki");
    await page.goto(`${BASE}/tracker?status=menunggu_revisi`);
    await waitText(page, /Jasa kebersihan/);
    await page.getByRole("link", { name: /Jasa kebersihan/ }).first().click();
    await waitText(page, /Justifikasi eselon I/);
    assert((await page.getByRole("button", { name: "Setujui dan tutup" }).count()) === 0, "UKI tidak punya tombol setujui");
    assert((await page.getByRole("button", { name: "Kembalikan ke Satker" }).count()) === 0, "UKI tidak punya tombol kembalikan");
    await page.getByRole("button", { name: "Kirim justifikasi" }).click();
    assert((await page.getByText(/wajib|minimal/i).count()) > 0, "justifikasi kosong ditolak di UI");
    await page.getByLabel("Alasan Satker tidak mengubah").fill("Akun 522191 dipakai karena kontrak jasa kebersihan sudah berjalan.");
    await page.getByRole("button", { name: "Kirim justifikasi" }).click();
    await waitText(page, /Dijustifikasi/);
    // justifikasi langsung dari Perlu Verifikasi (masjid)
    await page.goto(`${BASE}/tracker?status=perlu_verifikasi`);
    await page.getByRole("link", { name: /Rehabilitasi masjid/ }).first().click();
    await page.getByLabel("Alasan Satker tidak mengubah").fill("Rehabilitasi sudah tercantum pada usulan hibah desa.");
    await page.getByRole("button", { name: "Kirim justifikasi" }).click();
    await waitText(page, /Dijustifikasi/);
  });
  await step("S9 reviewer: terima justifikasi menutup catatan; CHR menjadi Selesai", async () => {
    const { page } = await session("reviewer");
    await page.goto(`${BASE}/tracker?status=dijustifikasi`);
    await waitText(page, /Jasa kebersihan/);
    await expectTabCount(page, "Dijustifikasi", 2);
    for (const title of ["Jasa kebersihan", "Rehabilitasi masjid"]) {
      await openNote(page, title, "dijustifikasi");
      await waitText(page, /Justifikasi eselon I/);
      await page.getByRole("button", { name: "Terima justifikasi" }).click();
      await waitText(page, /Catatan Closed|Closed/);
    }
    await page.goto(`${BASE}/tracker?status=closed`);
    await waitText(page, /Jasa kebersihan/);
    await expectTabCount(page, "Closed", 6);
  });
  await step("S10 Satker (UKI): 3 dari 4 Satker siap diajukan selama satu catatan masih terbuka", async () => {
    const { page } = await session("uki");
    await page.goto(`${BASE}/satker`);
    await waitText(page, /Satker siap diajukan/);
    await waitText(page, /3 dari 4/);
    const text = await main(page);
    assert(/Catatan masih terbuka\s*1/.test(text), "1 catatan masih terbuka");
    assert(/Belum siap/.test(text) && /Siap diajukan/.test(text), "status per Satker: Belum siap dan Siap diajukan");
    assert(!/900201|900202/.test(text), "Satker eselon I lain tidak tampil");
    await page.getByRole("link", { name: /Satker 900101/ }).first().click();
    await page.waitForURL(/\/tracker/);
    assert(/workUnitId=/.test(page.url()), "klik Satker membuka Smart Tracker terfilter");
  });
  await step("S9 -> S6: menutup catatan terakhir membuat CHR berstatus Selesai", async () => {
    const { page } = await session("reviewer");
    await page.goto(state.chrUrl);
    await waitText(page, /Catatan per status/);
    assert(!(await has(page, /\bSelesai\b/)), "CHR belum Selesai selama masih ada catatan terbuka");
    await openNote(page, "Honorarium ganda");
    await page.getByRole("button", { name: "Setujui dan tutup" }).click();
    const dialog = page.locator("dialog[open]");
    if (await dialog.count()) await dialog.getByRole("button", { name: "Setujui dan tutup" }).click();
    await waitText(page, /Catatan Closed|Closed/);
    await page.goto(state.chrUrl);
    await waitText(page, /Selesai/);
    assert(/Closed\s*7/.test(await main(page)), "7 catatan Closed");
    await page.goto(`${BASE}/chr`);
    await waitText(page, /Selesai/);
    await waitHeaderCount(page, (count) => count === 2, "tinggal 2 item triage belum ditinjau");
  });
  await step("S10 Satker (UKI): semua Satker siap diajukan setelah CHR selesai", async () => {
    const { page } = await session("uki");
    await page.goto(`${BASE}/satker`);
    await waitText(page, /4 dari 4/);
    assert(/Catatan masih terbuka\s*0/.test(await main(page)), "tidak ada catatan terbuka");
    assert(!/Belum siap/.test(await main(page)), "tidak ada Satker Belum siap");
    await waitHeaderCount(page, (count) => count === 0, "UKI tidak punya pekerjaan tersisa");
  });

  // ---- Penjagaan peran dan scope eselon I
  await step("Scope: admin mengimpor eselon I kedua (90002) lewat dialog", async () => {
    await login("admin");
    const { page } = await session("admin");
    await page.goto(`${BASE}/siklus`);
    await page.getByRole("button", { name: "Impor CSV" }).first().click();
    const dialog = page.locator("dialog[open]");
    await dialog.waitFor();
    const options = await dialog.getByLabel("Eselon I").locator("option").allInnerTexts();
    assert(options.length === 2, `admin melihat 2 eselon I (dapat ${options.join(",")})`);
    const other = options.find((label) => !/DJCA/.test(label));
    state.otherOrganization = other;
    await dialog.getByLabel("Eselon I").selectOption({ label: other });
    await dialog.locator("input[type=file]").setInputFiles(join(FIXTURES, "awal/es1_90002_2026.csv"));
    await dialog.getByRole("button", { name: /Unggah dan proses/ }).click();
    await page.waitForURL((url) => url.searchParams.has("hasil"), { timeout: 60_000 });
    await waitText(page, /Baris dibaca/, "main", 60_000);
  });
  await step("Scope: reviewer dan UKI hanya melihat eselon I 90001; eselon I lain ditolak API (403)", async () => {
    for (const role of ["reviewer", "uki"]) {
      const { page } = await session(role);
      await page.goto(`${BASE}/siklus`);
      await waitText(page, /v1 · Awal/);
      assert(!/90002/.test(await main(page)), `${role}: tabel snapshot tidak memuat 90002`);
      const orgs = await page.request.get(`${BASE}/api/auth/me`).then((response) => response.json());
      assert(Array.isArray(orgs.user.scopeOrganizationUnitIds) && orgs.user.scopeOrganizationUnitIds.length === 1, `${role}: scope tepat satu eselon I`);
      const all = await page.request.get(`${BASE}/api/organization-units`).catch(() => null);
      const other = orgs.organizationUnits.find((unit) => !orgs.user.scopeOrganizationUnitIds.includes(unit.id));
      if (other) {
        const response = await page.request.get(`${BASE}/api/triage/items?organizationUnitId=${other.id}`);
        assert(response.status() === 403, `${role}: filter eselon I di luar scope -> 403 (dapat ${response.status()})`);
      }
    }
  });
  await step("Scope: admin dan pimpinan melihat kedua eselon I", async () => {
    await login("leader");
    for (const role of ["admin", "leader"]) {
      const { page } = await session(role);
      await page.goto(`${BASE}/triage`);
      await waitText(page, /item kena aturan|Belum ada/);
      const text = await main(page);
      assert(/DJCA/.test(text) && /DJCB/.test(text) && /2 eselon I/.test(text), `${role}: triage memuat dua eselon I`);
      await page.goto(`${BASE}/siklus`);
      await waitText(page, /90002/);
    }
  });
  await step("Peran: pimpinan hanya membaca (tanpa Impor CSV, tanpa panel keputusan, API menolak 403)", async () => {
    const { page } = await session("leader");
    await page.goto(`${BASE}/siklus`);
    await waitText(page, /v1 · Awal/);
    assert((await page.getByRole("button", { name: /Impor/ }).count()) === 0, "tidak ada tombol Impor");
    await page.goto(`${BASE}/triage?onlyFlagged=true&decision=belum_ditinjau`);
    await page.locator("table a").first().click();
    await waitText(page, /Konteks item/);
    assert((await page.getByRole("button", { name: /Konfirmasi dan masukkan/ }).count()) === 0, "tidak ada tombol konfirmasi");
    const itemId = new URL(page.url()).pathname.split("/").pop();
    const response = await page.request.post(`${BASE}/api/triage/items/${itemId}/confirm`, { data: { category: "akun", text: "uji", expectation: { type: "hapus_item" } } });
    assert(response.status() === 403, `POST confirm oleh pimpinan -> 403 (dapat ${response.status()})`);
    await page.goto(`${BASE}/chr/${state.chrId}`);
    await waitText(page, /Catatan per status/);
    assert((await page.getByRole("button", { name: /Tambah adendum|Terbitkan/ }).count()) === 0, "CHR tanpa aksi tulis untuk pimpinan");
    await page.goto(`${BASE}/tracker?status=closed`);
    await waitText(page, /Jasa kebersihan/);
    assert((await page.getByRole("checkbox").count()) === 0, "tracker tanpa pilihan massal untuk pimpinan");
  });
  await step("Peran: UKI tidak bisa mengonfirmasi atau mengimpor (403), dan layar admin ditolak di UI", async () => {
    const { page } = await session("uki");
    await page.goto(`${BASE}/triage?onlyFlagged=true&decision=belum_ditinjau`);
    await page.locator("table a").first().click();
    await waitText(page, /Konteks item/);
    assert((await page.getByRole("button", { name: /Konfirmasi dan masukkan/ }).count()) === 0, "UKI tanpa tombol konfirmasi");
    const itemId = new URL(page.url()).pathname.split("/").pop();
    const response = await page.request.post(`${BASE}/api/triage/items/${itemId}/confirm`, { data: { category: "akun", text: "uji", expectation: { type: "hapus_item" } } });
    assert(response.status() === 403, `POST confirm oleh UKI -> 403 (dapat ${response.status()})`);
    await page.goto(`${BASE}/siklus`);
    await waitText(page, /v1 · Awal/);
    assert((await page.getByRole("button", { name: /Impor/ }).count()) === 0, "UKI tanpa tombol impor");
    await page.goto(`${BASE}/admin/pengguna`);
    await waitText(page, /Akses ditolak/, "body");
  });

  // ---- Sesi
  await step("Sesi: cookie kedaluwarsa mengalihkan ke /login dan kembali ke halaman semula setelah masuk; keluar menutup sesi", async () => {
    const { page, context } = await session("reviewer");
    await page.goto(`${BASE}/tracker`);
    await waitText(page, /Smart Tracker/);
    expectIssue(/HTTP 401/);
    expectIssue(/console\.error: Failed to load resource.*401/);
    await context.clearCookies();
    await page.getByRole("link", { name: /Risk Triage/ }).first().click({ timeout: 3_000 }).catch(() => undefined); // atau shell sudah lebih dulu mengalihkan (polling badge mendapat 401)
    await page.waitForURL(/\/login/);
    await page.getByLabel("Username").fill(USERS.reviewer[0]);
    await page.getByLabel("Kata sandi").fill(USERS.reviewer[1]);
    await page.getByRole("button", { name: "Masuk" }).click();
    await page.waitForURL(/\/(triage|tracker)/);
    await page.getByRole("button", { name: /Keluar/i }).click();
    await page.waitForURL(/\/login/);
    await page.goto(`${BASE}/tracker`);
    await page.waitForURL(/\/login/);
  });
}

run()
  .then(async () => {
    const failed = results.filter((result) => !result.ok);
    console.log(`\n${results.length - failed.length}/${results.length} langkah PASS${failed.length ? `, ${failed.length} FAIL` : ""}`);
    if (failed.length) console.log(`Screenshot kegagalan: ${ARTIFACTS}`);
    await browser?.close();
    process.exit(failed.length ? 1 : 0);
  })
  .catch(async (error) => {
    console.error("e2e berhenti karena galat tak terduga:", error);
    await browser?.close();
    process.exit(1);
  });
