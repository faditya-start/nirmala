import { readSheetRows } from "./xlsxReader.js";

/**
 * Profil riwayat temuan BPK per Satker dari rekap PTL (xlsx). Hanya dijalankan lokal.
 *
 * Hanya kolom yang diizinkan docs/data-analysis.md §3 yang dibaca: KODE SATKER, TAHUN LHP,
 * STATUS SiPTL, Tagging Temuan, dan JUDUL TEMUAN BESAR (hanya untuk menentukan tema, tidak disimpan).
 * "Pejabat Terkait", "Keterangan Paket", dan semua kolom uraian tidak pernah disentuh.
 * Keluaran = hitungan per (kode Satker, tema). Tidak ada nama orang atau Satker.
 */

export const FINDING_THEMES = ["penganggaran", "klasifikasi_belanja", "perjalanan_dinas", "honorarium", "paket_meeting"] as const;
export type FindingTheme = typeof FINDING_THEMES[number];

const THEME_PATTERNS: Record<FindingTheme, RegExp> = {
  penganggaran: /penganggaran|perencanaan anggaran|anggaran (tidak|belum)/,
  klasifikasi_belanja: /klasifikasi|salah (akun|klasifikasi)|kesalahan (akun|klasifikasi|penganggaran|penjurnalan)|belanja modal.{0,40}belanja barang|belanja barang.{0,40}belanja modal|(dianggarkan|dicatat|dibebankan).{0,30}akun/,
  perjalanan_dinas: /perjalanan dinas|sppd|uang harian/,
  honorarium: /honor/,
  paket_meeting: /paket meeting|full ?board|full ?day|paket rapat|rapat.{0,20}paket/
};

/** Satu temuan bisa masuk lebih dari satu tema. */
export function classifyThemes(title: string | undefined, tag: string | undefined): FindingTheme[] {
  const text = `${title ?? ""} | ${tag ?? ""}`.toLowerCase();
  return FINDING_THEMES.filter((theme) => THEME_PATTERNS[theme].test(text));
}

/** Kode Satker di PTL tersimpan sebagai angka ("693741.0"). Hasil: 6 digit, atau null bila tidak valid. */
export function normalizeSatkerCode(raw: string | undefined): string | null {
  const digits = (raw ?? "").trim().replace(/\.0+$/, "");
  return /^\d{1,6}$/.test(digits) ? digits.padStart(6, "0") : null;
}

export interface FindingRow { satkerCode: string | null; year: number | null; status: string; themes: FindingTheme[] }
export interface FindingStat { workUnitCode: string; theme: FindingTheme; countTotal: number; countOpen: number; latestYear: number | null }

/** Status terbuka = BS (belum sesuai) dan BT (belum ditindaklanjuti). Huruf besar/kecil tidak dibedakan. */
export const isOpenStatus = (status: string) => ["BS", "BT"].includes(status.trim().toUpperCase());

export function buildFindingStats(rows: Iterable<FindingRow>): FindingStat[] {
  const stats = new Map<string, FindingStat>();
  for (const row of rows) {
    if (!row.satkerCode) continue;
    for (const theme of row.themes) {
      const key = `${row.satkerCode}|${theme}`;
      let stat = stats.get(key);
      if (!stat) { stat = { workUnitCode: row.satkerCode, theme, countTotal: 0, countOpen: 0, latestYear: null }; stats.set(key, stat); }
      stat.countTotal++;
      if (isOpenStatus(row.status)) stat.countOpen++;
      if (row.year !== null && (stat.latestYear === null || row.year > stat.latestYear)) stat.latestYear = row.year;
    }
  }
  return [...stats.values()].sort((a, b) => a.workUnitCode.localeCompare(b.workUnitCode) || a.theme.localeCompare(b.theme));
}

const headerKey = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
const WANTED = { satker: "kode satker", year: "tahun lhp", status: "status siptl", tag: "tagging temuan", title: "judul temuan besar" } as const;

export interface PtlSummary { rowsRead: number; rowsThemed: number; stats: FindingStat[] }

/**
 * Membaca sheet PTL. Kolom dicari lewat judul header (baris pertama yang memuat "KODE SATKER"),
 * bukan huruf kolom, sehingga tahan terhadap kolom yang bergeser.
 */
export async function readPtlFindings(path: string, sheetName = "PTL 27 JULI 2026"): Promise<PtlSummary> {
  let columns: Record<keyof typeof WANTED, string> | null = null;
  let rowsRead = 0;
  let rowsThemed = 0;
  const rows: FindingRow[] = [];
  for await (const { cells } of readSheetRows(path, sheetName)) {
    if (!columns) {
      const byTitle = new Map(Object.entries(cells).map(([column, value]) => [headerKey(value), column]));
      if (!byTitle.has(WANTED.satker)) continue;
      const found = {} as Record<keyof typeof WANTED, string>;
      for (const [name, title] of Object.entries(WANTED)) {
        const column = byTitle.get(title);
        if (!column) throw new Error(`Kolom "${title}" tidak ditemukan di sheet PTL.`);
        found[name as keyof typeof WANTED] = column;
      }
      columns = found;
      continue;
    }
    if (!Object.keys(cells).length) continue;
    rowsRead++;
    const themes = classifyThemes(cells[columns.title], cells[columns.tag]);
    if (themes.length) rowsThemed++;
    const year = Number(cells[columns.year]);
    rows.push({ satkerCode: normalizeSatkerCode(cells[columns.satker]), year: Number.isFinite(year) && year > 1990 ? year : null, status: cells[columns.status] ?? "", themes });
  }
  if (!columns) throw new Error("Header PTL (baris dengan \"KODE SATKER\") tidak ditemukan.");
  return { rowsRead, rowsThemed, stats: buildFindingStats(rows) };
}
