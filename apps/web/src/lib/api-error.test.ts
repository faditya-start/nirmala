import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, describeError, errorMessage } from "./api-error";

test("describeError gives plain wording per status", () => {
  assert.match(describeError(new ApiError(501, "x")), /belum tersedia/);
  assert.match(describeError(new ApiError(503, "boom")), /Server sedang bermasalah/);
  assert.equal(describeError(new ApiError(409, "Dokumen sudah terkunci.")), "Dokumen sudah terkunci.");
  assert.equal(describeError(new ApiError(0, "Tidak ada koneksi.")), "Tidak ada koneksi.");
  assert.equal(describeError(new Error("secret stack"), "Gagal memuat."), "Gagal memuat.");
});

test("errorMessage never leaks non-API errors", () => {
  assert.equal(errorMessage(new TypeError("x is undefined")), "Terjadi kesalahan. Coba lagi.");
});
