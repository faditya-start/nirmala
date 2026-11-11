import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { readSheetRows } from "../src/ingest/xlsxReader.ts";
import { buildFindingStats, classifyThemes, normalizeSatkerCode, readPtlFindings } from "../src/ingest/ptlProfile.ts";
import { convertDipaDump, readDumpTable } from "../src/ingest/sqlDump.ts";
import { readSnapshotRows } from "../src/ingest/csvParser.ts";

/** Membuat berkas zip minimal (tanpa CRC, cukup untuk pembaca kita). */
function makeZip(files: Record<string, string>, method: 0 | 8 = 8): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(content);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(method, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(centralBuffer.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}

const cell = (ref: string, text: string, shared: string[]) => { shared.push(text); return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`; };

/** xlsx sintetis meniru bentuk rekap PTL: dua baris kosong, header di baris 3, lalu data. */
function makeSyntheticPtl(rows: { satker: string; year: string; status: string; title: string; tag: string }[]) {
  const shared: string[] = [];
  const headers = ["KODE SATKER", "TAHUN LHP", "STATUS SiPTL", "Tagging Temuan", "JUDUL TEMUAN BESAR", "Pejabat Terkait"];
  const columns = ["A", "B", "C", "D", "E", "F"];
  let sheet = `<row r="1"/><row r="2"></row><row r="3">${headers.map((title, index) => cell(`${columns[index]}3`, ` ${title.toUpperCase() === title ? title : title} `, shared)).join("")}</row>`;
  rows.forEach((row, index) => {
    const r = index + 4;
    sheet += `<row r="${r}"><c r="A${r}"><v>${row.satker}</v></c>${cell(`B${r}`, row.year, shared)}${cell(`C${r}`, row.status, shared)}${cell(`D${r}`, row.tag, shared)}${cell(`E${r}`, row.title, shared)}${cell(`F${r}`, "Nama Orang Rekaan", shared)}</row>`;
  });
  const sst = `<sst>${shared.map((text) => `<si><t xml:space="preserve">${text.replace(/&/g, "&amp;")}</t></si>`).join("")}</sst>`;
  return makeZip({
    "xl/workbook.xml": `<workbook><sheets><sheet name="Lain" sheetId="1" r:id="rId1"/><sheet name="PTL 27 JULI 2026" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": sst,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>abaikan</t></is></c></row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet><sheetData>${sheet}</sheetData></worksheet>`
  });
}

test("xlsx: sheet dipilih lewat nama, string bersama, inlineStr, entitas, baris kosong", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nirmala-xlsx-"));
  const path = join(dir, "a.xlsx");
  const zip = makeZip({
    "xl/workbook.xml": `<workbook><sheets><sheet name="Satu" sheetId="1" r:id="rId1"/><sheet name="Dua &amp; Tiga" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst><si><t>halo &amp; dunia</t></si><si><r><t>pe</t></r><r><t>cah</t></r><rPh><t>abaikan</t></rPh></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>salah sheet</t></is></c></row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet><sheetData><row r="1" spans="1:3"><c r="A1" t="s"><v>0</v></c><c r="B1" s="2"/><c r="C1" t="inlineStr"><is><t>sebaris</t></is></c><c r="AA1"><v>12.5</v></c></row><row r="2"/><row r="3"><c r="B3" t="s"><v>1</v></c></row></sheetData></worksheet>`
  });
  await writeFile(path, zip);
  const rows = [];
  for await (const row of readSheetRows(path, "Dua & Tiga")) rows.push(row);
  assert.deepEqual(rows, [
    { row: 1, cells: { A: "halo & dunia", C: "sebaris", AA: "12.5" } },
    { row: 2, cells: {} },
    { row: 3, cells: { B: "pecah" } }
  ]);
  await assert.rejects(async () => { for await (const _ of readSheetRows(path, "Tidak ada")) void _; }, /tidak ditemukan/);
});

test("xlsx: berkas yang bukan zip ditolak dan metode tanpa kompresi dibaca", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nirmala-xlsx-"));
  await writeFile(join(dir, "bukan.xlsx"), "bukan zip");
  await assert.rejects(async () => { for await (const _ of readSheetRows(join(dir, "bukan.xlsx"))) void _; }, /valid/);
  const stored = makeZip({
    "xl/workbook.xml": `<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData></worksheet>`
  }, 0);
  await writeFile(join(dir, "stored.xlsx"), stored);
  const rows = [];
  for await (const row of readSheetRows(join(dir, "stored.xlsx"))) rows.push(row);
  assert.deepEqual(rows, [{ row: 1, cells: { A: "7" } }]);
});

test("PTL: tema temuan, normalisasi kode Satker, dan agregasi per Satker × tema", () => {
  assert.deepEqual(classifyThemes("Kesalahan penganggaran belanja modal dan belanja barang", ""), ["penganggaran", "klasifikasi_belanja"]);
  assert.deepEqual(classifyThemes("Pertanggungjawaban SPPD tidak sesuai", "Teguran"), ["perjalanan_dinas"]);
  assert.deepEqual(classifyThemes("Honorarium melebihi ketentuan paket meeting fullboard", ""), ["honorarium", "paket_meeting"]);
  assert.deepEqual(classifyThemes("Kelebihan pembayaran pekerjaan jalan", "Kelebihan Pembayaran"), []);
  assert.deepEqual(classifyThemes("Lain", "Penganggaran"), ["penganggaran"]);

  assert.equal(normalizeSatkerCode("693741.0"), "693741");
  assert.equal(normalizeSatkerCode("1234"), "001234");
  assert.equal(normalizeSatkerCode(" 693741 "), "693741");
  assert.equal(normalizeSatkerCode("abc"), null);
  assert.equal(normalizeSatkerCode(undefined), null);

  const stats = buildFindingStats([
    { satkerCode: "693741", year: 2019, status: "BS", themes: ["penganggaran"] },
    { satkerCode: "693741", year: 2022, status: "bt", themes: ["penganggaran", "honorarium"] },
    { satkerCode: "693741", year: 2021, status: "SS", themes: ["penganggaran"] },
    { satkerCode: null, year: 2020, status: "BS", themes: ["penganggaran"] },
    { satkerCode: "693742", year: null, status: "TPTD", themes: ["honorarium"] }
  ]);
  assert.deepEqual(stats, [
    { workUnitCode: "693741", theme: "honorarium", countTotal: 1, countOpen: 1, latestYear: 2022 },
    { workUnitCode: "693741", theme: "penganggaran", countTotal: 3, countOpen: 2, latestYear: 2022 },
    { workUnitCode: "693742", theme: "honorarium", countTotal: 1, countOpen: 0, latestYear: null }
  ]);
});

test("PTL: membaca xlsx sintetis lewat judul header dan tidak menyentuh kolom pejabat", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nirmala-ptl-"));
  const path = join(dir, "ptl.xlsx");
  await writeFile(path, makeSyntheticPtl([
    { satker: "693741.0", year: "2020", status: "BS", title: "Penganggaran tidak sesuai ketentuan", tag: "Penganggaran" },
    { satker: "693741.0", year: "2023", status: "SS", title: "Honorarium melebihi ketentuan", tag: "" },
    { satker: "693742.0", year: "2021", status: "BT", title: "Kelebihan pembayaran", tag: "Kelebihan Pembayaran" }
  ]));
  const summary = await readPtlFindings(path);
  assert.equal(summary.rowsRead, 3);
  assert.equal(summary.rowsThemed, 2);
  assert.deepEqual(summary.stats, [
    { workUnitCode: "693741", theme: "honorarium", countTotal: 1, countOpen: 0, latestYear: 2023 },
    { workUnitCode: "693741", theme: "penganggaran", countTotal: 1, countOpen: 1, latestYear: 2020 }
  ]);
  assert.ok(!JSON.stringify(summary).includes("Rekaan"), "kolom pejabat tidak boleh ikut ke keluaran");
});

const DUMP = `/* Navicat */
SET NAMES utf8mb4;
DROP TABLE IF EXISTS \`d_dipa_awal\`;
CREATE TABLE \`d_dipa_awal\`  (
  \`ID\` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  \`TAHUN\` int UNSIGNED NULL DEFAULT NULL,
  \`BAES1\` char(5) CHARACTER SET utf8mb4 NULL DEFAULT NULL,
  \`KDSATKER\` char(6) NULL DEFAULT NULL,
  \`KODE_PROGRAM\` char(2) NULL DEFAULT NULL,
  \`KODE_KEGIATAN\` char(4) NULL DEFAULT NULL,
  \`KODE_OUTPUT\` char(3) NULL DEFAULT NULL,
  \`KODE_SUBOUTPUT\` char(3) NULL DEFAULT NULL,
  \`KODE_KOMPONEN\` char(3) NULL DEFAULT NULL,
  \`KODE_SUBKOMPONEN\` char(2) NULL DEFAULT NULL,
  \`URAIAN_SUBKOMPONEN\` varchar(255) NULL DEFAULT NULL,
  \`KODE_AKUN\` char(6) NULL DEFAULT NULL,
  \`HEADER1\` int UNSIGNED NULL DEFAULT NULL,
  \`HEADER2\` int UNSIGNED NULL DEFAULT NULL,
  \`NOMOR_ITEM\` int UNSIGNED NULL DEFAULT NULL,
  \`CONS_ITEM\` int UNSIGNED NULL DEFAULT NULL,
  \`URAIAN_ITEM\` varchar(255) NULL DEFAULT NULL,
  \`VOL_KEG_1\` double UNSIGNED NULL DEFAULT NULL,
  \`SAT_KEG_1\` varchar(255) NULL DEFAULT NULL,
  \`VOL_KEG_2\` double UNSIGNED NULL DEFAULT NULL,
  \`SAT_KEG_2\` varchar(255) NULL DEFAULT NULL,
  \`VOL_KEG_3\` double UNSIGNED NULL DEFAULT NULL,
  \`SAT_KEG_3\` varchar(255) NULL DEFAULT NULL,
  \`VOL_KEG_4\` double NULL DEFAULT NULL,
  \`SAT_KEG_4\` varchar(255) NULL DEFAULT NULL,
  \`VOLKEG\` double NULL DEFAULT NULL,
  \`SATKEG\` varchar(255) NULL DEFAULT NULL,
  \`HARGASAT\` double NULL DEFAULT NULL,
  \`TOTAL\` double NULL DEFAULT NULL,
  \`KODE_BLOKIR\` char(1) NULL DEFAULT NULL,
  \`NILAI_BLOKIR\` double NULL DEFAULT NULL,
  \`CHR_AKUN\` text NULL COMMENT 'Catatan reviu',
  PRIMARY KEY (\`ID\`) USING BTREE,
  INDEX \`BAES1\`(\`BAES1\` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 5 CHARACTER SET = utf8mb4;

-- ----------------------------
INSERT INTO \`d_dipa_awal\` VALUES (1, 2026, '90001', '900001', 'WA', '0001', 'EBA', '001', '051', 'A', 'Subkomponen, dengan koma', '521211', 1, 0, 0, 0, 'JUDUL KELOMPOK', 0, NULL, 0, NULL, 0, NULL, 0, NULL, 0, NULL, 0, 0, NULL, 0, NULL);
INSERT INTO \`d_dipa_awal\` VALUES (2, 2026, '90001', '900001', 'WA', '0001', 'EBA', '001', '051', 'A', 'Subkomponen, dengan koma', '521211', 0, 0, 1, 1, 'Rapat "koordinasi" it\\'s, baris\\nbaru', 2, 'OK', 0, NULL, 0, NULL, 0, NULL, 2, 'OK', 1.5e5, 3e5, NULL, 0, 'Catatan rahasia yang tidak boleh ikut');
INSERT INTO \`d_dipa_awal\` VALUES (3, 2026, '90002', '900002', 'WA', '0001', 'EBA', '001', '051', 'A', NULL, '522141', 0, 0, 1, 1, 'Belanja ''ganda'' kutip
dengan newline asli', 1, 'Paket', 0, NULL, 0, NULL, 0, NULL, 1, 'Paket', 2000000, 2000000, NULL, 0, NULL);
INSERT INTO \`d_dipa_awal\` VALUES (4, 2026, '90001', '900001', 'WA', '0001', 'EBA', '001', '051', 'A', NULL, '521211', 0, 0, 2, 2, 'Item kedua', 1, 'OK', 0, NULL, 0, NULL, 0, NULL, 1, 'OK', 100, 100, '1', 50, NULL), (5, 2026, '90001', '900001', 'WA', '0001', 'EBA', '001', '051', 'A', NULL, '521211', 0, 0, 3, 3, 'Item ketiga', 1, 'OK', 0, NULL, 0, NULL, 0, NULL, 1, 'OK', 100, 100, NULL, 0, NULL);
INSERT INTO \`tabel_lain\` VALUES (1, 'tidak dibaca');
`;

test("dump SQL: tuple, escape MySQL, newline di dalam string, dan banyak tuple per pernyataan", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nirmala-dump-"));
  const path = join(dir, "d_dipa_awal.sql");
  await writeFile(path, DUMP);
  const rows = [];
  for await (const row of readDumpTable(path, "d_dipa_awal")) rows.push(row);
  assert.equal(rows.length, 5);
  assert.equal(rows[1].URAIAN_ITEM, `Rapat "koordinasi" it's, baris\nbaru`);
  assert.equal(rows[1].HARGASAT, 150000);
  assert.equal(rows[1].KODE_BLOKIR, null);
  assert.equal(rows[2].URAIAN_ITEM, "Belanja 'ganda' kutip\ndengan newline asli");
  assert.equal(rows[2].URAIAN_SUBKOMPONEN, null);
  assert.equal(rows[3].KODE_BLOKIR, "1");
  assert.equal(rows[4].URAIAN_ITEM, "Item ketiga");
  await assert.rejects(async () => { for await (const _ of readDumpTable(path, "tidak_ada")) void _; }, /tidak ditemukan/);
});

test("dump SQL → CSV SIPEKA: satu berkas per eselon I, terbaca parser impor, tanpa kolom catatan", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nirmala-dump-"));
  const path = join(dir, "d_dipa_awal.sql");
  await writeFile(path, DUMP);
  const files = await convertDipaDump(path, join(dir, "out"));
  assert.deepEqual(files.map(({ baes1, rows }) => [baes1, rows]), [["90001", 4], ["90002", 1]]);

  const text = await readFile(files[0].path, "utf8");
  assert.ok(!text.includes("rahasia") && !text.includes("CHR_AKUN"), "catatan reviu tidak boleh ikut ke CSV");

  const stats = { totalRows: 0, headerRowsSkipped: 0 };
  const items = [];
  for await (const { row } of readSnapshotRows(files[0].path, stats)) items.push(row);
  assert.equal(stats.headerRowsSkipped, 1);
  assert.equal(items.length, 3);
  assert.equal(items[0].URAIAN_ITEM, `Rapat "koordinasi" it's, baris\nbaru`);
  assert.equal(items[0].HARGASAT, 150000);
  assert.equal(items[0].TOTAL, 300000);
  assert.equal(items[1].KODE_BLOKIR, "1");
  assert.equal(items[1].NILAI_BLOKIR, 50);
  assert.equal(items[0].URAIAN_SUBKOMPONEN, "Subkomponen, dengan koma");
});
