/**
 * Status filter Risk Triage <-> query string URL. URL adalah sumber kebenaran: tautan bisa dibagikan,
 * tombol Kembali bekerja, dan halaman detail membawa filter yang sama agar "Sebelumnya/Berikutnya" konsisten.
 */
import { NOTE_CATEGORIES, TRIAGE_DECISIONS, TRIAGE_SORTS, type NoteCategory, type TriageDecision, type TriageSort } from "@nirmala/shared";

export type SortDir = "asc" | "desc";

export interface TriageFilterState {
  organizationUnitId: string;
  workUnitId: string;
  ruleCategory: NoteCategory | "";
  /** Tidak ada kontrolnya di desain; diteruskan bila tautan dari layar lain membawanya. */
  ruleCode: string;
  decision: TriageDecision | "";
  onlyFlagged: boolean;
  q: string;
  sort: TriageSort;
  dir: SortDir;
}

export interface TriageUrlState extends TriageFilterState {
  /** 1-based. */
  page: number;
}

export const EMPTY_FILTER: TriageFilterState = {
  organizationUnitId: "",
  workUnitId: "",
  ruleCategory: "",
  ruleCode: "",
  decision: "",
  onlyFlagged: false,
  q: "",
  sort: "default",
  dir: "desc"
};

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | "" {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

/** Tolerant: nilai yang tidak dikenal diabaikan, tidak pernah melempar. */
export function parseFilter(params: URLSearchParams): TriageFilterState {
  const sort = oneOf(params.get("sort"), TRIAGE_SORTS) || "default";
  const flagged = params.get("onlyFlagged");
  const ruleCode = (params.get("ruleCode") ?? "").trim().toUpperCase();
  return {
    organizationUnitId: (params.get("organizationUnitId") ?? "").trim(),
    workUnitId: (params.get("workUnitId") ?? "").trim(),
    ruleCategory: oneOf(params.get("ruleCategory"), NOTE_CATEGORIES),
    ruleCode: /^R\d{2,}$/.test(ruleCode) ? ruleCode : "",
    decision: oneOf(params.get("decision"), TRIAGE_DECISIONS),
    onlyFlagged: flagged === "true" || flagged === "1",
    q: (params.get("q") ?? "").slice(0, 200),
    sort,
    dir: params.get("dir") === "asc" ? "asc" : "desc"
  };
}

export function parseUrlState(params: URLSearchParams): TriageUrlState {
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return { ...parseFilter(params), page: Number.isFinite(page) && page >= 1 ? page : 1 };
}

/** Hanya nilai non-default yang ditulis, supaya URL pendek dan stabil. */
export function filterToParams(filter: TriageFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.organizationUnitId) params.set("organizationUnitId", filter.organizationUnitId);
  if (filter.workUnitId) params.set("workUnitId", filter.workUnitId);
  if (filter.ruleCategory) params.set("ruleCategory", filter.ruleCategory);
  if (filter.ruleCode) params.set("ruleCode", filter.ruleCode);
  if (filter.decision) params.set("decision", filter.decision);
  if (filter.onlyFlagged) params.set("onlyFlagged", "true");
  const q = filter.q.trim();
  if (q) params.set("q", q);
  if (filter.sort !== "default") {
    params.set("sort", filter.sort);
    params.set("dir", filter.dir);
  }
  return params;
}

export function urlStateToParams(state: TriageUrlState): URLSearchParams {
  const params = filterToParams(state);
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}

/** Query untuk GET /triage/items dan GET /triage/items/:id (detail tanpa `page`). */
export function filterToQuery(filter: TriageFilterState): Record<string, string | undefined> {
  const params = filterToParams(filter);
  return Object.fromEntries(params.entries());
}

export function isFiltered(filter: TriageFilterState, ignoreOrganization = false): boolean {
  return Boolean(
    (!ignoreOrganization && filter.organizationUnitId) ||
      filter.workUnitId ||
      filter.ruleCategory ||
      filter.ruleCode ||
      filter.decision ||
      filter.onlyFlagged ||
      filter.q.trim()
  );
}

export const PAGE_SIZE = 25;

export function pageForPosition(position: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(position / pageSize));
}

export function itemPath(itemId: string, filter: TriageFilterState): string {
  const qs = filterToParams(filter).toString();
  return `/triage/${encodeURIComponent(itemId)}${qs ? `?${qs}` : ""}`;
}

export function listPath(filter: TriageFilterState, page = 1): string {
  const qs = urlStateToParams({ ...filter, page }).toString();
  return `/triage${qs ? `?${qs}` : ""}`;
}
