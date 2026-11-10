import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { z } from "zod";

/**
 * Pembaca CSV streaming (RFC 4180: kutip ganda, `""`, newline di dalam kutip, CRLF, BOM).
 * Menghasilkan satu baris (array kolom) per iterasi tanpa memuat seluruh berkas.
 */
export async function* readCsvRecords(path: string, highWaterMark = 1 << 20): AsyncGenerator<string[]> {
  const stream = createReadStream(path, { encoding: "utf8", highWaterMark });
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let pendingQuote = false; // tanda kutip yang terlihat di dalam kutip tepat di akhir chunk
  let first = true;

  for await (const raw of stream) {
    let chunk = raw as string;
    if (first) { first = false; if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1); }
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (pendingQuote) {
        pendingQuote = false;
        if (ch === '"') { field += '"'; continue; }
        inQuotes = false;
      }
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < chunk.length) {
            if (chunk[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
          } else pendingQuote = true;
        } else field += ch;
        continue;
      }
      if (ch === '"' && field === "") inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") {
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") yield row;
        row = [];
      } else if (ch !== "\r") field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") yield row;
  }
}

export function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path).on("data", (data) => hash.update(data)).on("error", reject).on("end", () => resolve(hash.digest("hex")));
  });
}

const text = z.string().transform((value) => value.trim());
const optionalText = text.transform((value) => (value === "" ? null : value));
const amount = text.transform((value) => (value === "" ? 0 : Number(value.replace(/,/g, ""))))
  .refine((value) => Number.isFinite(value), "Bukan angka.");
const integerAmount = amount.transform((value) => Math.round(value));
const flag = text.transform((value) => value === "1");
const code = (name: string) => text.refine((value) => value !== "", `${name} wajib diisi.`);

/** Kolom `es1_*` yang dipakai MVP (docs/data-analysis.md §2.1). Kolom lain diabaikan. */
export const sipekaRowSchema = z.object({
  TAHUN: text.refine((value) => /^\d{4}$/.test(value), "TAHUN harus 4 digit.").transform(Number),
  BAES1: code("BAES1"),
  KDSATKER: text.refine((value) => /^\d{6}$/.test(value), "KDSATKER harus 6 digit."),
  KODE_PROGRAM: text,
  KODE_KEGIATAN: text,
  KODE_OUTPUT: text,
  KODE_SUBOUTPUT: text,
  KODE_KOMPONEN: text,
  KODE_SUBKOMPONEN: text,
  URAIAN_SUBKOMPONEN: optionalText,
  KODE_AKUN: text,
  HEADER1: flag,
  HEADER2: flag,
  NOMOR_ITEM: optionalText,
  CONS_ITEM: optionalText,
  URAIAN_ITEM: text,
  VOL_KEG_1: amount, SAT_KEG_1: optionalText,
  VOL_KEG_2: amount, SAT_KEG_2: optionalText,
  VOL_KEG_3: amount, SAT_KEG_3: optionalText,
  VOL_KEG_4: amount, SAT_KEG_4: optionalText,
  VOLKEG: amount,
  SATKEG: optionalText,
  HARGASAT: integerAmount,
  TOTAL: integerAmount,
  KODE_BLOKIR: optionalText,
  NILAI_BLOKIR: integerAmount,
  ID_ITEM: optionalText
}).partial({ ID_ITEM: true });

export type SipekaRow = z.infer<typeof sipekaRowSchema>;

/** Kolom yang wajib ada di header. Kolom opsional dianggap kosong bila tidak ada. */
export const REQUIRED_COLUMNS = ["TAHUN", "BAES1", "KDSATKER", "KODE_PROGRAM", "KODE_KEGIATAN", "KODE_OUTPUT", "KODE_SUBOUTPUT", "KODE_KOMPONEN", "KODE_SUBKOMPONEN", "KODE_AKUN", "HEADER1", "HEADER2", "URAIAN_ITEM", "VOLKEG", "SATKEG", "HARGASAT", "TOTAL"] as const;

export class CsvFormatError extends Error {
  constructor(message: string, readonly line?: number) { super(line ? `${message} (baris ${line})` : message); this.name = "CsvFormatError"; }
}

export interface ParsedRow { line: number; row: SipekaRow }

/**
 * Membaca berkas ekspor SIPEKA/SAKTI. Memvalidasi header dan setiap baris dengan zod.
 * Baris judul kelompok (HEADER1 / HEADER2 = 1) tidak dihasilkan, hanya dihitung di `stats`.
 */
export async function* readSnapshotRows(path: string, stats = { totalRows: 0, headerRowsSkipped: 0 }): AsyncGenerator<ParsedRow> {
  let columns: string[] | null = null;
  let line = 0;
  for await (const record of readCsvRecords(path)) {
    line++;
    if (!columns) {
      columns = record.map((name) => name.trim().toUpperCase());
      const missing = REQUIRED_COLUMNS.filter((name) => !columns!.includes(name));
      if (missing.length) throw new CsvFormatError(`Kolom wajib tidak ditemukan: ${missing.join(", ")}`, 1);
      continue;
    }
    stats.totalRows++;
    const raw: Record<string, string> = {};
    for (let i = 0; i < columns.length; i++) raw[columns[i]] = record[i] ?? "";
    const parsed = sipekaRowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new CsvFormatError(`Data tidak valid pada kolom ${String(issue?.path[0] ?? "?")}: ${issue?.message ?? "tidak valid"}`, line);
    }
    if (parsed.data.HEADER1 || parsed.data.HEADER2) { stats.headerRowsSkipped++; continue; }
    yield { line, row: parsed.data };
  }
  if (!columns) throw new CsvFormatError("Berkas kosong.");
}
