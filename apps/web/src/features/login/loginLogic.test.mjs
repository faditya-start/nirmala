import assert from "node:assert/strict";
import { test } from "node:test";
import { LOGIN_FAILED_MESSAGE, LOGIN_SERVER_MESSAGE, LOGIN_THROTTLED_MESSAGE, LOGIN_UNREACHABLE_MESSAGE, loginFailureMessage, safeRedirectTarget } from "./loginLogic.ts";

test("safeRedirectTarget keeps in-app paths with query", () => {
  assert.equal(safeRedirectTarget("/triage?cycle=1"), "/triage?cycle=1");
  assert.equal(safeRedirectTarget("/admin/pengguna"), "/admin/pengguna");
});

test("safeRedirectTarget rejects external, protocol-relative and login targets", () => {
  assert.equal(safeRedirectTarget("https://example.com"), "/dashboard");
  assert.equal(safeRedirectTarget("//example.com/x"), "/dashboard");
  assert.equal(safeRedirectTarget("/\\example.com"), "/dashboard");
  assert.equal(safeRedirectTarget("/login"), "/dashboard");
  assert.equal(safeRedirectTarget("/login?x=1"), "/dashboard");
  assert.equal(safeRedirectTarget(undefined), "/dashboard");
  assert.equal(safeRedirectTarget(42), "/dashboard");
});

test("loginFailureMessage maps statuses", () => {
  assert.equal(loginFailureMessage({ status: 401, message: "Username atau password tidak valid." }), LOGIN_FAILED_MESSAGE);
  assert.equal(loginFailureMessage({ status: 429, message: "x" }), LOGIN_THROTTLED_MESSAGE);
  assert.equal(loginFailureMessage({ status: 503, message: "x" }), LOGIN_SERVER_MESSAGE);
  assert.equal(loginFailureMessage({ status: 400, message: "Username wajib diisi." }), "Username wajib diisi.");
  assert.equal(loginFailureMessage(new TypeError("Failed to fetch")), LOGIN_UNREACHABLE_MESSAGE);
  assert.equal(loginFailureMessage({ status: 0, message: "Tidak dapat terhubung ke server." }), LOGIN_UNREACHABLE_MESSAGE);
});
