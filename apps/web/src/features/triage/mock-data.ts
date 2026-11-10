/**
 * Data sintetis untuk mock Risk Triage (hanya dimuat lewat mock.ts saat VITE_MOCK=1).
 * Semua nama, uraian, dan angka rekaan. Item dibangkitkan deterministik dari indeks, jadi daftar ribuan
 * item tidak perlu disimpan sebagai berkas besar dan detail tiap item stabil antar muat ulang.
 */
import type {
  ChangeType,
  Expectation,
  FactorCode,
  FindingTheme,
  HierarchyLevelDto,
  NoteCategory,
  OrganizationUnitDto,
  PeerComparisonDto,
  PreviousVersionDto,
  RiskCategory,
  WorkUnitDto
} from "@nirmala/shared";
import { FACTOR_CODES, FACTOR_KEYS, FINDING_THEMES } from "@nirmala/shared";

export const CYCLE_FACTOR_WEIGHTS = [30, 20, 20, 15, 15] as const;
export const RISK_THRESHOLDS = { medium: 35, high: 70 };

export const ORGS: Array<OrganizationUnitDto & { snapshotNo: number; snapshotLabel: string; itemCount: number; flagEvery: number | null }> = [
  { id: "oa", code: "A1", shortName: "Ditjen Contoh A", name: "Direktorat Jenderal Contoh A", snapshotNo: 2, snapshotLabel: "Revisi", itemCount: 12702, flagEvery: 126 },
  { id: "ob", code: "B1", shortName: "Ditjen Contoh B", name: "Direktorat Jenderal Contoh B", snapshotNo: 2, snapshotLabel: "Revisi", itemCount: 5410, flagEvery: 97 },
  { id: "oc", code: "C1", shortName: "Ditjen Contoh C", name: "Direktorat Jenderal Contoh C", snapshotNo: 1, snapshotLabel: "Awal", itemCount: 3098, flagEvery: null }
];

export const WORK_UNITS: WorkUnitDto[] = [
  ...[1, 2, 3, 4, 5].map((n) => ({ id: `wa${n}`, code: `63000${n}`, name: `Satker Contoh ${String(n).padStart(2, "0")}`, organizationUnitId: "oa" })),
  ...[11, 12, 13, 14].map((n) => ({ id: `wb${n}`, code: `64${String(n).padStart(4, "0")}`, name: `Satker Contoh ${n}`, organizationUnitId: "ob" })),
  ...[21, 22, 23].map((n) => ({ id: `wc${n}`, code: `65${String(n).padStart(4, "0")}`, name: `Satker Contoh ${n}`, organizationUnitId: "oc" }))
];

/** Satker tanpa profil temuan BPK: faktor F3 "Data tidak tersedia". */
const NO_PROFILE = new Set(["wa5", "wb14"]);

export const ACCOUNTS = [
  ["511111", "Belanja Gaji Pokok PNS"],
  ["521111", "Belanja Keperluan Perkantoran"],
  ["521113", "Belanja Penambah Daya Tahan Tubuh"],
  ["521115", "Belanja Honor Operasional Satuan Kerja"],
  ["521119", "Belanja Barang Operasional Lainnya"],
  ["521211", "Belanja Bahan"],
  ["521213", "Belanja Honor Output Kegiatan"],
  ["521219", "Belanja Barang Non Operasional Lainnya"],
  ["522111", "Belanja Langganan Listrik"],
  ["522112", "Belanja Langganan Telepon"],
  ["522191", "Belanja Jasa Lainnya"],
  ["522151", "Belanja Jasa Profesi"],
  ["523111", "Belanja Biaya Pemeliharaan Gedung dan Bangunan"],
  ["523121", "Belanja Biaya Pemeliharaan Peralatan dan Mesin"],
  ["524111", "Belanja Perjalanan Dinas Biasa"],
  ["524113", "Belanja Perjalanan Dinas Dalam Kota"],
  ["532111", "Belanja Modal Peralatan dan Mesin"],
  ["533111", "Belanja Modal Gedung dan Bangunan"],
  ["537112", "Belanja Modal Lainnya"]
].map(([code, name]) => ({ code, name }));

export const DISMISS_REASONS = [
  { code: "harga_wajar_lokasi", label: "Harga wajar karena lokasi" },
  { code: "akun_sudah_tepat", label: "Akun sudah tepat" },
  { code: "ada_dasar_hukum", label: "Sudah ada dasar hukum" },
  { code: "item_esensial", label: "Item esensial untuk fungsi utama" },
  { code: "data_tidak_lengkap", label: "Data tidak lengkap / salah impor" },
  { code: "lainnya", label: "Lainnya" }
];

// ------------------------------------------------------------------ Aturan

export interface MockRule {
  code: string;
  name: string;
  category: NoteCategory;
  reason: string;
  source: string;
  defaultExpectation: Expectation | null;
}

export const RULES: Record<string, MockRule> = {
  R01: {
    code: "R01",
    name: "Pakaian / seragam hari besar",
    category: "EFISIENSI",
    reason: "Alokasi pakaian hari besar tidak memiliki standar penetapan biaya dan tidak esensial dalam mendukung fungsi utama.",
    source: "8 catatan inefisiensi eselon I sebelumnya; rujukan PMK SBM TA 2026",
    defaultExpectation: { type: "hapus_item" }
  },
  R02: {
    code: "R02",
    name: "Jasa outsourcing di luar akun 521111",
    category: "AKUN",
    reason: "Jasa tenaga pendukung (satpam, pengemudi, kebersihan) seharusnya dibebankan ke akun 521111, bukan akun belanja lain.",
    source: "Catatan reviu akun tahun sebelumnya; rujukan bagan akun standar",
    defaultExpectation: { type: "ganti_akun", to: "521111" }
  },
  R03: {
    code: "R03",
    name: "Langganan internet di luar akun 521111",
    category: "AKUN",
    reason: "Langganan internet dan paket data kantor dibebankan ke akun yang tidak sesuai ketentuan.",
    source: "Catatan reviu akun tahun sebelumnya",
    defaultExpectation: { type: "ganti_akun", to: "521111" }
  },
  R04: {
    code: "R04",
    name: "Cetak kop surat di akun 521111",
    category: "AKUN",
    reason: "Pencetakan kop surat dan amplop merupakan belanja bahan, bukan keperluan perkantoran.",
    source: "Catatan reviu akun tahun sebelumnya",
    defaultExpectation: { type: "ganti_akun", to: "521211" }
  },
  R05: {
    code: "R05",
    name: "Sarana untuk masyarakat di belanja modal",
    category: "AKUN",
    reason: "Rehabilitasi atau pembangunan sarana yang diserahkan kepada masyarakat tidak dapat dibebankan ke belanja modal instansi.",
    source: "Temuan BPK tahun sebelumnya; rujukan peraturan pengelolaan BMN",
    defaultExpectation: { type: "manual", instruction: "Tinjau ulang akun dan status penyerahan sarana." }
  },
  R06: {
    code: "R06",
    name: "Barang modal di akun belanja barang",
    category: "SATUAN_BIAYA",
    reason: "Nilai satuan melebihi batas kapitalisasi, sehingga perlu dicatat sebagai belanja modal.",
    source: "Rujukan PMK kapitalisasi BMN",
    defaultExpectation: { type: "ganti_akun", to: "532111" }
  },
  R07: {
    code: "R07",
    name: "Nilai tanpa volume",
    category: "EFISIENSI",
    reason: "Item memiliki nilai tetapi volume tidak terisi, sehingga kewajaran harga tidak bisa dinilai.",
    source: "Aturan kualitas data RKA",
    defaultExpectation: { type: "rinci_item" }
  },
  R08: {
    code: "R08",
    name: "Item pernah diblokir",
    category: "LAINNYA",
    reason: "Item atau padanannya pada versi sebelumnya memiliki kode blokir.",
    source: "Riwayat blokir pada snapshot sebelumnya",
    defaultExpectation: null
  }
};

// ------------------------------------------------------------------ Item

export interface MockSeed {
  id: string;
  orgId: string;
  workUnitId: string;
  index: number;
  description: string;
  accountCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  ruleCodes: string[];
  changeType: ChangeType;
  /** Skor target; faktor dibangkitkan agar jumlah terbobot sama dengan nilai ini. */
  targetScore: number;
  volumeFilled: boolean;
  blokirCode: string | null;
  /** Indeks urut di antara item kena aturan milik org (0-based), dipakai untuk menyemai keputusan awal. */
  flaggedOrdinal: number | null;
  peerRatio?: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Template {
  description: string;
  accountCode: string;
  unit: string;
  price: [number, number];
  qty: [number, number];
}

const FLAG_TEMPLATES: Record<string, Template[]> = {
  R01: [
    { description: "Kaos seragam peringatan HUT", accountCode: "521211", unit: "Pcs", price: [95000, 350000], qty: [40, 300] },
    { description: "Batik seragam hari besar nasional", accountCode: "521211", unit: "Pcs", price: [120000, 260000], qty: [30, 200] }
  ],
  R02: [
    { description: "Outsourcing jasa kebersihan", accountCode: "522191", unit: "Bulan", price: [3500000, 4800000], qty: [12, 12] },
    { description: "Jasa pengamanan satpam kantor", accountCode: "521119", unit: "Bulan", price: [3600000, 5200000], qty: [12, 24] },
    { description: "Jasa pengemudi kendaraan dinas", accountCode: "521213", unit: "Bulan", price: [3400000, 4600000], qty: [12, 12] }
  ],
  R03: [{ description: "Langganan internet kantor", accountCode: "522191", unit: "Bulan", price: [1500000, 2400000], qty: [12, 12] }],
  R04: [{ description: "Cetak kop surat dan amplop", accountCode: "521111", unit: "Rim", price: [45000, 90000], qty: [100, 400] }],
  R05: [{ description: "Rehabilitasi lapangan olahraga warga", accountCode: "532111", unit: "Paket", price: [80000000, 420000000], qty: [1, 1] }],
  R06: [
    { description: "Pengadaan laptop staf", accountCode: "521211", unit: "Unit", price: [11000000, 18000000], qty: [2, 12] },
    { description: "Pengadaan printer jaringan", accountCode: "521211", unit: "Unit", price: [10500000, 16000000], qty: [1, 6] }
  ],
  R07: [{ description: "Belanja operasional lain-lain", accountCode: "521211", unit: "Paket", price: [40000000, 120000000], qty: [1, 1] }],
  R08: [{ description: "Pengadaan peralatan studio komunikasi", accountCode: "532111", unit: "Paket", price: [60000000, 240000000], qty: [1, 1] }]
};

const PLAIN_TEMPLATES: Template[] = [
  { description: "Perjalanan dinas biasa", accountCode: "524111", unit: "OK", price: [1800000, 5200000], qty: [2, 20] },
  { description: "Makan rapat biasa", accountCode: "521211", unit: "Orang", price: [35000, 90000], qty: [20, 250] },
  { description: "Honor output kegiatan", accountCode: "521213", unit: "OK", price: [500000, 2500000], qty: [4, 40] },
  { description: "Alat tulis kantor", accountCode: "521111", unit: "Paket", price: [2500000, 18000000], qty: [1, 4] },
  { description: "Pemeliharaan peralatan kantor", accountCode: "523121", unit: "Paket", price: [4000000, 36000000], qty: [1, 3] },
  { description: "Langganan listrik gedung", accountCode: "522111", unit: "Bulan", price: [8000000, 24000000], qty: [12, 12] },
  { description: "Bahan habis pakai laboratorium", accountCode: "521211", unit: "Paket", price: [3000000, 22000000], qty: [1, 6] },
  { description: "Jasa narasumber kegiatan", accountCode: "522151", unit: "OJ", price: [900000, 2400000], qty: [2, 24] },
  { description: "Perjalanan dinas dalam kota", accountCode: "524113", unit: "OK", price: [150000, 450000], qty: [10, 120] },
  { description: "Pemeliharaan gedung kantor", accountCode: "523111", unit: "Paket", price: [12000000, 90000000], qty: [1, 2] }
];

interface HandItem extends Omit<MockSeed, "id" | "orgId" | "index" | "flaggedOrdinal" | "volumeFilled" | "blokirCode"> {
  volumeFilled?: boolean;
  blokirCode?: string | null;
}

/** Sebelas item pertama Ditjen Contoh A meniru frame Pencil (oHui1, BftML). */
const HAND_ITEMS: HandItem[] = [
  { workUnitId: "wa3", description: "Rehabilitasi stadion olahraga warga", accountCode: "532111", quantity: 1, unit: "Paket", unitPrice: 410000000, ruleCodes: ["R05"], changeType: "baru", targetScore: 78 },
  { workUnitId: "wa1", description: "Kaos seragam peringatan HUT", accountCode: "521211", quantity: 90, unit: "Pcs", unitPrice: 350000, ruleCodes: ["R01"], changeType: "baru", targetScore: 71, peerRatio: 1.9 },
  { workUnitId: "wa4", description: "Pengadaan laptop staf", accountCode: "521211", quantity: 3, unit: "Unit", unitPrice: 12000000, ruleCodes: ["R06", "R08"], changeType: "berubah", targetScore: 66, blokirCode: "BLK-02" },
  { workUnitId: "wa2", description: "Outsourcing jasa kebersihan", accountCode: "522191", quantity: 12, unit: "Bulan", unitPrice: 10500000, ruleCodes: ["R02"], changeType: "tetap", targetScore: 58 },
  { workUnitId: "wa2", description: "Belanja operasional lain-lain", accountCode: "521211", quantity: 1, unit: "Paket", unitPrice: 85000000, ruleCodes: ["R07"], changeType: "berubah", targetScore: 54, volumeFilled: false },
  { workUnitId: "wa5", description: "Langganan internet kantor", accountCode: "522191", quantity: 12, unit: "Bulan", unitPrice: 1900000, ruleCodes: ["R03"], changeType: "tetap", targetScore: 47 },
  { workUnitId: "wa1", description: "Cetak kop surat dan amplop", accountCode: "521111", quantity: 175, unit: "Rim", unitPrice: 70000, ruleCodes: ["R04"], changeType: "tetap", targetScore: 38 },
  { workUnitId: "wa5", description: "Jasa pengamanan satpam kantor", accountCode: "521119", quantity: 24, unit: "Bulan", unitPrice: 4100000, ruleCodes: ["R02"], changeType: "tetap", targetScore: 35 },
  { workUnitId: "wa2", description: "Honor output kegiatan", accountCode: "521213", quantity: 58, unit: "OK", unitPrice: 1000000, ruleCodes: [], changeType: "berubah", targetScore: 63 },
  { workUnitId: "wa1", description: "Makan rapat biasa", accountCode: "521211", quantity: 250, unit: "Orang", unitPrice: 75000, ruleCodes: [], changeType: "tetap", targetScore: 41 },
  { workUnitId: "wa2", description: "Perjalanan dinas biasa", accountCode: "524111", quantity: 10, unit: "OK", unitPrice: 2250000, ruleCodes: [], changeType: "tetap", targetScore: 22 }
];

function pick<T>(list: T[], rnd: () => number): T {
  return list[Math.floor(rnd() * list.length)];
}

function between(range: [number, number], rnd: () => number, step = 1): number {
  const value = range[0] + rnd() * (range[1] - range[0]);
  return Math.max(step, Math.round(value / step) * step);
}

export function buildSeeds(): MockSeed[] {
  const seeds: MockSeed[] = [];
  for (const [orgIndex, org] of ORGS.entries()) {
    const units = WORK_UNITS.filter((unit) => unit.organizationUnitId === org.id);
    let flaggedOrdinal = 0;
    for (let i = 0; i < org.itemCount; i += 1) {
      const id = `it-${org.id}-${String(i).padStart(5, "0")}`;
      const hand = org.id === "oa" ? HAND_ITEMS[i] : undefined;
      if (hand) {
        const flagged = hand.ruleCodes.length > 0;
        seeds.push({ ...hand, id, orgId: org.id, index: i, volumeFilled: hand.volumeFilled ?? false, blokirCode: hand.blokirCode ?? null, flaggedOrdinal: flagged ? flaggedOrdinal++ : null });
        continue;
      }
      const rnd = mulberry32(orgIndex * 1_000_003 + i * 7919 + 17);
      const flagged = org.flagEvery !== null && i % org.flagEvery === 5;
      let template: Template;
      let ruleCodes: string[] = [];
      if (flagged) {
        const codes = Object.keys(FLAG_TEMPLATES);
        const code = codes[(flaggedOrdinal + orgIndex) % codes.length];
        template = pick(FLAG_TEMPLATES[code], rnd);
        ruleCodes = code === "R06" && rnd() < 0.25 ? ["R06", "R08"] : [code];
      } else {
        template = pick(PLAIN_TEMPLATES, rnd);
      }
      const workUnitId = units[Math.floor(rnd() * units.length)].id;
      const changeRoll = rnd();
      const changeType: ChangeType = org.snapshotNo === 1 ? "baru" : changeRoll < 0.12 ? "baru" : changeRoll < 0.35 ? "berubah" : "tetap";
      const noProfile = NO_PROFILE.has(workUnitId);
      const targetCap = noProfile ? 78 : 92;
      const targetScore = flagged
        ? Math.min(targetCap, org.id === "oa" ? 10 + Math.floor(rnd() * 24) : 30 + Math.floor(rnd() * 62))
        : Math.min(targetCap, 5 + Math.floor(rnd() * rnd() * 70));
      seeds.push({
        id,
        orgId: org.id,
        workUnitId,
        index: i,
        description: template.description,
        accountCode: template.accountCode,
        quantity: between(template.qty, rnd),
        unit: template.unit,
        unitPrice: between(template.price, rnd, 1000),
        ruleCodes,
        changeType,
        targetScore,
        volumeFilled: !ruleCodes.includes("R07") && rnd() > 0.15,
        blokirCode: ruleCodes.includes("R08") ? "BLK-02" : null,
        flaggedOrdinal: flagged ? flaggedOrdinal++ : null
      });
    }
  }
  return seeds;
}

// ------------------------------------------------------------------ Skor

export interface FactorValues {
  /** null = data tidak tersedia. */
  values: Array<number | null>;
  score: number;
}

/** Bangkitkan lima nilai faktor yang jumlah terbobotnya, dibulatkan, sama dengan `target`. */
export function solveFactors(seed: MockSeed): FactorValues {
  // Item contoh di frame Pencil (BftML): 90, 70, 30, 100, 60 = 71.
  if (seed.id === "it-oa-00001") return { values: [90, 70, 30, 100, 60], score: 71 };
  const rnd = mulberry32(seed.index * 31 + seed.orgId.charCodeAt(1) * 977 + 5);
  const weights = CYCLE_FACTOR_WEIGHTS;
  const na = [false, false, NO_PROFILE.has(seed.workUnitId), false, false];
  if (seed.peerRatio === undefined && seed.targetScore <= 55 && rnd() < 0.2) na[0] = true;
  if (seed.peerRatio !== undefined) na[0] = false;
  const available = [0, 1, 2, 3, 4].filter((index) => !na[index]);
  const last = available[available.length - 1];
  const target = seed.targetScore;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const values: Array<number | null> = [null, null, null, null, null];
    let sum = 0;
    for (const index of available) {
      if (index === last) continue;
      const spread = attempt < 200 ? 40 : 90;
      const value = Math.round(Math.min(100, Math.max(0, target + (rnd() - 0.5) * 2 * spread)));
      const fixed = index === 0 && seed.peerRatio !== undefined ? Math.round(((seed.peerRatio - 0.7) / 1.6) * 100) : value;
      values[index] = fixed;
      sum += (fixed * weights[index]) / 100;
    }
    const needed = Math.round(((target - sum) * 100) / weights[last]);
    if (needed < 0 || needed > 100) continue;
    values[last] = needed;
    const total = sum + (needed * weights[last]) / 100;
    if (Math.round(total) === target) return { values, score: target };
  }
  const values: Array<number | null> = na.map((missing) => (missing ? null : target));
  return { values, score: target };
}

export function riskCategory(score: number): RiskCategory {
  return score >= RISK_THRESHOLDS.high ? "high" : score >= RISK_THRESHOLDS.medium ? "medium" : "low";
}

// ------------------------------------------------------------------ Bagian detail

export const FACTOR_LABELS: Record<FactorCode, string> = {
  price_vs_peer: "Harga vs Satker lain",
  risky_account: "Akun rawan",
  satker_history: "Riwayat temuan BPK Satker",
  description_quality: "Kualitas uraian",
  change_from_previous: "Perubahan dari versi sebelumnya"
};

export function peerFor(seed: MockSeed, factor1: number | null): PeerComparisonDto | null {
  if (factor1 === null) return null;
  const ratio = seed.peerRatio ?? Math.round((0.7 + (factor1 / 100) * 1.6) * 10) / 10;
  const median = Math.max(1000, Math.round(seed.unitPrice / ratio / 1000) * 1000);
  return {
    itemUnitPrice: seed.unitPrice,
    median: seed.peerRatio === 1.9 ? 184000 : median,
    satkerCount: 5 + (seed.index % 8),
    ratio: Math.round((seed.unitPrice / (seed.peerRatio === 1.9 ? 184000 : median)) * 10) / 10,
    min: seed.peerRatio === 1.9 ? 120000 : Math.round((median * 0.65) / 1000) * 1000,
    max: seed.peerRatio === 1.9 ? 360000 : Math.max(seed.unitPrice, Math.round((median * 1.5) / 1000) * 1000),
    unit: seed.unit,
    minSatker: 5
  };
}

export function historyFor(workUnitId: string): Array<{ theme: FindingTheme; countTotal: number; countOpen: number }> {
  if (NO_PROFILE.has(workUnitId)) return FINDING_THEMES.map((theme) => ({ theme, countTotal: 0, countOpen: 0 }));
  const rnd = mulberry32(workUnitId.split("").reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7));
  return FINDING_THEMES.map((theme, index) => {
    const countTotal = workUnitId === "wa1" ? [3, 1, 2, 0, 0][index] : Math.floor(rnd() * rnd() * 5);
    const countOpen = workUnitId === "wa1" ? [1, 0, 0, 0, 0][index] : Math.floor(rnd() * (countTotal + 1) * 0.6);
    return { theme, countTotal, countOpen };
  });
}

export function hierarchyFor(seed: MockSeed): HierarchyLevelDto[] {
  const variant = seed.index % 3;
  return [
    { level: "program", code: "099.01.WA", name: "Dukungan Manajemen" },
    { level: "activity", code: "4568", name: ["Layanan Perkantoran", "Layanan Sarana Internal", "Pembinaan Administrasi"][variant] },
    { level: "output", code: "QDB.001", name: "Layanan umum" },
    { level: "suboutput", code: "QDB.001.001", name: variant === 2 ? null : "Layanan dukungan" },
    { level: "component", code: "051", name: "Dukungan operasional" },
    { level: "subcomponent", code: "A", name: seed.ruleCodes.includes("R01") ? "Peringatan hari besar" : variant === 1 ? "Kebutuhan kantor" : null }
  ].filter((level) => level.level !== "suboutput") as HierarchyLevelDto[];
}

export function previousVersionFor(seed: MockSeed): PreviousVersionDto | null {
  const org = ORGS.find((entry) => entry.id === seed.orgId)!;
  if (org.snapshotNo === 1 || seed.changeType === "baru") return null;
  const changed = seed.changeType === "berubah";
  const beforePrice = changed ? Math.round((seed.unitPrice * 0.82) / 1000) * 1000 : seed.unitPrice;
  return {
    previousItemId: `prev-${seed.id}`,
    versionNo: org.snapshotNo - 1,
    label: "Awal",
    fields: [
      { field: "account_code", before: seed.accountCode, after: seed.accountCode, changed: false },
      { field: "unit_price", before: beforePrice, after: seed.unitPrice, changed },
      { field: "total_amount", before: beforePrice * seed.quantity, after: seed.unitPrice * seed.quantity, changed },
      { field: "quantity", before: seed.quantity, after: seed.quantity, changed: false },
      { field: "unit", before: seed.unit, after: seed.unit, changed: false },
      { field: "description", before: seed.description, after: seed.description, changed: false }
    ]
  };
}

export function explanationFor(code: FactorCode, seed: MockSeed, peer: PeerComparisonDto | null, available: boolean): string {
  switch (code) {
    case "price_vs_peer":
      return available && peer
        ? `${String(peer.ratio).replace(".", ",")}× median ${peer.satkerCount} Satker untuk uraian dan satuan yang sama.`
        : "Uraian dan satuan ini muncul di kurang dari 5 Satker pada siklus ini.";
    case "risky_account":
      return `Akun ${seed.accountCode} ${seed.accountCode === "521211" || seed.accountCode === "522191" || seed.accountCode === "521119" ? "ada" : "tidak ada"} di daftar akun rawan.`;
    case "satker_history": {
      if (!available) return "Satker ini belum punya profil temuan BPK.";
      const history = historyFor(seed.workUnitId);
      const top = history.reduce((best, entry) => (entry.countTotal > best.countTotal ? entry : best), history[0]);
      const open = history.reduce((sum, entry) => sum + entry.countOpen, 0);
      return top.countTotal === 0 ? "Tidak ada rekomendasi BPK untuk Satker ini." : `${top.countTotal} rekomendasi bertema ${top.theme.replace("_", " ")}, ${open} belum selesai.`;
    }
    case "description_quality":
      return seed.volumeFilled ? "Uraian cukup rinci." : "Rincian volume (VOL_KEG_1) tidak terisi.";
    case "change_from_previous":
      return seed.changeType === "baru" ? "Item baru di snapshot ini." : seed.changeType === "berubah" ? "Harga atau volume berubah dari versi sebelumnya." : "Tidak berubah dari versi sebelumnya.";
  }
}

export const FACTOR_META = FACTOR_CODES.map((code) => ({ code, key: FACTOR_KEYS[code], label: FACTOR_LABELS[code] }));
