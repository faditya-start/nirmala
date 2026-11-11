// @ts-nocheck node --test runs this file directly (type stripping); the ".ts" import suffix is not allowed by tsc.
import assert from "node:assert/strict";
import test from "node:test";
import { sameIds, scopeText, validateUserForm } from "./userForm.ts";

const base = { username: "reviewer03", displayName: "Reviewer 03", role: "reviewer", password: "kata-sandi-123", unitLabel: "", organizationUnitIds: ["ou-a"] };

test("a complete form is valid", () => {
  assert.deepEqual(validateUserForm(base, "create"), {});
});

test("reviewer and UKI need an eselon I, leader and admin do not", () => {
  assert.ok(validateUserForm({ ...base, organizationUnitIds: [] }, "create").organizationUnitIds);
  assert.ok(validateUserForm({ ...base, role: "uki", organizationUnitIds: [] }, "edit").organizationUnitIds);
  assert.deepEqual(validateUserForm({ ...base, role: "leader", organizationUnitIds: [] }, "create"), {});
});

test("password is required on create, optional on edit, always 12+ when given", () => {
  assert.ok(validateUserForm({ ...base, password: "" }, "create").password);
  assert.deepEqual(validateUserForm({ ...base, password: "" }, "edit"), {});
  assert.ok(validateUserForm({ ...base, password: "pendek" }, "edit").password);
});

test("username is only checked on create", () => {
  assert.ok(validateUserForm({ ...base, username: "a b" }, "create").username);
  assert.equal(validateUserForm({ ...base, username: "" }, "edit").username, undefined);
});

test("scopeText and sameIds", () => {
  assert.equal(scopeText({ allOrganizations: true, organizationUnits: [] }), "Semua eselon I");
  assert.equal(scopeText({ allOrganizations: false, organizationUnits: [] }), "Belum ada akses");
  assert.equal(scopeText({ allOrganizations: false, organizationUnits: [{ shortName: "A" }, { shortName: "B" }] }), "A, B");
  assert.equal(sameIds(["a", "b"], ["b", "a"]), true);
  assert.equal(sameIds(["a"], ["a", "b"]), false);
});
