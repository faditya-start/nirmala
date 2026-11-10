# Brief bersama untuk agen UI (gelombang 2)

Dokumen ini berlaku untuk semua agen UI. Penugasan per agen (fitur dan layar) ada di prompt masing-masing.

## Aturan kerja

1. **Worktree sendiri.** Kamu diberi path worktree dan nama branch. Kerjakan dan commit hanya di sana. Jangan `cd` ke repo utama dan jangan menyentuh branch lain.
2. **Hanya folder fitur milikmu:** `apps/web/src/features/<fitur>/` (termasuk `mock.ts`). **Dilarang** mengubah `app/`, `ui/`, `shells/`, `lib/`, `styles/`, `packages/shared`, `apps/api`. Komponen yang belum ada di `ui/` dibuat di `features/<fitur>/components/` dan dicatat di laporan agar bisa dipromosikan. Jika kontrak (`packages/shared/src/contracts`) atau `ui/` salah, jangan diubah: pakai solusi lokal dan laporkan.
3. **Desain Pencil terkunci.** Layar harus cocok dengan PNG/HTML ekspor. Jangan mengganti palet, font, tata letak, atau nada copy. Copy yang tidak ada di desain (galat, loading, kosong) ditulis dalam Bahasa Indonesia baku-lugas, kalimat biasa, tidak menuduh (tandai risiko untuk ditinjau, bukan "kecurangan").
4. **Data sintetis saja.** Tidak ada data pemerintah asli di mock, screenshot, atau komentar.

## Bahan yang harus dibaca

- `PRODUCT.md`, `docs/mvp-scope.md` (§3 peran, §4 alur dan status), `apps/web/README.md` (struktur, mock, komponen `ui/`), `design/SCREENS.md`.
- `DESIGN.md` di worktree integrasi `/home/milahlyy/projects/mia/nirmala/.claude/worktrees/integration/DESIGN.md` **jika sudah ada** (sedang dibuat paralel; baca ulang sebelum polish).
- `docs/api-contract.md` bagian untuk layarmu (§7 memetakan layar → endpoint → DTO) dan `packages/shared/src/contracts/<fitur>.ts`.
- Visual: `/home/milahlyy/projects/mia/nirmala/design/export/png/<nodeId>.png` (lihat dengan Read) dan `.../html/<nodeId>.html` (nilai spasi/ukuran/warna persis). Path absolut, tidak ada di worktree. **Jangan Read `design/nirmala.pen`.**
- Lihat **semua** frame milik fiturmu, termasuk frame State dan dialog, serta varian gelap bila ada.

## Yang harus dikirim

- Setiap layar dan state di `design/SCREENS.md` untuk fiturmu, dengan data dari API lewat `api` (`lib/api.ts`) memakai DTO kontrak. Path relatif terhadap `/api`.
- Aksi nyata (konfirmasi, dismiss, unggah, setujui, dst.) memanggil endpoint kontrak dan menangani galat 4xx dengan pesan server (`ApiError.message`), 401 (sudah ditangani global), 403 (tampilkan AccessDenied bila layar penuh), 409 (konflik), 501 (belum tersedia: pesan jelas, bukan crash).
- Keadaan loading, kosong, galat, dan data banyak (uraian panjang dipotong dengan `title`, angka format `id-ID`, tabel besar berhalaman). Tombol aksi menonaktifkan diri saat kirim, tidak ada double-submit.
- Keyboard: dialog menjebak fokus dan mengembalikannya; baris tabel yang bisa diklik juga bisa diaktifkan dengan Enter; label form terhubung; status tidak hanya lewat warna.
- Terang dan gelap sama baiknya (hanya token, tanpa heks).
- `features/<fitur>/mock.ts` dengan mock **stateful** (aksi mengubah data dalam memori sehingga alur bisa dicoba: konfirmasi mengubah keputusan, kembalikan mengubah status, dst.), data sintetis realistis (Satker fiktif, uraian item mirip data nyata tapi rekaan). Mock harus mengikuti DTO kontrak (tipe diperiksa compiler) dan peran (`?as=uki|leader|admin`). Mock hanya dimuat saat `VITE_MOCK=1`.
- Komponen kecil lokal diberi test jika berisi logika (format, pemetaan status, reducer). Jalankan `npm test -w @nirmala/web` bila ada; tambahkan skrip `node --test` bila belum ada dan perlu.

## Verifikasi (wajib)

- `npm run typecheck` dan `npm run build -w @nirmala/web` hijau.
- Browser: **Playwright MCP tidak bisa membuka Chrome di mesin ini.** Pakai `playwright-core` dengan Chromium cache: `chromium.launch({ executablePath: "/home/milahlyy/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome" })` dari skrip di scratchpad sesi (bukan di repo). Jalankan `VITE_MOCK=1 npm run dev -w @nirmala/web -- --port <PORTMU>` (port diberikan di prompt; jangan pakai 5173). Ambil screenshot lebar 1440 untuk terang dan gelap (`?theme=dark` atau `emulateMedia`), bandingkan dengan PNG Pencil secara visual (Read kedua gambar), dan perbaiki selisih spasi/tipografi/warna. Periksa konsol tanpa galat dan jalankan alur utama layar (klik, filter, dialog, keyboard).
- `/home/milahlyy/.claude/plugins/cache/impeccable/impeccable/4.8.1/skills/impeccable/scripts/impeccable detect --json apps/web/src/features/<fitur>` harus kosong.

## Pass impeccable (wajib, setelah layar cocok dengan desain)

Panggil Skill `impeccable` dengan args berikut, satu per satu, terarah ke `apps/web/src/features/<fitur>` (cwd `apps/web` di worktree-mu). Terapkan perbaikan sendiri setelah tiap pass lalu jalankan ulang typecheck/build. Desain Pencil adalah brief, jadi pass hanya menyempurnakan dan tidak boleh mengubah dunia visual:

1. `critique` — tinjauan UX/heuristik per layar. Abaikan saran yang bertentangan dengan Pencil.
2. `audit` — a11y (keyboard, fokus, ARIA, kontras terang/gelap), performa (tabel besar, render ulang), responsif ≥1024.
3. `harden` — uraian panjang, nilai ekstrem, galat jaringan, 4xx/5xx/501, race (klik ganda, navigasi saat loading), i18n angka/tanggal id-ID.
4. `clarify` — hanya untuk copy yang tidak ada di desain (galat, kosong, konfirmasi, tooltip). Jangan menulis ulang copy yang sudah ada di desain.
5. `adapt` — hanya bila fiturmu publik (P1/P2: 390/768/1440). Layar internal desktop-first, jangan dibuat untuk ponsel.
6. `animate` — hanya gerak halus yang berfungsi (masuk dialog/panel, umpan balik hover/tekan/fokus), 100–200 ms, hormati `prefers-reduced-motion`. Ini alat kerja, tanpa dekorasi.
7. `polish` — pass terakhir.

**Jangan** menjalankan `bolder`, `overdrive`, `delight`, `colorize`, `quieter`, `typeset`, atau `layout` kecuali untuk memperbaiki selisih nyata terhadap desain. Jika sebuah pass mengusulkan mengganti tampilan desain, tolak dan catat.

## Commit dan laporan

Commit bertahap di branch-mu (pesan diakhiri `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`). Laporan akhir (Bahasa Inggris, ringkas dan jujur): branch, layar dan state yang selesai (tabel node id → selesai/sebagian), pass impeccable yang dijalankan beserta perubahan dan yang ditolak, komponen lokal yang layak dipromosikan ke `ui/`, kekurangan kontrak/`ui/` yang kamu temui, perintah verifikasi dan hasilnya, serta apa yang **tidak** terverifikasi (misalnya mode API nyata).
