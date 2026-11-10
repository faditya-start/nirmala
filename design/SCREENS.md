# Peta layar: Pencil → kode

Sumber desain: `design/nirmala.pen` (dibuka lewat Pencil MCP; jangan `Read` langsung). Ekspor offline untuk pengembangan ada di `design/export/` (tidak di-commit, bisa dibangkitkan ulang):

- `design/export/png/<nodeId>.png` — tampilan layar pada skala 1x.
- `design/export/html/<nodeId>.html` — HTML+CSS hasil ekspor Pencil: sumber nilai spasi, ukuran, warna, dan font yang persis.

Kolom **Fitur** = folder `apps/web/src/features/<fitur>/`. **Rute** = usulan; ubah bila ada alasan kuat dan catat di PR.

| Node id | Layar | Fitur | Rute |
|---|---|---|---|
| `E7nvf` | Fondasi · Token (terang) | foundation | — |
| `qRTuO` | Fondasi · Token (gelap) | foundation | — |
| `cVL6Z` | Komponen · Dasar | foundation | — |
| `UApCm` | Komponen · Dasar (gelap) | foundation | — |
| `SksK5` | Komponen · Shell | foundation | — |
| `jEe5V` | Komponen · Tambahan | foundation | — |
| `tp72L` | Komponen · Sakelar | foundation | — |
| `LQbMc` | Komponen · Status interaksi | foundation | — |
| `k2eVzx` | S1 · Login | login | `/login` |
| `G32yLt` | S1 · Login (galat) | login | `/login` |
| `czg1z` | S2 · Dashboard (reviewer) | dashboard | `/dashboard` |
| `AUOc8` | S2 · Dashboard (pimpinan) | dashboard | `/dashboard` |
| `hsNnG` | S3 · Siklus & Impor Data | impor | `/siklus` |
| `JXlM5` | S3 · Impor CSV (dialog) | impor | `/siklus` |
| `W7YQog` | S3 · Hasil impor | impor | `/siklus` |
| `a72TMw` | State · Impor berjalan (dialog) | impor | `/siklus` |
| `YBiRO` | State · File sama sudah pernah diimpor (dialog) | impor | `/siklus` |
| `ssBiO` | State · Hasil impor dengan baris galat | impor | `/siklus` |
| `TzMsS` | State · Belum ada siklus | impor | `/siklus` |
| `ptHvP` | State · Belum ada snapshot | impor | `/siklus` |
| `oHui1` | S4 · Risk Triage | triage | `/triage` |
| `r5ugKa` | State · Belum ada item kena aturan | triage | `/triage` |
| `BftML` | S5 · Detail item (konfirmasi) | triage | `/triage/:itemId` |
| `l5Oo0` | S5 · Detail item (dismiss) | triage | `/triage/:itemId` |
| `rs38h` | S5 · Detail item (setelah konfirmasi) | triage | `/triage/:itemId` |
| `AbBPt` | S6 · CHR Editor (draf) | chr | `/chr/:chrId` |
| `gjkcp` | S6 · CHR Editor (terkunci) | chr | `/chr/:chrId` |
| `G0gXnD` | S6 · Terbitkan CHR (dialog) | chr | `/chr/:chrId` |
| `Bko3K` | S7 · Cetak CHR (A4) | chr | `/chr/:chrId/cetak` |
| `X1vbk` | S8 · Smart Tracker | tracker | `/tracker` |
| `MYYQx` | S8 · Setujui massal (dialog) | tracker | `/tracker` |
| `oJHVy` | State · Tracker kosong | tracker | `/tracker` |
| `dB0Ae` | S9 · Detail catatan (reviewer) | tracker | `/tracker/:noteId` |
| `x8CopO` | S9 · Detail catatan (PIC UKI) | tracker | `/tracker/:noteId` |
| `W4pDP9` | S9 · Detail catatan (hasil cek: data tidak cukup) | tracker | `/tracker/:noteId` |
| `OTPBi` | S10 · Progres per Satker (PIC UKI) | satker | `/satker` |
| `L4cke` | S11 · Laporan | laporan | `/laporan` |
| `bOLIA` | S12a · Katalog aturan | admin | `/admin/aturan` |
| `pFsNp` | S12a · Edit aturan (panel) | admin | `/admin/aturan` |
| `Yo9Xk` | S12b · Bobot skor | admin | `/admin/bobot` |
| `xbSLr` | S12c · Pengguna | admin | `/admin/pengguna` |
| `Fa6ZU` | S12d · Siklus | admin | `/admin/siklus` |
| `l9cPH` | S12d · Tandai DIPA terbit (dialog) | admin | `/admin/siklus` |
| `e2AA59` | S12d · Buat siklus (dialog) | admin | `/admin/siklus` |
| `aISAr` | S12e · Audit log | admin | `/admin/audit` |
| `aszmF` | P1 · Beranda (desktop) | publik | `/` |
| `M1k21R` | P1 · Beranda (mobile 390) | publik | `/` |
| `rekTU` | P2 · Transparansi (desktop) | publik | `/transparansi` |
| `c1KqO` | P2 · Transparansi (mobile 390) | publik | `/transparansi` |
| `JD30D` | State · Akses ditolak | shared | `(semua rute internal)` |
