import test from "node:test";
import assert from "node:assert/strict";
import { calendarDaysUntil } from "../src/lib/calendar.ts";

test("calendarDaysUntil menghitung per tanggal kalender (UTC), bukan per 24 jam", () => {
  const deadline = Date.UTC(2026, 10, 12); // 12 Nov 2026 00:00 UTC
  assert.equal(calendarDaysUntil(deadline, Date.UTC(2026, 10, 11, 2, 30)), 1, "21,5 jam sebelum tenggat = sisa 1 hari");
  assert.equal(calendarDaysUntil(deadline, Date.UTC(2026, 10, 11, 23, 59)), 1);
  assert.equal(calendarDaysUntil(deadline, Date.UTC(2026, 10, 12, 0, 0)), 0);
  assert.equal(calendarDaysUntil(deadline, Date.UTC(2026, 10, 12, 18, 0)), 0, "hari tenggat = hari ini");
  assert.equal(calendarDaysUntil(deadline, Date.UTC(2026, 10, 14, 1, 0)), -2);
  assert.equal(calendarDaysUntil(deadline, Date.UTC(2026, 10, 9, 12, 0)), 3);
});
