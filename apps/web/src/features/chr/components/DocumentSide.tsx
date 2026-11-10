import { Check, CircleAlert, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChrDocumentDto, ChrVersionSummaryDto } from "@nirmala/shared";
import { errorMessage } from "../../../lib/api-error";
import { formatDate, formatDateTime, formatNumber } from "../../../lib/format";
import { Button, SectionHeader, Textarea, Timeline, TimelineItem } from "../../../ui";
import { chrApi } from "../chrApi";
import { RECOMMENDATION_MAX } from "../logic";
import styles from "./DocumentSide.module.css";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: number } | { kind: "error"; message: string };

/** Rekomendasi: autosaved with a short debounce while the CHR is a draft, read-only afterwards. */
export function RecommendationField({ doc, editable, onSaved }: { doc: ChrDocumentDto; editable: boolean; onSaved: (doc: ChrDocumentDto) => void }) {
  const [text, setText] = useState(doc.recommendation ?? "");
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const lastSaved = useRef(doc.recommendation ?? "");
  const latest = useRef(text);
  const saving = useRef(false);
  const timer = useRef<number | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  // Locked or reloaded document: show what the server has.
  useEffect(() => {
    if (!editable) {
      setText(doc.recommendation ?? "");
      lastSaved.current = doc.recommendation ?? "";
    }
  }, [editable, doc.recommendation]);

  async function flush() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (saving.current) return;
    while (latest.current.trim() !== lastSaved.current.trim()) {
      const sending = latest.current;
      saving.current = true;
      setState({ kind: "saving" });
      try {
        const result = await chrApi.saveRecommendation(doc.id, sending);
        lastSaved.current = sending;
        onSavedRef.current(result.document);
        setState({ kind: "saved", at: Date.now() });
      } catch (error) {
        setState({ kind: "error", message: errorMessage(error, "Belum tersimpan.") });
        saving.current = false;
        return;
      }
      saving.current = false;
    }
  }

  function change(value: string) {
    setText(value);
    latest.current = value;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 900);
  }

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  let hint: React.ReactNode;
  if (!editable) hint = "Terkunci sejak CHR terbit. Perubahan lewat adendum.";
  else if (state.kind === "saving") hint = "Menyimpan…";
  else if (state.kind === "error")
    hint = (
      <span className={styles.errorHint} role="alert">
        <CircleAlert size={12} aria-hidden="true" /> Belum tersimpan: {state.message}
      </span>
    );
  else if (state.kind === "saved") hint = `Tersimpan otomatis pukul ${formatDateTime(state.at).split(" · ")[1] ?? ""}.`;
  else hint = "Tersimpan otomatis sebagai draf.";

  return (
    <section className={styles.group} aria-labelledby="chr-rec-title">
      <SectionHeaderId id="chr-rec-title" title="Rekomendasi" description="Diisi reviewer. Menjadi bagian CHR yang diterbitkan." />
      <Textarea
        label="Rekomendasi reviewer"
        className={editable ? undefined : styles.sunken}
        value={text}
        readOnly={!editable}
        maxLength={RECOMMENDATION_MAX}
        rows={6}
        onChange={(event) => change(event.target.value)}
        onBlur={() => editable && void flush()}
        hint={hint}
      />
    </section>
  );
}

/** Tanggapan eselon I: PIC UKI writes it after the CHR is issued. */
export function UnitResponseField({
  doc,
  canRespond,
  onSaved
}: {
  doc: ChrDocumentDto;
  canRespond: boolean;
  onSaved: (doc: ChrDocumentDto) => void;
}) {
  const [text, setText] = useState(doc.unitResponse ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const issued = doc.status !== "draft";
  const dirty = text.trim() !== (doc.unitResponse ?? "").trim();

  useEffect(() => {
    setText(doc.unitResponse ?? "");
  }, [doc.unitResponse]);

  async function save() {
    if (busy) return;
    if (text.trim() === "") {
      setError("Tanggapan tidak boleh kosong.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await chrApi.saveUnitResponse(doc.id, text.trim());
      onSaved(result.document);
      setSaved(true);
    } catch (caught) {
      setError(errorMessage(caught, "Tanggapan belum tersimpan. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  const filled = doc.unitResponse
    ? `Diisi ${doc.unitResponseByName ?? "PIC UKI"}${doc.unitResponseAt ? `, ${formatDate(doc.unitResponseAt)}` : ""}.`
    : null;
  let hint: React.ReactNode;
  if (!issued) hint = "Aktif setelah terbit.";
  else if (error) hint = undefined;
  else if (saved && !dirty) hint = filled ?? "Tanggapan tersimpan.";
  else hint = filled ?? (canRespond ? "Belum ada tanggapan. Isi lalu simpan." : "Belum ada tanggapan dari eselon I.");

  return (
    <section className={styles.group} aria-labelledby="chr-resp-title">
      <SectionHeaderId id="chr-resp-title" title="Tanggapan eselon I" description="Diisi PIC UKI setelah CHR terbit." />
      <Textarea
        label="Tanggapan eselon I (PIC UKI)"
        className={issued && canRespond ? undefined : styles.sunken}
        value={text}
        readOnly={!(issued && canRespond)}
        disabled={!issued}
        placeholder={issued ? (canRespond ? "Tulis tanggapan eselon I" : "") : "Belum bisa diisi sebelum CHR terbit."}
        maxLength={5000}
        rows={5}
        onChange={(event) => {
          setText(event.target.value);
          setSaved(false);
          setError(null);
        }}
        hint={hint}
        error={error ?? undefined}
      />
      {issued && canRespond && (
        <div>
          <Button variant="sekunder" size="sm" icon={saved && !dirty ? Check : Save} onClick={() => void save()} loading={busy} disabled={!dirty}>
            Simpan tanggapan
          </Button>
        </div>
      )}
    </section>
  );
}

/** SectionHeader without an id prop: wrap so the section can be labelled. */
function SectionHeaderId({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div id={id} className={styles.sectionHead}>
      <SectionHeader title={title} description={description} />
    </div>
  );
}

/** Riwayat versi timeline: one item per version, a hollow "Adendum" item while none exists. */
export function VersionTimeline({ doc, versions }: { doc: ChrDocumentDto; versions: ChrVersionSummaryDto[] }) {
  const hasAddendum = versions.some((version) => version.reason === "adendum");
  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
  return (
    <section className={styles.group} aria-labelledby="chr-ver-title">
      <div id="chr-ver-title" className={styles.sectionHead}>
        <SectionHeader title="Riwayat versi" />
      </div>
      {sorted.length === 0 ? (
        <p className={styles.plain}>Belum ada versi. Versi 1 dibuat saat CHR diterbitkan.</p>
      ) : (
        <Timeline label="Riwayat versi CHR">
          {sorted.map((version, index) => (
            <TimelineItem
              key={version.versionNumber}
              title={version.reason === "terbit" ? `Versi ${version.versionNumber} · terbit` : `Versi ${version.versionNumber} · adendum`}
              time={formatDateTime(version.createdAt)}
              tone={version.reason === "terbit" ? "menunggu" : "default"}
              description={
                version.reason === "adendum" && version.addendumReason
                  ? `${version.createdByName} · ${formatNumber(version.notesCount)} catatan. ${version.addendumReason}`
                  : `${version.createdByName} · ${formatNumber(version.notesCount)} catatan`
              }
              last={hasAddendum && index === sorted.length - 1}
            />
          ))}
          {!hasAddendum && doc.status !== "draft" && <TimelineItem title="Adendum" description="Belum ada adendum" pending last />}
        </Timeline>
      )}
    </section>
  );
}
