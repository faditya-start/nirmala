import assert from "node:assert/strict";
import { test } from "node:test";
import { nextTheme, parseTheme } from "./theme";

test("parseTheme accepts light and dark, everything else is system", () => {
  assert.equal(parseTheme("light"), "light");
  assert.equal(parseTheme("dark"), "dark");
  assert.equal(parseTheme("system"), "system");
  assert.equal(parseTheme(null), "system");
  assert.equal(parseTheme(""), "system");
  assert.equal(parseTheme("Dark"), "system");
  assert.equal(parseTheme("sepia"), "system");
});

test("nextTheme cycles system, light, dark and back", () => {
  assert.equal(nextTheme("system"), "light");
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "system");
});
