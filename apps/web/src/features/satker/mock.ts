/**
 * Mock for GET /api/satker/progress. Computed from the tracker mock's in-memory notes, so approving, returning or
 * justifying a note in /tracker is reflected here ("siap diajukan", counts, last moved). Synthetic data only.
 */
import type { SatkerProgressResponse, SatkerProgressRow, SatkerReadiness, TrackerStatus } from "@nirmala/shared";
import { ApiError } from "../../lib/api-error";
import { registerMock } from "../../lib/mock";
import { mockShared } from "../tracker/mock";

const { state, ORG_A, ORG_C, CHR_ID, CHR_NUMBER, WORK_UNITS, workUnit, latestCheck, chrCompleted } = mockShared;


registerMock("GET", "/satker/progress", ({ query }) => {
  const orgId = query.organizationUnitId || ORG_A.id;
  if (orgId !== ORG_A.id && orgId !== ORG_C.id) throw new ApiError(404, "Eselon I tidak ditemukan.");
  const unit = orgId === ORG_A.id ? ORG_A : ORG_C;
  const notes = orgId === ORG_A.id ? state.notes : [];
  const units = orgId === ORG_A.id ? WORK_UNITS : [];

  const items: SatkerProgressRow[] = units.map((wu) => {
    const mine = notes.filter((note) => workUnit(note.workUnitNo).id === wu.id);
    const counts: Record<TrackerStatus, number> = { menunggu_revisi: 0, perlu_verifikasi: 0, dijustifikasi: 0, closed: 0 };
    for (const note of mine) if (note.status !== "draf") counts[note.status] += 1;
    const total = mine.length;
    const readiness: SatkerReadiness = total === 0 ? "tidak_ada_catatan" : counts.closed === total ? "siap_diajukan" : "belum_siap";
    return {
      workUnitId: wu.id,
      workUnitCode: wu.code,
      workUnitName: wu.name,
      counts,
      notesTotal: total,
      lastMovedAt: total === 0 ? null : Math.max(...mine.map((note) => note.lastMovedAt)),
      readiness
    };
  });

  const rank = (row: SatkerProgressRow) => (row.readiness === "tidak_ada_catatan" ? 1 : 0);
  const sort = query.sort || "last_moved";
  items.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (sort === "name") return a.workUnitName.localeCompare(b.workUnitName);
    if (sort === "open_notes") return b.notesTotal - b.counts.closed - (a.notesTotal - a.counts.closed) || a.workUnitName.localeCompare(b.workUnitName);
    return (a.lastMovedAt ?? 0) - (b.lastMovedAt ?? 0) || a.workUnitName.localeCompare(b.workUnitName);
  });

  const open = notes.filter((note) => note.status !== "closed" && note.status !== "draf");
  const withNotes = items.filter((row) => row.readiness !== "tidak_ada_catatan");
  const deadline = new Date();
  deadline.setHours(12, 0, 0, 0);
  deadline.setDate(deadline.getDate() + 3);
  const preview = [...open]
    .sort((a, b) => b.number - a.number)
    .sort((a, b) => Number(b.status === "perlu_verifikasi") - Number(a.status === "perlu_verifikasi"))
    .slice(0, 3)
    .map((note) => ({
      noteId: note.id,
      workUnitName: workUnit(note.workUnitNo).name,
      title: note.title,
      status: note.status as TrackerStatus,
      latestCheckResult: latestCheck(note)?.evidence.result ?? null
    }));

  const response: SatkerProgressResponse = {
    organizationUnit: unit,
    cycleId: query.cycleId,
    chr: notes.length ? { id: CHR_ID, documentNumber: CHR_NUMBER, status: chrCompleted() ? "completed" : "issued" } : null,
    summary: {
      satkerTotal: items.length,
      satkerWithNotes: withNotes.length,
      satkerWithoutNotes: items.length - withNotes.length,
      satkerReady: withNotes.filter((row) => row.readiness === "siap_diajukan").length,
      openNotes: open.length,
      openNotesPreview: preview,
      adkDeadline: deadline.getTime(),
      daysToAdkDeadline: 3
    },
    items
  };
  return response;
});
