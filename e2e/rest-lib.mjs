// Helpers for e2e/rest.mjs: browser launch, issue capture (console errors, CSP violations,
// failed or 4xx/5xx responses), login through the real form, and PASS/FAIL reporting.
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

export const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:5221").replace(/\/$/, "");
export const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? "/home/milahlyy/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

export const ACCOUNTS = {
  reviewer: { username: "reviewer.demo", password: "Review123!" },
  uki: { username: "uki.demo", password: "Uki12345!" },
  leader: { username: "pimpinan.demo", password: "Pimpin123!" },
  admin: { username: "admin.demo", password: "Admin123!" }
};

const results = [];
export function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
}
export function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) console.log("FAILED:\n" + failed.map((f) => `  - ${f.name} ${f.detail}`).join("\n"));
  return failed.length === 0;
}

export async function launch() {
  if (!existsSync(CHROMIUM_PATH)) throw new Error(`Chromium tidak ditemukan di ${CHROMIUM_PATH}; set CHROMIUM_PATH`);
  return chromium.launch({ executablePath: CHROMIUM_PATH, args: ["--no-sandbox"] });
}

/** New context + page with issue capture. `issues` collects anything unexpected since the last drain(). */
export async function newSession(browser, { viewport = { width: 1440, height: 900 }, downloads = true } = {}) {
  const context = await browser.newContext({ viewport, locale: "id-ID", acceptDownloads: downloads });
  const page = await context.newPage();
  const issues = [];
  const allow = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      const text = m.text();
      if (!allow.some((re) => re.test(text))) issues.push(`console.${m.type()}: ${text.slice(0, 300)}`);
    }
  });
  page.on("pageerror", (e) => issues.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText ?? "";
    if (/ABORTED/.test(f)) return; // navigation cancel
    issues.push(`requestfailed: ${r.method()} ${r.url()} ${f}`);
  });
  page.on("response", (r) => {
    const s = r.status();
    if (s >= 400) {
      const key = `${s} ${r.request().method()} ${new URL(r.url()).pathname}`;
      if (!allow.some((re) => re.test(key))) issues.push(`http ${key}`);
    }
  });
  return {
    context,
    page,
    /** Declare an expected 4xx/console message (regex tested against the issue text). */
    expect(re) {
      allow.push(re);
    },
    drain() {
      return issues.splice(0, issues.length);
    }
  };
}

export async function login(s, role) {
  const { page } = s;
  const acc = ACCOUNTS[role];
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Username").fill(acc.username);
  await page.getByLabel("Kata sandi").fill(acc.password);
  await page.getByRole("button", { name: /^Masuk/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
}

export async function logout(s) {
  await s.context.clearCookies();
}

/** Run a named check; any exception or unexpected issue becomes a FAIL. */
export async function check(s, name, fn) {
  s.drain();
  let err = null;
  try {
    await fn(s.page);
  } catch (e) {
    err = String(e?.message ?? e).split("\n")[0].slice(0, 300);
  }
  await s.page.waitForTimeout(150);
  const issues = s.drain();
  if (err) record(name, false, err + (issues.length ? ` | ${issues.join(" ; ")}` : ""));
  else if (issues.length) record(name, false, issues.join(" ; "));
  else record(name, true);
}
