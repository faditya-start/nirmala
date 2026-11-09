# Model Data MVP

Status: **dikunci untuk MVP** · 9 Nov 2026
Terkait: [mvp-scope.md](mvp-scope.md) · [data-analysis.md](data-analysis.md) · [rule-catalog.md](rule-catalog.md)

## 1. Prinsip

- **SQLite + Drizzle.** `apps/api/src/db/schema.ts` menjadi satu-satunya sumber skema. Migrasi dibuat dengan `drizzle-kit generate`. Raw SQL dan `ensureColumn` di `store.ts` dihapus.
- **Perubahan seminimal mungkin.** Tabel yang sudah ada dipertahankan namanya jika maknanya tetap; yang berubah hanya kolomnya.
- **Satu sumber status:** `chr_notes.status`. Item dan dokumen tidak menyimpan status tindak lanjut sendiri.
- **Riwayat tidak dihapus:**
  - snapshot, assessment, versi CHR, cek tindak lanjut, dan audit log hanya ditambah
  - `audit_logs` dijaga trigger SQLite yang menolak `UPDATE` / `DELETE`
- **Data demo lama dibuang.** Semua data sekarang sintetis, jadi migrasi = skema baru + `db:seed` ulang dari CSV sintetis. Tidak ada migrasi data baris per baris.
- **Uang** disimpan sebagai `integer` rupiah. **Waktu** disimpan sebagai `integer` ms (seperti sekarang). JSON disimpan sebagai `text` dengan mode `json` di Drizzle.

## 2. Diagram entitas

```
organization_units (eselon I) 1─* work_units (Satker)
        │                                 │
review_cycles 1─* rka_documents (snapshot per eselon I) 1─* rka_items *─1 work_units
                                                │
                       rka_items 1─* rule_hits *─1 rules
                       rka_items 1─* risk_assessments *─1 risk_config
                       rka_items 1─0..1 reviewer_decisions
                       rka_items 0..1─1 rka_items (previous_item_id: padanan di snapshot sebelumnya)

review_cycles 1─* chr_documents (per eselon I) 1─* chr_notes *─0..1 rka_items
                         │                          │
                    chr_versions              follow_up_checks *─1 rka_documents (snapshot yang dicek)

users 1─* user_scopes *─1 organization_units
audit_logs (append-only) · accounts (r_akun) · satker_finding_stats (dari PTL) · public_metrics
```

## 3. Tabel

Penanda status tabel:
- **TETAP**: tidak berubah
- **UBAH**: kolom berubah
- **BARU**: tabel baru
- **HAPUS**: dibuang

### Organisasi & akses

| Tabel | Status | Kolom utama |
|---|---|---|
| `users` | UBAH | `role` ∈ `reviewer`, `uki`, `leader` (Pimpinan), `admin` (tambah `uki`) |
| `sessions` | TETAP | |
| `user_scopes` | BARU | `user_id`, `organization_unit_id` (PK gabungan). Reviewer dan UKI hanya melihat eselon I di tabel ini; `leader` dan `admin` melihat semua |
| `organization_units` | UBAH | Makna = **eselon I**. `code` = BAES1 (mis. `14504`), `short_name` (DJBM), `name` |
| `work_units` | UBAH | Makna = **Satker**. `code` = KDSATKER (6 digit), `name`, `organization_unit_id` |
| `accounts` | BARU | `code` (6 digit), `name`. Seed dari daftar akun BAS (`r_akun`); daftar akun adalah referensi publik |

### Siklus & data anggaran

| Tabel | Status | Kolom utama |
|---|---|---|
| `review_cycles` | BARU | `fiscal_year`, `stage` (`pagu` / `alokasi`), `name`, `adk_deadline`, `dipa_issued_at?`, `status` (`aktif` / `selesai`) |
| `rka_documents` | UBAH | Makna = **snapshot** per eselon I per siklus. `cycle_id`, `organization_unit_id`, `version_no` (ganti nama dari `revision_number`), `label` (`Awal` / `Revisi`), `source_file_name`, `file_hash` (UNIQUE → idempoten), `row_count`, `header_rows_skipped`, `imported_by`, `imported_at`, `diff_summary` (json: baru / berubah / tetap / hilang). **Hapus** `work_unit_id` (satu CSV berisi banyak Satker) dan `status` |
| `rka_items` | UBAH | Lihat di bawah |

Kolom `rka_items`:

| Kelompok | Kolom |
|---|---|
| Relasi | `document_id`, `work_unit_id` |
| Hierarki | `program_code`, `activity_code`, `output_code`, `suboutput_code`, `component_code`, `subcomponent_code`, `subcomponent_name` |
| Akun | `account_code` (ganti nama dari `bas_code`) |
| Item | `description` (URAIAN_ITEM), `cons_item`, `nomor_item` |
| Nilai | `quantity` (VOLKEG), `unit` (SATKEG), `unit_price` (HARGASAT), `total_amount` (TOTAL), `volume_detail` (json: VOL_KEG_1..4 + satuan) |
| Blokir | `blokir_code`, `blokir_amount` |
| Kunci | `item_key`, `sipeka_id_item?` |
| Diff | `change_type` (`baru` / `berubah` / `tetap`), `previous_item_id?` |
| Dihapus | `program`, `activity` (teks), `evaluation_status` |
| Index | (`document_id`, `item_key`) UNIQUE · `work_unit_id` · `account_code` |

### Deteksi

| Tabel | Status | Kolom utama |
|---|---|---|
| `rules` | BARU | `code` (R01…), `name`, `category` (`EFISIENSI` / `SATUAN_BIAYA` / `AKUN` / `LAINNYA`), `kind` (`keyword` / `keyword_wrong_account` / `value_check` / `blokir_history`), `params` (json), `reason_template`, `source`, `default_expectation` (json), `active`, `valid_year?`, `validation_note`, `updated_at` |
| `rule_hits` | BARU | `rka_item_id`, `rule_id`, `reason` (teks yang sudah dirender), `created_at`. UNIQUE (`rka_item_id`, `rule_id`) |
| `risk_config` | UBAH (pindah ke Drizzle) | `version`, `weights` (json, F1–F5), `thresholds` (json), `params` (json: daftar akun rawan, ambang paket, ambang peer), `created_by`, `created_at`. Hanya insert; konfigurasi aktif = yang terbaru |
| `risk_assessments` | UBAH | `rka_item_id`, `risk_config_id`, `score`, `category`, `factors` (json: per faktor nilai / bobot / kontribusi / penjelasan / dataAvailable), `peer_stats` (json: median, n Satker, rasio), `data_completeness`, `assessed_at`. UNIQUE (`rka_item_id`, `risk_config_id`); ganti dari UNIQUE (`rka_item_id`) |
| `satker_finding_stats` | BARU (ganti `historical_findings`) | `work_unit_code`, `theme` (`penganggaran` / `perjalanan_dinas` / `honorarium` / `paket_meeting` / `klasifikasi_belanja`), `count_total`, `count_open` (BS + BT), `latest_year`. Dibangkitkan dari PTL secara lokal; versi sintetis untuk seed |
| `price_references` | HAPUS | Diganti perbandingan antar-Satker (`peer_stats`). Tabel SBM masuk backlog |

### Keputusan, CHR, tindak lanjut

| Tabel | Status | Kolom utama |
|---|---|---|
| `reviewer_decisions` | UBAH | `rka_item_id`, `reviewer_user_id`, `decision` (`confirm` / `dismiss`), `reason_category` (wajib untuk dismiss), `note`, `created_at`. UNIQUE per item |
| `dismiss_reasons` | BARU | `code`, `label`, `active`. Seed: harga wajar karena lokasi, akun sudah tepat, sudah ada dasar hukum, item esensial untuk fungsi utama, data tidak lengkap / salah impor, lainnya |
| `chr_documents` | UBAH | Makna = **CHR per eselon I per tahap**. `cycle_id`, `organization_unit_id`, `document_number?`, `status` (`draft` / `issued` / `completed`), `recommendation`, `unit_response` (tanggapan eselon I), `created_by`, `issued_at?`, `completed_at?`, `updated_at`. UNIQUE (`cycle_id`, `organization_unit_id`). **Hapus** `rka_item_id`, `title`, `findings` |
| `chr_notes` | BARU (isi lama `chr_documents` per item pindah ke sini) | `chr_document_id`, `rka_item_id?`, `item_key?`, `work_unit_id?`, `rule_id?`, `category`, `text`, `expectation` (json), `status` (`draf` / `menunggu_revisi` / `perlu_verifikasi` / `dijustifikasi` / `closed`), `justification?`, `justified_by?`, `closed_by?`, `closed_at?`, `created_by`, `created_at`, `updated_at` |
| `chr_versions` | UBAH | `chr_id`, `version_number`, `snapshot` (json: dokumen + semua catatan saat itu), `reason` (`terbit` / `adendum`), `created_by`, `created_at` |
| `follow_up_checks` | BARU (ganti 3 tabel) | `note_id`, `document_id` (snapshot yang dicek), `matched_item_id?`, `result` (`terpenuhi` / `belum_terpenuhi` / `data_tidak_cukup` / `item_tidak_ditemukan`), `evidence` (json: field → sebelum / sesudah), `checked_at`, `reviewer_action?` (`setujui` / `kembalikan`), `reviewer_note?`, `reviewed_by?`, `reviewed_at?` |
| `follow_up_tasks`, `rka_revisions`, `tracker_checks` | HAPUS | Status pindah ke `chr_notes`; revisi masuk lewat snapshot |
| `integration_logs` | HAPUS | Sync SAKTI dibuang |

### Lain-lain

| Tabel | Status | Kolom utama |
|---|---|---|
| `audit_logs` | UBAH | + `before` (json?), `after` (json?). Trigger `BEFORE UPDATE` / `BEFORE DELETE` → `RAISE(ABORT)` |
| `public_metrics` | BARU | `cycle_id`, `organization_unit_label` (eselon I atau "Lainnya"), `category`, `notes_total`, `closed_before_deadline`, `median_days_to_close`, `generated_at`. Diisi ulang saat siklus ditandai DIPA terbit. Endpoint publik hanya membaca tabel ini |

## 4. Pencocokan item antar-snapshot

Pencocokan dijalankan saat snapshot v(n) diimpor, terhadap snapshot v(n−1) eselon I yang sama di siklus yang sama.

1. **Normalisasi uraian:** huruf kecil, spasi rapat, trim.
2. **`item_key`** = `KDSATKER|PROGRAM|KEGIATAN|OUTPUT|SUBOUTPUT|KOMPONEN|SUBKOMPONEN|uraian_norm|n`, dengan `n` = urutan kemunculan untuk uraian kembar dalam subkomponen yang sama.
   - Akun sengaja **tidak** dimasukkan, supaya item yang akunnya diperbaiki tetap dikenali sebagai item yang sama.
3. **Langkah 1:** cocokkan berdasarkan `item_key`.
4. **Langkah 2:** item yang belum cocok dicoba dengan `KDSATKER|…|SUBKOMPONEN|AKUN|CONS_ITEM`.
5. Cocok → `previous_item_id` diisi. `change_type` = `tetap` jika akun, volume, satuan, harga, dan total sama; selain itu `berubah`. Tidak cocok → `baru`.
6. Item v(n−1) yang tidak punya pasangan → dihitung sebagai **hilang** di `diff_summary`. Catatan yang merujuk item itu dicek dengan hasil `item_tidak_ditemukan`.

Dasar pilihan ini ada di [data-analysis.md](data-analysis.md) §2.3. Hierarki + uraian unik untuk 94% item. `CONS_ITEM` sebagai cadangan cocok dengan uraian yang sama di 89% kasus.

## 5. Bentuk JSON

**Ekspektasi (`chr_notes.expectation`)**, divalidasi zod di `packages/shared`:

```ts
type Expectation =
  | { type: "ganti_akun"; to: string }                        // kode akun 6 digit
  | { type: "hapus_item" }
  | { type: "turunkan_nilai"; maxUnitPrice?: number; maxTotal?: number }
  | { type: "rinci_item" }
  | { type: "manual"; instruction: string };
```

**Faktor (`risk_assessments.factors`):** sama dengan `RiskFactorResult[]` di `apps/api/src/services/riskScoring.ts`, dengan kode faktor baru `price_vs_peer`, `risky_account`, `satker_history`, `description_quality`, `change_from_previous`.

**Bukti cek (`follow_up_checks.evidence`):**

```ts
{ fields: { field: "account_code" | "unit_price" | "total_amount" | "quantity" | "unit" | "description"; before: string | number | null; after: string | number | null }[]; note?: string }
```

## 6. Nilai turunan (dihitung, tidak disimpan)

| Nilai | Definisi |
|---|---|
| Status keputusan item | Ada `reviewer_decisions` → confirm / dismiss; tidak ada → belum ditinjau |
| Satker **siap diajukan** (per siklus) | Satker punya ≥1 catatan di CHR terbit siklus itu **dan** semua catatannya `closed`. Satker tanpa catatan ditampilkan "tidak ada catatan" |
| CHR **selesai** | Semua catatan `closed`. `chr_documents.status` diubah ke `completed` dalam transaksi yang sama dengan penutupan catatan terakhir |
| Terakhir bergerak (S10) | Waktu terbaru dari perubahan status catatan, justifikasi, atau impor snapshot Satker itu |

## 7. Pemetaan dari skema sekarang

| Sekarang | MVP |
|---|---|
| `users`, `sessions` | sama, + role `uki`, + `user_scopes` |
| `organization_units`, `work_units` | sama, maknanya diperjelas (eselon I / Satker), kode mengikuti SIPEKA |
| `rka_documents` (per Satker, `revision_number`) | snapshot per eselon I per siklus |
| `rka_items` (`bas_code`, `program`, `activity`, `evaluation_status`) | kolom SIPEKA + `item_key` + diff; status dihapus |
| `price_references` | dihapus → `peer_stats` |
| `risk_config` (raw SQL) | Drizzle, + `params` |
| `risk_assessments` (UNIQUE per item) | per item × config, + `factors` json |
| `historical_findings` (per item) | `satker_finding_stats` (per Satker) |
| `reviewer_decisions` (`confirmed` / `false_positive`, alasan teks) | `confirm` / `dismiss` + `reason_category` |
| `chr_documents` (per item) + `chr_versions` | `chr_documents` per eselon I + `chr_notes` + `chr_versions` (snapshot json) |
| `follow_up_tasks`, `rka_revisions`, `tracker_checks` | `follow_up_checks` |
| `integration_logs` | dihapus |
| `audit_logs` | + before / after, append-only |
| konstanta `publicData.ts` | `public_metrics` |
