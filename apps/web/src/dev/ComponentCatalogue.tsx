import { Check, History, Trash2, Upload, Pencil } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  Button,
  CellEmpty,
  CellTitle,
  CheckResultBadge,
  Checkbox,
  ConfirmDialog,
  DecisionBadge,
  Dialog,
  EmptyState,
  EvidenceCard,
  EvidenceRow,
  FactorRow,
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterSpacer,
  FilterSummary,
  IconButton,
  Input,
  KpiCard,
  Loading,
  PageHeader,
  Pagination,
  RuleCard,
  RuleChip,
  ScoreBadge,
  ScoreBreakdown,
  SectionHeader,
  Select,
  SelectedMark,
  StatusBadge,
  Switch,
  TBody,
  Table,
  TableFrame,
  TabPanel,
  Tabs,
  TagChip,
  Textarea,
  TextLink,
  THead,
  Th,
  Td,
  Timeline,
  TimelineItem,
  Tr,
  type CheckResult,
  type Decision,
  type NoteStatus,
  type SortDirection
} from "../ui";
import { formatNumber } from "../lib/format";
import styles from "./ComponentCatalogue.module.css";

type Theme = "system" | "light" | "dark";

function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("theme");
    return fromUrl === "light" || fromUrl === "dark" ? fromUrl : "system";
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    return () => root.removeAttribute("data-theme");
  }, [theme]);
  return [theme, setTheme];
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.block} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className={styles.blockTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Spec({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className={styles.spec}>
      <span className={styles.specName}>{name}</span>
      {children}
    </div>
  );
}

const NOTE_STATUSES: NoteStatus[] = ["draf", "menunggu_revisi", "perlu_verifikasi", "dijustifikasi", "closed"];
const CHECKS: CheckResult[] = ["terpenuhi", "belum_terpenuhi", "data_tidak_cukup", "item_tidak_ditemukan"];
const DECISIONS: Decision[] = ["belum_ditinjau", "draf_di_chr", "dismiss"];

interface DemoRow {
  id: number;
  title: string;
  satker: string;
  account: string;
  total: number;
  rule?: string;
  score: number;
  change: string;
  decision: Decision;
}

const ROWS: DemoRow[] = [
  { id: 1, title: "Pakaian seragam hari besar", satker: "Satker Contoh 01", account: "521211", total: 48_600_000, rule: "R01", score: 74, change: "Baru", decision: "belum_ditinjau" },
  { id: 2, title: "Rehabilitasi madrasah desa", satker: "Satker Contoh 03", account: "532111", total: 640_000_000, rule: "R05", score: 81, change: "Baru", decision: "belum_ditinjau" },
  { id: 3, title: "Outsourcing jasa kebersihan", satker: "Satker Contoh 02", account: "522191", total: 126_000_000, rule: "R02", score: 58, change: "Berubah", decision: "draf_di_chr" },
  { id: 4, title: "Makan rapat biasa", satker: "Satker Contoh 01", account: "521211", total: 18_750_000, score: 41, change: "Tetap", decision: "dismiss" },
  { id: 5, title: "Perjalanan dinas biasa", satker: "Satker Contoh 02", account: "524111", total: 22_500_000, score: 22, change: "Tetap", decision: "belum_ditinjau" }
];

/** Dev-only catalogue (/dev/komponen): every component and variant, light/dark switch. */
export function ComponentCatalogue() {
  const [theme, setTheme] = useTheme();
  const [tab, setTab] = useState("verif");
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [dialog, setDialog] = useState<null | "confirm" | "danger" | "form">(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [eselon, setEselon] = useState("a");
  const [flagOnly, setFlagOnly] = useState(true);
  const [selected, setSelected] = useState<number | null>(2);
  const [sort, setSort] = useState<SortDirection>("desc");

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div>
          <h1 className={styles.h1}>NIRMALA · Katalog komponen</h1>
          <p className={styles.lede}>Halaman pengembangan. Setiap komponen dan variannya, terang dan gelap, untuk dibandingkan dengan Pencil.</p>
        </div>
        <div className={styles.themeBox} role="group" aria-label="Tema">
          {(["system", "light", "dark"] as Theme[]).map((option) => (
            <button key={option} type="button" aria-pressed={theme === option} className={styles.themeButton} onClick={() => setTheme(option)}>
              {option === "system" ? "Sistem" : option === "light" ? "Terang" : "Gelap"}
            </button>
          ))}
          <Link to="/dashboard" className={styles.themeLink}>
            Buka shell
          </Link>
        </div>
      </header>

      <Block id="tombol" title="Tombol">
        <div className={styles.row}>
          <Spec name="Utama">
            <Button variant="utama" icon={Check}>
              Terbitkan CHR
            </Button>
          </Spec>
          <Spec name="Sekunder">
            <Button variant="sekunder" icon={Upload}>
              Impor CSV
            </Button>
          </Spec>
          <Spec name="Ghost">
            <Button variant="ghost" icon={History}>
              Riwayat versi
            </Button>
          </Spec>
          <Spec name="Bahaya">
            <Button variant="bahaya" icon={Trash2}>
              Hapus catatan
            </Button>
          </Spec>
          <Spec name="Nonaktif">
            <Button variant="utama" icon={Check} disabled>
              Terbitkan CHR
            </Button>
          </Spec>
          <Spec name="Memuat">
            <Button variant="utama" loading>
              Menyimpan
            </Button>
          </Spec>
          <Spec name="Kecil (28 px)">
            <Button variant="sekunder" size="sm" icon={Upload}>
              Impor CSV
            </Button>
          </Spec>
          <Spec name="Tombol ikon · aktif · nonaktif">
            <div className={styles.inline}>
              <IconButton icon={Pencil} label="Ubah catatan" />
              <IconButton icon={Pencil} label="Ubah catatan (nonaktif)" disabled />
            </div>
          </Spec>
        </div>
      </Block>

      <Block id="field" title="Input · select · textarea">
        <div className={styles.row}>
          <Spec name="Input">
            <Input label="Cari uraian" placeholder="Mis. makan rapat" hint="Cari dari uraian item" className={styles.w280} />
          </Spec>
          <Spec name="Select">
            <Select label="Kategori alasan" placeholder="Pilih kategori" hint="Wajib untuk dismiss" className={styles.w280} defaultValue="">
              <option value="harga">Harga wajar karena lokasi</option>
              <option value="akun">Akun sudah tepat</option>
            </Select>
          </Spec>
          <Spec name="Textarea">
            <Textarea label="Catatan" placeholder="Tulis catatan untuk CHR" hint="Teks awal diambil dari alasan aturan" className={styles.w280} />
          </Spec>
          <Spec name="Galat">
            <Input label="Label versi" error="Label versi wajib diisi" className={styles.w280} />
          </Spec>
          <Spec name="Nonaktif">
            <Input label="Cari uraian" disabled placeholder="Tidak dapat diubah" hint="Cari dari uraian item" className={styles.w280} />
          </Spec>
        </div>
        <div className={styles.row}>
          <Spec name="Checkbox · on · off · campur">
            <div className={styles.inline}>
              <Checkbox checked={checked} onChange={(event) => setChecked(event.target.checked)} label="Hanya yang kena aturan" />
              <Checkbox defaultChecked={false} label="Tidak dipilih" />
              <Checkbox indeterminate checked={false} onChange={() => undefined} label="Sebagian" />
              <Checkbox disabled label="Nonaktif" />
            </div>
          </Spec>
          <Spec name="Sakelar · aktif · mati">
            <div className={styles.inline}>
              <Switch checked={switchOn} onCheckedChange={setSwitchOn} label={switchOn ? "Aturan aktif" : "Aturan nonaktif"} />
              <Switch checked={false} onCheckedChange={() => undefined} aria-label="Contoh mati" />
              <Switch checked disabled onCheckedChange={() => undefined} aria-label="Contoh nonaktif" />
            </div>
          </Spec>
        </div>
      </Block>

      <Block id="badge" title="Badge status · hasil cek · keputusan · skor · chip">
        <div className={styles.row}>
          {NOTE_STATUSES.map((status) => (
            <Spec key={status} name={status}>
              <StatusBadge status={status} />
            </Spec>
          ))}
          <Spec name="flag">
            <StatusBadge status="flag">Kena aturan</StatusBadge>
          </Spec>
          <Spec name="siap_diajukan">
            <StatusBadge status="siap_diajukan" />
          </Spec>
        </div>
        <div className={styles.row}>
          {CHECKS.map((result) => (
            <Spec key={result} name={result}>
              <CheckResultBadge result={result} />
            </Spec>
          ))}
          {DECISIONS.map((decision) => (
            <Spec key={decision} name={decision}>
              <DecisionBadge decision={decision} />
            </Spec>
          ))}
        </div>
        <div className={styles.row}>
          <Spec name="Skor tinggi">
            <ScoreBadge score={82} />
          </Spec>
          <Spec name="Skor sedang">
            <ScoreBadge score={51} />
          </Spec>
          <Spec name="Skor rendah">
            <ScoreBadge score={18} />
          </Spec>
          <Spec name="Chip aturan">
            <RuleChip code="R01" />
          </Spec>
          <Spec name="Chip tag">
            <TagChip>Efisiensi</TagChip>
          </Spec>
          <Spec name="Tab">
            <div className={styles.tabsDemo}>
              <Tabs
                label="Status catatan"
                idPrefix="demo"
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "menunggu", label: "Menunggu Revisi", count: 12 },
                  { value: "verif", label: "Perlu Verifikasi", count: 3 },
                  { value: "justif", label: "Dijustifikasi", count: 0 },
                  { value: "closed", label: "Closed", count: 41 }
                ]}
              />
              <TabPanel idPrefix="demo" value={tab} active={tab} className={styles.panel}>
                Isi tab: {tab}
              </TabPanel>
            </div>
          </Spec>
        </div>
      </Block>

      <Block id="tabel" title="Tabel dengan filter">
        <FilterBar label="Filter contoh">
          <FilterSearch value={search} onChange={setSearch} placeholder="Cari uraian item" />
          <FilterSelect
            label="Eselon I"
            value={eselon}
            onChange={setEselon}
            options={[
              { value: "a", label: "Ditjen Contoh A" },
              { value: "b", label: "Ditjen Contoh B" }
            ]}
          />
          <FilterSelect label="Satker" value="all" onChange={() => undefined} options={[{ value: "all", label: "Semua" }]} />
          <FilterSelect label="Kategori" value="all" onChange={() => undefined} options={[{ value: "all", label: "Semua" }]} />
          <FilterSelect label="Keputusan" value="all" onChange={() => undefined} options={[{ value: "all", label: "Semua" }]} />
          <Checkbox checked={flagOnly} onChange={(event) => setFlagOnly(event.target.checked)} label="Hanya yang kena aturan" />
          <FilterSpacer />
          <FilterSummary>42 item kena aturan · 17 belum ditinjau</FilterSummary>
        </FilterBar>
        <TableFrame>
          <Table aria-label="Contoh Risk Triage">
            <THead>
              <tr>
                <Th width={32} aria-label="Pilihan" />
                <Th>Uraian (Satker · akun)</Th>
                <Th align="right" width={150} sort={sort} onSort={() => setSort(sort === "desc" ? "asc" : "desc")}>
                  Total (Rp)
                </Th>
                <Th width={130}>Aturan</Th>
                <Th width={130}>Skor</Th>
                <Th width={100}>Perubahan</Th>
                <Th width={150}>Keputusan</Th>
              </tr>
            </THead>
            <TBody>
              {ROWS.map((row) => (
                <Tr key={row.id} selected={selected === row.id} onActivate={() => setSelected(selected === row.id ? null : row.id)}>
                  <Td>
                    <SelectedMark selected={selected === row.id} />
                  </Td>
                  <Td>
                    <CellTitle title={row.title} meta={[row.satker, <span key="a" className="mono">{row.account}</span>]} />
                  </Td>
                  <Td numeric>{formatNumber(row.total)}</Td>
                  <Td>{row.rule ? <RuleChip code={row.rule} /> : <CellEmpty />}</Td>
                  <Td>
                    <ScoreBadge score={row.score} />
                  </Td>
                  <Td>
                    <TagChip>{row.change}</TagChip>
                  </Td>
                  <Td>
                    <DecisionBadge decision={row.decision} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={5} total={128} onPageChange={setPage} />
        </TableFrame>
        <p className={styles.note}>Baris diklik atau Enter/Spasi memilih (baris 2 terpilih: latar biru, garis kiri 3 px, centang). Tab untuk fokus keyboard.</p>
      </Block>

      <Block id="kpi" title="Kartu KPI">
        <div className={styles.grid4}>
          <KpiCard label="Item dianalisis" value="12.480" hint="TA 2026 · tahap alokasi" progress={0.36} />
          <KpiCard label="Item kena aturan" value="342" hint="2,7% dari item dianalisis" />
          <KpiCard label="Satker siap diajukan" value="7 / 18" hint="Satker sampel" progress={0.39} />
          <KpiCard label="Sisa hari ke tenggat ADK" value="3 hari" hint="Tenggat 12 Nov 2026 · H-3 target reviu" />
        </div>
      </Block>

      <Block id="aturan" title="Kartu aturan · baris faktor skor">
        <div className={styles.grid2}>
          <RuleCard
            code="R01"
            name="Pakaian / seragam hari besar"
            category="Efisiensi"
            reason="Alokasi pakaian hari besar tidak memiliki standar penetapan biaya dan tidak esensial dalam mendukung fungsi utama."
            details={[
              { label: "Uraian cocok", value: "pakaian + hari besar", mono: true },
              { label: "Sumber", value: "8 catatan inefisiensi eselon I sebelumnya; rujukan PMK SBM TA 2026" },
              { label: "Ekspektasi bawaan", value: "hapus_item", mono: true }
            ]}
          />
          <div>
            <FactorRow code="F1" name="Harga vs Satker lain" value={100} weight={30} explanation="2,3× median 9 Satker untuk uraian dan satuan yang sama." />
            <FactorRow code="F3" name="Riwayat temuan BPK Satker" na explanation="Belum ada data temuan untuk Satker ini. Faktor tidak ikut menaikkan skor." />
          </div>
        </div>
        <ScoreBreakdown title="Rincian skor · pakaian seragam hari besar" score={74} className={styles.w560}>
          <FactorRow code="F1" name="Harga vs Satker lain" value={100} weight={30} explanation="2,3× median 9 Satker untuk uraian dan satuan yang sama." />
          <FactorRow code="F2" name="Akun rawan" value={70} weight={20} explanation="Akun 521211 ada di daftar akun rawan." />
          <FactorRow code="F3" name="Riwayat temuan BPK Satker" value={30} weight={20} explanation="3 rekomendasi bertema penganggaran, 1 belum selesai." />
          <FactorRow code="F4" name="Kualitas uraian" value={100} weight={15} explanation="Rincian volume (VOL_KEG_1) tidak terisi." />
          <FactorRow code="F5" name="Perubahan dari versi sebelumnya" value={60} weight={15} explanation="Item baru di snapshot ini." />
        </ScoreBreakdown>
      </Block>

      <Block id="bukti" title="Kartu bukti sebelum → sesudah · timeline">
        <div className={styles.grid2}>
          <EvidenceCard title="Bukti cek · snapshot v2 Revisi" result="terpenuhi">
            <EvidenceRow field="Akun" state="berubah" before="522191" after="521111" />
            <EvidenceRow field="Total" state="tetap" value="126.000.000" />
          </EvidenceCard>
          <EvidenceCard title="Bukti cek · snapshot v2 Revisi" result="belum_terpenuhi">
            <EvidenceRow field="Akun" state="tidak_berubah" value="522191 (ekspektasi: 521111)" />
            <EvidenceRow field="Total" state="tetap" value="126.000.000" />
          </EvidenceCard>
          <Timeline label="Riwayat catatan" className={styles.w420}>
            <TimelineItem title="Catatan dibuat" time="3 Nov 2026 · 14.20" description="Reviewer 01 · kategori AKUN · ekspektasi ganti_akun → 521111" />
            <TimelineItem title="CHR diterbitkan" time="4 Nov 2026 · 09.05" description="CHR No. 014/CHR/2026 · status Menunggu Revisi" tone="menunggu" />
            <TimelineItem title="Cek otomatis · snapshot v2" time="8 Nov 2026 · 16.40" description="Belum terpenuhi: akun masih 522191" tone="flag" />
            <TimelineItem title="Dikembalikan ke Satker" time="9 Nov 2026 · 10.15" description="Alasan: akun belum diganti. Status Menunggu Revisi" tone="menunggu" />
            <TimelineItem title="Menunggu snapshot v3" description="Belum ada revisi baru untuk dicek" pending last />
          </Timeline>
        </div>
      </Block>

      <Block id="dialog" title="Dialog · empty state · navigasi · tautan">
        <div className={styles.row}>
          <Spec name="Dialog/Konfirmasi">
            <div className={styles.inline}>
              <Button variant="utama" onClick={() => setDialog("confirm")}>
                Buka dialog konfirmasi
              </Button>
              <Button variant="bahaya" onClick={() => setDialog("danger")}>
                Buka dialog bahaya
              </Button>
              <Button onClick={() => setDialog("form")}>Buka dialog formulir</Button>
            </div>
          </Spec>
          <Spec name="Tautan">
            <TextLink to="/dev/komponen">Satker Contoh 02</TextLink>
          </Spec>
          <Spec name="Crumb">
            <Breadcrumb items={[{ label: "Reviu" }, { label: "Risk Triage", to: "/triage" }, { label: "Pakaian seragam hari besar" }]} />
          </Spec>
          <Spec name="Memuat">
            <Loading />
          </Spec>
        </div>
        <div className={styles.row}>
          <Spec name="Kosong/Keadaan">
            <EmptyState
              title="Belum ada snapshot"
              description="Impor CSV format SIPEKA untuk eselon I ini. Aturan dan skor berjalan otomatis setelah impor selesai."
              action={
                <Button icon={Upload}>Impor CSV</Button>
              }
              className={styles.w480}
            />
          </Spec>
          <Spec name="PageHeader · SectionHeader">
            <div className={styles.w480}>
              <PageHeader title="Dashboard" subtitle="Ditjen Contoh A · TA 2026 Alokasi · data per 9 Nov 2026" actions={<Button icon={History}>Riwayat</Button>} />
              <div className={styles.gapTop}>
                <SectionHeader title="Catatan per status" description="Catatan CHR 014/CHR/2026 per status." />
              </div>
            </div>
          </Spec>
        </div>
      </Block>

      <ConfirmDialog
        open={dialog === "confirm"}
        title="Terbitkan CHR dan kunci dokumen?"
        description="Dokumen akan dikunci dan nomor CHR dibuat. 7 catatan berstatus Draf berubah menjadi Menunggu Revisi. Perubahan setelah terbit hanya lewat adendum."
        summary="Ditjen Contoh A · TA 2026 · tahap alokasi"
        confirmLabel="Terbitkan"
        onConfirm={() => setDialog(null)}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "danger"}
        tone="bahaya"
        title="Hapus catatan ini?"
        description="Catatan Draf akan dihapus dari CHR. Tindakan ini tidak dapat dibatalkan."
        confirmIcon={Trash2}
        confirmLabel="Hapus catatan"
        onConfirm={() => setDialog(null)}
        onCancel={() => setDialog(null)}
      />
      <Dialog
        open={dialog === "form"}
        onClose={() => setDialog(null)}
        title="Impor CSV"
        icon={Upload}
        size="lg"
        actions={
          <>
            <Button onClick={() => setDialog(null)}>Batal</Button>
            <Button variant="utama" onClick={() => setDialog(null)}>
              Proses
            </Button>
          </>
        }
      >
        <Select label="Eselon I" options={[{ value: "a", label: "Ditjen Contoh A" }]} defaultValue="a" className={styles.fullWidth} />
        <Input label="Label versi" placeholder="Mis. v2 Revisi" hint="Dipakai di tab dan bukti cek" className={styles.fullWidth} />
      </Dialog>
    </div>
  );
}
