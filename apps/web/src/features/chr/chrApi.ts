/** Typed calls to the CHR endpoints (docs/api-contract.md section 4). Paths are relative to /api. */
import type {
  AccountDto,
  AddendumBody,
  ChrAddendumResponse,
  ChrDetailResponse,
  ChrDocumentResponse,
  ChrIssueResponse,
  ChrListResponse,
  ChrNoteResponse,
  ChrPrintResponse,
  ChrVersionDetailResponse,
  CreateNoteBody,
  UpdateNoteBody,
  WorkUnitDto
} from "@nirmala/shared";
import { api } from "../../lib/api";

const chr = (id: string) => `/chr/${encodeURIComponent(id)}`;

export const chrApi = {
  list: (cycleId: string, status?: string) => api.get<ChrListResponse>("/chr", { query: { cycleId, status } }),
  create: (cycleId: string, organizationUnitId: string) => api.post<ChrDocumentResponse>("/chr", { cycleId, organizationUnitId }),
  detail: (id: string) => api.get<ChrDetailResponse>(chr(id)),
  createNote: (id: string, body: CreateNoteBody) => api.post<ChrNoteResponse>(`${chr(id)}/notes`, body),
  updateNote: (id: string, noteId: string, body: UpdateNoteBody) => api.patch<ChrNoteResponse>(`${chr(id)}/notes/${encodeURIComponent(noteId)}`, body),
  deleteNote: (id: string, noteId: string) => api.delete<void>(`${chr(id)}/notes/${encodeURIComponent(noteId)}`),
  saveRecommendation: (id: string, recommendation: string) => api.put<ChrDocumentResponse>(`${chr(id)}/recommendation`, { recommendation }),
  issue: (id: string) => api.post<ChrIssueResponse>(`${chr(id)}/issue`),
  saveUnitResponse: (id: string, unitResponse: string) => api.put<ChrDocumentResponse>(`${chr(id)}/unit-response`, { unitResponse }),
  addendum: (id: string, body: AddendumBody) => api.post<ChrAddendumResponse>(`${chr(id)}/addendum`, body),
  version: (id: string, versionNumber: number) => api.get<ChrVersionDetailResponse>(`${chr(id)}/versions/${versionNumber}`),
  print: (id: string, version?: number) => api.get<ChrPrintResponse>(`${chr(id)}/print`, { query: { version } }),
  workUnits: (organizationUnitId: string) => api.get<{ workUnits: WorkUnitDto[] }>("/work-units", { query: { organizationUnitId } }),
  accounts: (q: string) => api.get<{ accounts: AccountDto[] }>("/references/accounts", { query: { q, limit: 8 } })
};
