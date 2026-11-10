import assert from "node:assert/strict";
import { test } from "node:test";
import { clampPage, pageCountFor, pageRange } from "./paging";

test("pageCountFor rounds up and never returns less than 1", () => {
  assert.equal(pageCountFor(12702, 11), 1155);
  assert.equal(pageCountFor(0, 25), 1);
  assert.equal(pageCountFor(25, 25), 1);
  assert.equal(pageCountFor(26, 25), 2);
  assert.equal(pageCountFor(10, 0), 1);
});

test("pageRange is 1-based, inclusive and clipped to the total", () => {
  assert.deepEqual(pageRange(1, 25, 128), { from: 1, to: 25 });
  assert.deepEqual(pageRange(6, 25, 128), { from: 126, to: 128 });
  assert.deepEqual(pageRange(1, 25, 0), { from: 0, to: 0 });
});

test("clampPage keeps the page inside the available range", () => {
  assert.equal(clampPage(9, 30, 25), 2);
  assert.equal(clampPage(0, 30, 25), 1);
  assert.equal(clampPage(Number.NaN, 30, 25), 1);
  assert.equal(clampPage(2.7, 100, 25), 2);
});
