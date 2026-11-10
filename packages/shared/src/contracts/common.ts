/**
 * Tipe bersama untuk kontrak API fase 3-6 (lihat docs/api-contract.md).
 *
 * Konvensi:
 * - Uang = integer rupiah. Waktu = epoch ms. id = string. Kode kategori/status memakai konstanta di `../index.ts`.
 * - Query string selalu string; skema zod di sini memakai `coerce` / `queryBoolean` agar API cukup memanggil
 *   `schema.safeParse(context.req.query())`.
 * - Nilai filter kosong ("") diperlakukan sama dengan tidak dikirim.
 * - Galat memakai `ApiError` (`{ error: "<pesan Indonesia>" }`) dengan status HTTP; lihat docs/api-contract.md bagian 1.
 * - DTO tidak membawa kalimat tampilan. Teks yang berasal dari data (alasan aturan, uraian item, nama Satker)
 *   dikirim apa adanya.
 */
import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Id string tak kosong (id entitas dibuat server, mis. `item_ab12...`). */
export const idSchema = z.string().trim().min(1).max(100);

/** Id opsional dari query string; string kosong menjadi `undefined`. */
export const optionalIdSchema = z.string().trim().max(100).transform((value) => (value === "" ? undefined : value)).optional();

/** Teks pencarian bebas. Kosong dianggap tidak ada. */
export const searchTextSchema = z.string().trim().max(200).transform((value) => (value === "" ? undefined : value)).optional();

/** Boolean dari query string: `true|false|1|0`. */
export const queryBoolean = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((value) => value === true || value === "true" || value === "1");

/** Epoch ms atau string tanggal (`YYYY-MM-DD` / ISO 8601). Keluarannya selalu epoch ms. */
export const dateInputSchema = z.union([
  z.number().int(),
  z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Tanggal tidak valid.").transform((value) => Date.parse(value))
]);

export const sortDirectionSchema = z.enum(["asc", "desc"]);
export type SortDirection = z.infer<typeof sortDirectionSchema>;

/** `?page=1&pageSize=25`. Halaman mulai dari 1. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Pagination {
  page: number;
  pageSize: number;
  /** Jumlah baris yang cocok dengan filter (bukan hanya halaman ini). */
  total: number;
  totalPages: number;
}

/** Bentuk respons daftar berhalaman: `{ items, pagination }`. (Endpoint lama memakai nama koleksi sendiri, mis. `logs`.) */
export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export function toPagination(page: number, pageSize: number, total: number): Pagination {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Selisih hari bulat (>= 0) antara dua epoch ms; dipakai untuk umur catatan dan "terakhir bergerak". */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / 86_400_000));
}

// ---------------------------------------------------------------- Job asinkron (impor besar, hitung ulang)

export const JOB_STATUSES = ["berjalan", "selesai", "gagal"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_STEP_STATUSES = ["menunggu", "berjalan", "selesai"] as const;
export type JobStepStatus = (typeof JOB_STEP_STATUSES)[number];

export interface JobStep {
  /** Impor: `baca_file` | `saring_header` | `simpan_item` | `aturan_dan_skor`. Hitung ulang: `aturan` | `skor`. */
  key: string;
  status: JobStepStatus;
}

/**
 * Status job. Disimpan di memori proses (satu proses server). Setelah server restart job hilang dan
 * `GET /api/jobs/:id` menjawab 404; UI lalu memuat ulang daftar snapshot.
 */
export interface JobDto<Kind extends string, Result> {
  id: string;
  kind: Kind;
  status: JobStatus;
  steps: JobStep[];
  /** Baris yang sudah dibaca dan total baris berkas (null bila total belum diketahui). */
  rowsDone: number;
  rowsTotal: number | null;
  /** 0-100. */
  percent: number;
  startedAt: number;
  finishedAt: number | null;
  /** Pesan galat Indonesia bila `status = gagal`. */
  error: string | null;
  /** Hanya terisi saat `status = selesai`. */
  result: Result | null;
}
