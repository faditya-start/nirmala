/**
 * Registri job asinkron di memori (docs/api-contract.md §1.7): impor besar dan hitung ulang skor.
 * Satu proses server; job hilang saat restart (GET /api/jobs/:id -> 404). Job selesai dibuang setelah `RETENTION_MS`.
 */
import type { JobDto, JobStatus, JobStep } from "@nirmala/shared";
import { newId } from "../lib/security.js";

const RETENTION_MS = 60 * 60 * 1000;

interface JobState {
  id: string;
  kind: string;
  ownerUserId: string;
  status: JobStatus;
  steps: JobStep[];
  rowsDone: number;
  rowsTotal: number | null;
  percent: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  result: unknown;
}

export interface JobHandle {
  readonly id: string;
  setStep(key: string, status: JobStep["status"]): void;
  progress(update: { rowsDone?: number; rowsTotal?: number | null; percent?: number }): void;
  finish(result: unknown): void;
  fail(message: string): void;
}

export class JobRegistry {
  private jobs = new Map<string, JobState>();
  private locks = new Set<string>();

  /** Kunci eksklusif (mis. `import:<siklus>:<eselon I>`). Mengembalikan fungsi pelepas, atau null bila sudah dipegang. */
  tryLock(key: string): (() => void) | null {
    if (this.locks.has(key)) return null;
    this.locks.add(key);
    return () => { this.locks.delete(key); };
  }

  /**
   * Membuat job berstatus `berjalan` dengan langkah-langkahnya (semua `menunggu`). Kunci (bila ada) dilepas
   * otomatis saat job selesai atau gagal.
   */
  create(kind: string, ownerUserId: string, stepKeys: string[], release?: () => void): JobHandle {
    this.sweep();
    const job: JobState = {
      id: newId("job"), kind, ownerUserId, status: "berjalan", steps: stepKeys.map((key) => ({ key, status: "menunggu" })),
      rowsDone: 0, rowsTotal: null, percent: 0, startedAt: Date.now(), finishedAt: null, error: null, result: null
    };
    this.jobs.set(job.id, job);
    let released = false;
    const done = () => { if (!released) { released = true; release?.(); } };
    return {
      id: job.id,
      setStep: (key, status) => { const step = job.steps.find((entry) => entry.key === key); if (step) step.status = status; },
      progress: (update) => {
        if (update.rowsDone !== undefined) job.rowsDone = update.rowsDone;
        if (update.rowsTotal !== undefined) job.rowsTotal = update.rowsTotal;
        // Selama berjalan, persen tidak pernah mencapai 100 dan tidak pernah turun.
        if (update.percent !== undefined) job.percent = Math.max(job.percent, Math.min(99, Math.floor(update.percent)));
      },
      finish: (result) => {
        job.status = "selesai"; job.result = result; job.percent = 100; job.finishedAt = Date.now();
        for (const step of job.steps) step.status = "selesai";
        done();
      },
      fail: (message) => { job.status = "gagal"; job.error = message; job.finishedAt = Date.now(); done(); }
    };
  }

  get(id: string): JobState | undefined {
    return this.jobs.get(id);
  }

  toDto(job: JobState): JobDto<string, unknown> {
    return {
      id: job.id, kind: job.kind, status: job.status, steps: job.steps.map((step) => ({ ...step })), rowsDone: job.rowsDone, rowsTotal: job.rowsTotal,
      percent: job.percent, startedAt: job.startedAt, finishedAt: job.finishedAt, error: job.error, result: job.status === "selesai" ? job.result : null
    };
  }

  private sweep() {
    const cutoff = Date.now() - RETENTION_MS;
    for (const [id, job] of this.jobs) if (job.finishedAt !== null && job.finishedAt < cutoff) this.jobs.delete(id);
  }
}
