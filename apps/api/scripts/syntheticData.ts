/**
 * Data sintetis berformat SIPEKA (es1_<BAES1>_<tahun>.csv). Seluruhnya fiktif dan deterministik.
 * Tidak membaca data/private. Dipakai oleh generate-synthetic.ts (menulis fixtures) dan test.
 *
 * Kasus yang disisipkan sengaja diskrip: satu kasus untuk tiap aturan R01-R08 dan campuran
 * item yang diperbaiki, tidak diperbaiki, dihapus, dan baru di revisi.
 */
export const FISCAL_YEAR = 2026;

export const CSV_COLUMNS = [
  "ID", "TAHUN", "BAES1", "KDSATKER", "KODE_PROGRAM", "KODE_KEGIATAN", "KODE_OUTPUT", "KDIB", "VOLUME_OUTPUT", "KODE_SUBOUTPUT", "VOLUME_SUBOUTPUT",
  "KODE_KOMPONEN", "KODE_SUBKOMPONEN", "URAIAN_SUBKOMPONEN", "KODE_AKUN", "KODE_JENIS_BEBAN", "KODE_CARA_TARIK", "KODE_JENIS_BANTUAN", "KODE_REGISTER",
  "HEADER1", "HEADER2", "KODE_ITEM", "NOMOR_ITEM", "CONS_ITEM", "URAIAN_ITEM", "SUMBER_DANA",
  "VOL_KEG_1", "SAT_KEG_1", "VOL_KEG_2", "SAT_KEG_2", "VOL_KEG_3", "SAT_KEG_3", "VOL_KEG_4", "SAT_KEG_4",
  "VOLKEG", "SATKEG", "HARGASAT", "TOTAL", "KODE_BLOKIR", "NILAI_BLOKIR", "KODE_STS_HISTORY",
  ...Array.from({ length: 12 }, (_, i) => `POK_NILAI_${i + 1}`)
] as const;

export interface DetailItem {
  satker: string;
  activity: string; output: string; suboutput: string; component: string; subcomponent: string; subcomponentName: string;
  account: string;
  description: string;
  cons: string;
  quantity: number;
  unit: string;
  price: number;
  blokir?: { code: string; amount: number };
  /** Kunci stabil untuk menerapkan perubahan revisi pada item yang sama. */
  ref: string;
}

interface Group { activity: string; output: string; suboutput: string; component: string; subcomponent: string; subcomponentName: string }
const G = {
  office: { activity: "4891", output: "EBA", suboutput: "962", component: "001", subcomponent: "A", subcomponentName: "Layanan perkantoran" },
  travel: { activity: "4892", output: "EBB", suboutput: "951", component: "002", subcomponent: "B", subcomponentName: "Perjalanan dinas" },
  program: { activity: "4893", output: "ABC", suboutput: "001", component: "051", subcomponent: "C", subcomponentName: "Pelaksanaan kegiatan" },
  asset: { activity: "4894", output: "RBA", suboutput: "002", component: "052", subcomponent: "D", subcomponentName: "Sarana dan aplikasi" }
} satisfies Record<string, Group>;

interface Template { key: string; group: Group; account: string; description: string; unit: string; price: number; quantity: number }
const TEMPLATES: Template[] = [
  { key: "t01", group: G.office, account: "521211", description: "Penggandaan dokumen dan fotokopi", unit: "lembar", price: 250, quantity: 20000 },
  { key: "t02", group: G.office, account: "521811", description: "Konsumsi rapat koordinasi", unit: "orang", price: 85000, quantity: 300 },
  { key: "t03", group: G.travel, account: "524111", description: "Uang harian perjalanan dinas dalam negeri", unit: "OH", price: 450000, quantity: 120 },
  { key: "t04", group: G.travel, account: "524111", description: "Tiket pesawat perjalanan dinas", unit: "PP", price: 3200000, quantity: 40 },
  { key: "t05", group: G.travel, account: "524111", description: "Penginapan perjalanan dinas", unit: "OH", price: 900000, quantity: 100 },
  { key: "t06", group: G.program, account: "521213", description: "Honorarium narasumber", unit: "OJ", price: 1700000, quantity: 24 },
  { key: "t07", group: G.office, account: "521211", description: "Belanja ATK kegiatan", unit: "paket", price: 12000000, quantity: 1 },
  { key: "t08", group: G.office, account: "522111", description: "Langganan listrik kantor", unit: "bulan", price: 18000000, quantity: 12 },
  { key: "t09", group: G.office, account: "523111", description: "Pemeliharaan gedung kantor", unit: "paket", price: 45000000, quantity: 1 },
  { key: "t10", group: G.office, account: "523121", description: "Pemeliharaan kendaraan dinas", unit: "unit", price: 7500000, quantity: 6 },
  { key: "t11", group: G.program, account: "524114", description: "Sewa ruang rapat paket meeting", unit: "orang", price: 250000, quantity: 150 },
  { key: "t12", group: G.program, account: "521211", description: "Belanja bahan pelatihan", unit: "paket", price: 9000000, quantity: 2 },
  { key: "t13", group: G.program, account: "521213", description: "Honor tim pelaksana kegiatan", unit: "OB", price: 2500000, quantity: 36 },
  { key: "t14", group: G.asset, account: "532111", description: "Pengadaan perangkat survei lapangan", unit: "unit", price: 6500000, quantity: 4 },
  { key: "t15", group: G.asset, account: "525112", description: "Pengembangan aplikasi pendukung", unit: "paket", price: 150000000, quantity: 1 }
];

export const ORGANIZATIONS = [
  { code: "90001", satker: ["900101", "900102", "900103", "900104", "900105"] },
  { code: "90002", satker: ["900201", "900202", "900203", "900204"] }
] as const;

export const SATKER_NAMES: Record<string, string> = Object.fromEntries(
  ORGANIZATIONS.flatMap((org) => org.satker.map((code, index) => [code, `Satker Fiktif ${org.code === "90001" ? "A" : "B"}${index + 1}`]))
);

type Case = Omit<DetailItem, "cons"> & { cons?: string };

function fillers(satkerIndex: number, satker: string, seqStart: number): DetailItem[] {
  return TEMPLATES.map((template, index) => {
    const spread = ((satkerIndex * 7 + index * 3) % 9) - 4; // -4..4 → ±8%
    let price = Math.round(template.price * (1 + spread * 0.02) / 50) * 50;
    if (template.key === "t06" && satker === "900105") price = 4_000_000; // pencilan harga vs Satker lain
    if (template.key === "t03" && satker === "900104") price = 900_000; // pencilan; diturunkan di revisi
    return {
      satker, ...template.group, account: template.account, description: template.description,
      cons: `${satker.slice(-3)}${String(seqStart + index).padStart(4, "0")}`, quantity: template.quantity + ((satkerIndex + index) % 5), unit: template.unit, price,
      ref: `${satker}:${template.key}`
    };
  });
}

function caseItem(item: Case, seq: number): DetailItem {
  return { ...item, cons: item.cons ?? `${item.satker.slice(-3)}${String(seq).padStart(4, "0")}` };
}

export interface RuleCase { rule: string; satker: string; description: string; account: string; expectation: string }
export interface Manifest {
  fiscalYear: number;
  /** Selisih yang diharapkan saat revisi diimpor setelah awal, per eselon I. */
  expectedDiff: Record<string, { baru: number; berubah: number; tetap: number; hilang: number }>;
  /** Item yang harus ter-flag oleh aturan tersebut di snapshot awal (R08: di revisi). */
  ruleCases: RuleCase[];
}

export function buildDetails() {
  const awal: Record<string, DetailItem[]> = { "90001": [], "90002": [] };

  ORGANIZATIONS.forEach((org) => org.satker.forEach((satker, satkerIndex) => awal[org.code].push(...fillers(satkerIndex, satker, 1))));

  // Uraian kembar di subkomponen yang sama: dibedakan oleh urutan kemunculan pada item_key.
  awal["90001"].push(caseItem({ satker: "900101", ...G.program, account: "521213", description: "Honorarium narasumber", quantity: 6, unit: "OJ", price: 1_750_000, ref: "900101:t06-dup" }, 50));

  const cases90001: Case[] = [
    { satker: "900101", ...G.office, account: "521211", description: "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus", quantity: 120, unit: "buah", price: 150_000, ref: "c1-r01" },
    { satker: "900102", ...G.office, account: "521213", description: "Honor satpam dan pengemudi kantor", quantity: 12, unit: "bulan", price: 3_500_000, ref: "c2-r02" },
    { satker: "900103", ...G.office, account: "522191", description: "Jasa kebersihan kantor (cleaning service)", quantity: 12, unit: "bulan", price: 4_200_000, ref: "c3-r02" },
    { satker: "900101", ...G.office, account: "522191", description: "Langganan internet kantor", quantity: 12, unit: "bulan", price: 2_750_000, ref: "c4-r03" },
    { satker: "900104", ...G.office, account: "521111", description: "Cetak kop surat dan amplop dinas", quantity: 1000, unit: "lembar", price: 3_500, ref: "c5-r04" },
    { satker: "900105", ...G.asset, account: "533111", description: "Rehabilitasi masjid binaan desa", quantity: 1, unit: "paket", price: 850_000_000, ref: "c6-r05" },
    { satker: "900102", ...G.asset, account: "521211", description: "Pengadaan laptop untuk staf", quantity: 5, unit: "unit", price: 15_000_000, ref: "c7-r06" },
    { satker: "900102", ...G.asset, account: "521211", description: "Pemeliharaan laptop dan printer", quantity: 4, unit: "unit", price: 1_200_000, ref: "c7b-bukan-r06" },
    { satker: "900103", ...G.program, account: "521211", description: "Biaya koordinasi lain-lain", quantity: 0, unit: "paket", price: 25_000_000, ref: "c8-r07" },
    { satker: "900104", ...G.travel, account: "524111", description: "Perjalanan dinas koordinasi pusat daerah", quantity: 10, unit: "OK", price: 4_500_000, blokir: { code: "A", amount: 45_000_000 }, ref: "c9-r08-awal" },
    { satker: "900105", ...G.program, account: "524114", description: "Paket meeting evaluasi kinerja", quantity: 50, unit: "orang", price: 300_000, ref: "c10-r08-revisi" }
  ];
  cases90001.forEach((item, index) => awal["90001"].push(caseItem(item, 60 + index)));

  const cases90002: Case[] = [
    { satker: "900201", ...G.office, account: "521119", description: "Jasa pengemudi kendaraan dinas", quantity: 12, unit: "bulan", price: 3_400_000, ref: "d1-r02" },
    { satker: "900202", ...G.office, account: "522191", description: "Paket data internet untuk operasional kantor", quantity: 12, unit: "bulan", price: 1_500_000, ref: "d2-r03" },
    { satker: "900203", ...G.asset, account: "521211", description: "Pengadaan komputer PC desktop", quantity: 8, unit: "unit", price: 12_000_000, ref: "d3-r06" },
    { satker: "900204", ...G.program, account: "521211", description: "Alokasi kegiatan penunjang", quantity: 0, unit: "paket", price: 60_000_000, ref: "d4-r07" },
    { satker: "900201", ...G.office, account: "521211", description: "Seragam batik hari bakti", quantity: 60, unit: "buah", price: 275_000, ref: "d5-r01" }
  ];
  cases90002.forEach((item, index) => awal["90002"].push(caseItem(item, 60 + index)));

  const revisi: Record<string, DetailItem[]> = { "90001": [], "90002": [] };
  const clone = (item: DetailItem): DetailItem => ({ ...item, blokir: item.blokir ? { ...item.blokir } : undefined });

  // ---- Revisi eselon I 90001
  const removed1 = new Set(["c1-r01", "900103:t12", "900105:t14"]);
  for (const original of awal["90001"]) {
    if (removed1.has(original.ref)) continue;
    const item = clone(original);
    switch (item.ref) {
      case "c2-r02": item.account = "521111"; break; // diperbaiki
      case "c5-r04": item.account = "521211"; break; // diperbaiki
      case "c7-r06": item.account = "532111"; break; // diperbaiki
      case "c8-r07": item.quantity = 1; break; // dirinci
      case "c9-r08-awal": item.blokir = undefined; item.price = 3_800_000; break;
      case "c10-r08-revisi": item.blokir = { code: "2", amount: 15_000_000 }; break;
      case "900101:t07": item.description = "Belanja alat tulis kantor kegiatan"; item.price = Math.round(item.price * 1.05); break; // cocok lewat CONS_ITEM
      case "900104:t03": item.price = 450_000; break; // diturunkan
    }
    revisi["90001"].push(item);
  }
  revisi["90001"].push(
    caseItem({ satker: "900102", ...G.asset, account: "532111", description: "Pengadaan perangkat lunak analisis", quantity: 1, unit: "paket", price: 35_000_000, ref: "n1" }, 90),
    caseItem({ satker: "900104", ...G.office, account: "521811", description: "Konsumsi rapat tambahan", quantity: 80, unit: "orang", price: 90_000, ref: "n2" }, 91)
  );

  // ---- Revisi eselon I 90002
  const removed2 = new Set(["d5-r01", "900202:t09"]);
  for (const original of awal["90002"]) {
    if (removed2.has(original.ref)) continue;
    const item = clone(original);
    if (item.ref === "d1-r02") item.account = "521111";
    if (item.ref === "900201:t07") item.price = Math.round(item.price * 0.95);
    revisi["90002"].push(item);
  }
  revisi["90002"].push(caseItem({ satker: "900203", ...G.program, account: "521213", description: "Honorarium tim penyusun laporan", quantity: 10, unit: "OB", price: 2_000_000, ref: "n3" }, 92));

  const manifest: Manifest = {
    fiscalYear: FISCAL_YEAR,
    expectedDiff: {
      "90001": { baru: 2, berubah: 7, tetap: 77, hilang: 3 },
      "90002": { baru: 1, berubah: 2, tetap: 61, hilang: 2 }
    },
    ruleCases: [
      { rule: "R01", satker: "900101", description: "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus", account: "521211", expectation: "hapus_item" },
      { rule: "R01", satker: "900201", description: "Seragam batik hari bakti", account: "521211", expectation: "hapus_item" },
      { rule: "R02", satker: "900102", description: "Honor satpam dan pengemudi kantor", account: "521213", expectation: "ganti_akun 521111" },
      { rule: "R02", satker: "900103", description: "Jasa kebersihan kantor (cleaning service)", account: "522191", expectation: "ganti_akun 521111" },
      { rule: "R02", satker: "900201", description: "Jasa pengemudi kendaraan dinas", account: "521119", expectation: "ganti_akun 521111" },
      { rule: "R03", satker: "900101", description: "Langganan internet kantor", account: "522191", expectation: "ganti_akun 521111" },
      { rule: "R03", satker: "900202", description: "Paket data internet untuk operasional kantor", account: "522191", expectation: "ganti_akun 521111" },
      { rule: "R04", satker: "900104", description: "Cetak kop surat dan amplop dinas", account: "521111", expectation: "ganti_akun 521211" },
      { rule: "R05", satker: "900105", description: "Rehabilitasi masjid binaan desa", account: "533111", expectation: "ganti_akun 526113" },
      { rule: "R06", satker: "900102", description: "Pengadaan laptop untuk staf", account: "521211", expectation: "ganti_akun 532111" },
      { rule: "R06", satker: "900203", description: "Pengadaan komputer PC desktop", account: "521211", expectation: "ganti_akun 532111" },
      { rule: "R07", satker: "900103", description: "Biaya koordinasi lain-lain", account: "521211", expectation: "rinci_item" },
      { rule: "R07", satker: "900204", description: "Alokasi kegiatan penunjang", account: "521211", expectation: "rinci_item" },
      { rule: "R08", satker: "900105", description: "Paket meeting evaluasi kinerja", account: "524114", expectation: "manual (di snapshot revisi)" },
      { rule: "R08", satker: "900104", description: "Perjalanan dinas koordinasi pusat daerah", account: "524111", expectation: "manual (padanan di awal berblokir)" }
    ]
  };
  return { awal, revisi, manifest };
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Menulis baris detail + baris judul kelompok (HEADER1 / HEADER2) seperti ekspor SIPEKA. */
export function toCsv(orgCode: string, items: DetailItem[]) {
  const lines = [CSV_COLUMNS.join(",")];
  const row = (values: Record<string, string | number>) => lines.push(CSV_COLUMNS.map((column) => csvCell(values[column] ?? "")).join(","));
  const common = (item: DetailItem) => ({
    TAHUN: FISCAL_YEAR, BAES1: orgCode, KDSATKER: item.satker, KODE_PROGRAM: "WA", KODE_KEGIATAN: item.activity, KODE_OUTPUT: item.output,
    KODE_SUBOUTPUT: item.suboutput, KODE_KOMPONEN: item.component, KODE_SUBKOMPONEN: item.subcomponent, URAIAN_SUBKOMPONEN: item.subcomponentName
  });

  const bySatker = new Map<string, DetailItem[]>();
  for (const item of items) bySatker.set(item.satker, [...(bySatker.get(item.satker) ?? []), item]);
  let id = 1;
  for (const [, satkerItems] of [...bySatker].sort(([a], [b]) => a.localeCompare(b))) {
    const subcomponents = [...new Set(satkerItems.map((item) => item.component))].sort();
    for (const component of subcomponents) {
      const inComponent = satkerItems.filter((item) => item.component === component);
      row({ ID: id++, ...common(inComponent[0]), KODE_AKUN: "", HEADER1: 1, HEADER2: 0, URAIAN_ITEM: inComponent[0].subcomponentName.toUpperCase(), VOLKEG: 0, HARGASAT: 0, TOTAL: 0 });
      let nomor = 0;
      for (const account of [...new Set(inComponent.map((item) => item.account))].sort()) {
        row({ ID: id++, ...common(inComponent[0]), KODE_AKUN: account, HEADER1: 0, HEADER2: 1, URAIAN_ITEM: `Akun ${account}`, VOLKEG: 0, HARGASAT: 0, TOTAL: 0 });
        for (const item of inComponent.filter((entry) => entry.account === account)) {
          nomor++;
          row({
            ID: id++, ...common(item), KODE_AKUN: item.account, HEADER1: 0, HEADER2: 0, KODE_ITEM: String(nomor).padStart(3, "0"), NOMOR_ITEM: nomor, CONS_ITEM: item.cons,
            URAIAN_ITEM: item.description, SUMBER_DANA: "A", VOL_KEG_1: item.quantity, SAT_KEG_1: item.unit, VOLKEG: item.quantity, SATKEG: item.unit,
            HARGASAT: item.price, TOTAL: item.quantity === 0 ? item.price : Math.round(item.quantity * item.price) /* volume 0 tetapi ada nilai: kasus R07 */, KODE_BLOKIR: item.blokir?.code ?? "", NILAI_BLOKIR: item.blokir?.amount ?? 0, KODE_STS_HISTORY: "B00"
          });
        }
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export function buildFixtureFiles() {
  const { awal, revisi, manifest } = buildDetails();
  const files: Record<string, string> = {};
  for (const org of ORGANIZATIONS) {
    files[`awal/es1_${org.code}_${FISCAL_YEAR}.csv`] = toCsv(org.code, awal[org.code]);
    files[`revisi/es1_${org.code}_${FISCAL_YEAR}.csv`] = toCsv(org.code, revisi[org.code]);
  }
  files["satker.json"] = `${JSON.stringify(SATKER_NAMES, null, 2)}\n`;
  files["manifest.json"] = `${JSON.stringify(manifest, null, 2)}\n`;
  return files;
}
