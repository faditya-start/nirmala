import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { once } from "node:events";
import { createInterface } from "node:readline";

/**
 * Pembaca dump MySQL (Navicat / mysqldump, satu `INSERT INTO ... VALUES (...)` per baris atau
 * beberapa tuple per pernyataan) secara streaming, tanpa MySQL. Hanya dipakai lokal untuk data/private.
 */

export type SqlValue = string | number | null;

const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", "0": "\0", b: "\b", Z: "\x1a" };

/**
 * Membaca daftar tuple dari `text` mulai di `start`. Mengembalikan `null` bila string di ujung teks
 * belum tertutup (pemanggil menyambung baris berikutnya dan mengulang).
 */
function parseTuples(text: string, start: number): SqlValue[][] | null {
  const tuples: SqlValue[][] = [];
  let i = start;
  const n = text.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(text[i])) i++;
    if (text[i] !== "(") break;
    i++;
    const values: SqlValue[] = [];
    for (;;) {
      while (i < n && text[i] === " ") i++;
      if (i >= n) return null;
      if (text[i] === "'") {
        let out = "";
        i++;
        for (;;) {
          if (i >= n) return null;
          const ch = text[i];
          if (ch === "\\") {
            if (i + 1 >= n) return null;
            out += ESCAPES[text[i + 1]] ?? text[i + 1];
            i += 2;
          } else if (ch === "'") {
            if (text[i + 1] === "'") { out += "'"; i += 2; } else { i++; break; }
          } else { out += ch; i++; }
        }
        values.push(out);
      } else {
        let end = i;
        while (end < n && text[end] !== "," && text[end] !== ")") end++;
        if (end >= n) return null;
        const token = text.slice(i, end).trim();
        values.push(token.toUpperCase() === "NULL" ? null : Number.isFinite(Number(token)) ? Number(token) : token);
        i = end;
      }
      while (i < n && text[i] === " ") i++;
      if (text[i] === ",") { i++; continue; }
      if (text[i] === ")") { i++; break; }
      return null;
    }
    tuples.push(values);
  }
  return tuples;
}

/** Nama kolom dari `CREATE TABLE`, sesuai urutan tuple INSERT. */
function parseColumnNames(createLines: string[]): string[] {
  const columns: string[] = [];
  for (const line of createLines) {
    const match = /^\s*`([^`]+)`\s/.exec(line);
    if (match) columns.push(match[1]);
  }
  return columns;
}

export interface DumpRow { [column: string]: SqlValue }

/** Menghasilkan satu objek per baris tabel `table` di dalam dump. */
export async function* readDumpTable(path: string, table: string): AsyncGenerator<DumpRow> {
  const lines = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  const createHeader = `CREATE TABLE \`${table}\``;
  const insertPrefix = `INSERT INTO \`${table}\` VALUES `;
  let columns: string[] | null = null;
  let inCreate = false;
  const createLines: string[] = [];
  let statement = "";

  for await (const line of lines) {
    if (statement) {
      statement += `\n${line}`;
    } else if (!columns) {
      if (inCreate) {
        if (/^\)/.test(line)) { columns = parseColumnNames(createLines); inCreate = false; } else createLines.push(line);
      } else if (line.startsWith(createHeader)) inCreate = true;
      continue;
    } else if (line.startsWith(insertPrefix)) {
      statement = line;
    } else continue;

    const tuples = parseTuples(statement, insertPrefix.length);
    if (!tuples) continue; // string belum tertutup: sambung dengan baris berikutnya
    statement = "";
    for (const values of tuples) {
      if (values.length !== columns!.length) throw new Error(`Dump ${table}: ${values.length} nilai, ${columns!.length} kolom.`);
      const row: DumpRow = {};
      columns!.forEach((name, index) => { row[name] = values[index]; });
      yield row;
    }
  }
  if (!columns) throw new Error(`Tabel ${table} tidak ditemukan di dump.`);
}

const csvCell = (value: SqlValue) => {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Kolom keluaran CSV berformat SIPEKA (docs/data-analysis.md §2.1). Kolom CHR_* (catatan reviu),
 * POK_NILAI_* dan kolom lain yang tidak dipakai MVP sengaja tidak ikut. `d_dipa_awal` tidak punya ID_ITEM.
 */
export const AWAL_CSV_COLUMNS = [
  "TAHUN", "BAES1", "KDSATKER", "KODE_PROGRAM", "KODE_KEGIATAN", "KODE_OUTPUT", "KODE_SUBOUTPUT", "KODE_KOMPONEN", "KODE_SUBKOMPONEN",
  "URAIAN_SUBKOMPONEN", "KODE_AKUN", "HEADER1", "HEADER2", "NOMOR_ITEM", "CONS_ITEM", "URAIAN_ITEM",
  "VOL_KEG_1", "SAT_KEG_1", "VOL_KEG_2", "SAT_KEG_2", "VOL_KEG_3", "SAT_KEG_3", "VOL_KEG_4", "SAT_KEG_4",
  "VOLKEG", "SATKEG", "HARGASAT", "TOTAL", "KODE_BLOKIR", "NILAI_BLOKIR"
] as const;

export interface ConvertedFile { baes1: string; path: string; rows: number }

/** Mengubah `d_dipa_awal` menjadi satu CSV per eselon I (`es1_<BAES1>_<tahun>.csv`) di `outputDir`. */
export async function convertDipaDump(sqlPath: string, outputDir: string, table = "d_dipa_awal"): Promise<ConvertedFile[]> {
  await mkdir(outputDir, { recursive: true });
  const outputs = new Map<string, { stream: WriteStream; path: string; rows: number }>();
  try {
    for await (const row of readDumpTable(sqlPath, table)) {
      const baes1 = String(row.BAES1 ?? "").trim();
      if (!baes1) continue;
      let output = outputs.get(baes1);
      if (!output) {
        const path = join(outputDir, `es1_${baes1}_${row.TAHUN}.csv`);
        const stream = createWriteStream(path, { encoding: "utf8" });
        stream.write(`${AWAL_CSV_COLUMNS.join(",")}\n`);
        output = { stream, path, rows: 0 };
        outputs.set(baes1, output);
      }
      output.rows++;
      if (!output.stream.write(`${AWAL_CSV_COLUMNS.map((column) => csvCell(row[column] ?? null)).join(",")}\n`)) await once(output.stream, "drain");
    }
  } finally {
    await Promise.all([...outputs.values()].map(({ stream }) => new Promise<void>((resolve) => stream.end(resolve))));
  }
  return [...outputs.entries()].map(([baes1, { path, rows }]) => ({ baes1, path, rows })).sort((a, b) => a.baes1.localeCompare(b.baes1));
}
