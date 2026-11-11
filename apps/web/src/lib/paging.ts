/** Pure paging math shared by Pagination and Pager (kept free of React so it can be unit tested). */

export function pageCountFor(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(pageSize) || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** 1-based inclusive range of rows on a page; `{ from: 0, to: 0 }` when there are no rows. */
export function pageRange(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(total, page * pageSize) };
}

/** Clamps a requested page into 1..pageCount (use after the total shrinks, e.g. a filter was applied). */
export function clampPage(page: number, total: number, pageSize: number): number {
  const count = pageCountFor(total, pageSize);
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), count);
}
