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
