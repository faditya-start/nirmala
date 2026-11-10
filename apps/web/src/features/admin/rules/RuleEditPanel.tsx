import { NOTE_CATEGORIES, type RuleAdminDto, type RuleResponse } from "@nirmala/shared";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { api, errorMessage } from "../../../lib/api";
import { Input, Select, Switch, Textarea } from "../../../ui";
import { SidePanel } from "../components/SidePanel";
import { CATEGORY_LABEL } from "../labels";
import {
  buildBody,
  effectiveGantiAkun,
  toForm,
  validateForm,
  visibleOptionals,
  type ExpectationType,
  type RuleForm,
  type RuleFormErrors
} from "./ruleForm";
import styles from "./RuleEditPanel.module.css";

const CONDITION_LABEL: Record<string, string> = { volume_zero_total_positive: "Volume nol, total positif" };

export interface RuleEditPanelProps {
  rule: RuleAdminDto;
  open: boolean;
  onClose: () => void;
  onSaved: (rule: RuleAdminDto) => void;
}

/**
 * S12a · Edit aturan (pFsNp). Fields follow the rule kind; one panel serves all four kinds.
 * The parent mounts it with a fresh `key` per opening, so the form always starts from the saved rule.
 */
export function RuleEditPanel({ rule, open, onClose, onSaved }: RuleEditPanelProps) {
  const [form, setForm] = useState<RuleForm>(() => toForm(rule));
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors: RuleFormErrors = attempted ? validateForm(rule.kind, form) : {};
  const dirty = buildBody(rule, form) !== null;

  const optional = visibleOptionals(rule);
  const set = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setAttempted(true);
    setServerError(null);
    if (Object.keys(validateForm(rule.kind, form)).length > 0) return;
    const body = buildBody(rule, form);
    if (!body) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const result = await api.put<RuleResponse>(`/admin/rules/${rule.id}`, body);
      onSaved(result.rule);
    } catch (error) {
      setServerError(errorMessage(error));
      setBusy(false);
    }
  }

  const gantiTo = effectiveGantiAkun(rule.kind, form);
  const expectationOptions: { value: ExpectationType; label: string }[] = [
    { value: "", label: "Tanpa ekspektasi bawaan" },
    { value: "ganti_akun", label: `ganti_akun → ${gantiTo || "…"}` },
    { value: "hapus_item", label: "hapus_item" },
    { value: "rinci_item", label: "rinci_item" },
    { value: "turunkan_nilai", label: "turunkan_nilai" },
    { value: "manual", label: "manual" }
  ];

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={`Edit aturan ${rule.code}`}
      subtitle={`Jenis ${rule.kind}`}
      submitLabel="Simpan perubahan"
      busy={busy}
      dirty={dirty}
      onSubmit={() => void submit()}
    >
      {serverError && (
        <p role="alert" className={styles.alert}>
          <CircleAlert size={14} aria-hidden="true" />
          <span>{serverError}</span>
        </p>
      )}

      <Input label="Nama aturan" value={form.name} onChange={(event) => set("name", event.target.value)} error={errors.name} required maxLength={200} />
      <Select
        label="Kategori"
        value={form.category}
        onChange={(event) => set("category", event.target.value as RuleForm["category"])}
        options={NOTE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABEL[value] }))}
      />

      <h3 className={styles.section}>Parameter</h3>

      {rule.kind === "keyword_wrong_account" && (
        <>
          <Textarea label="Pola uraian (mengandung salah satu)" value={form.include} onChange={(event) => set("include", event.target.value)} error={errors.include} hint={errors.include ? undefined : "Pisahkan kata dengan tanda |."} rows={3} />
          {optional.exclude && <Textarea label="Pola pengecualian (tidak boleh ada)" value={form.exclude} onChange={(event) => set("exclude", event.target.value)} error={errors.exclude} rows={2} />}
          <div className={styles.pair}>
            <Input label="Akun salah" value={form.akunSalah} onChange={(event) => set("akunSalah", event.target.value)} error={errors.akunSalah} hint={errors.akunSalah ? undefined : "Pisahkan dengan koma."} />
            <Input label="Akun benar" value={form.akunBenar} onChange={(event) => set("akunBenar", event.target.value)} error={errors.akunBenar} inputMode="numeric" maxLength={6} />
          </div>
          {optional.akunSalahKecuali && <Input label="Akun salah, kecuali" value={form.akunSalahKecuali} onChange={(event) => set("akunSalahKecuali", event.target.value)} error={errors.akunSalahKecuali} hint="Pisahkan dengan koma." />}
          {optional.minUnitPrice && <Input label="Harga satuan minimum (Rp)" value={form.minUnitPrice} onChange={(event) => set("minUnitPrice", event.target.value)} error={errors.minUnitPrice} inputMode="numeric" />}
        </>
      )}

      {rule.kind === "keyword" && (
        <>
          <Textarea label="Pola uraian (semua baris harus cocok)" value={form.all} onChange={(event) => set("all", event.target.value)} error={errors.all} hint={errors.all ? undefined : "Satu pola per baris. Dalam satu baris, pisahkan kata dengan tanda |."} rows={3} />
          {optional.none && <Textarea label="Pola pengecualian (satu per baris)" value={form.none} onChange={(event) => set("none", event.target.value)} error={errors.none} rows={2} />}
          {optional.akunPrefix && <Input label="Awalan akun" value={form.akunPrefix} onChange={(event) => set("akunPrefix", event.target.value)} error={errors.akunPrefix} inputMode="numeric" maxLength={6} />}
        </>
      )}

      {rule.kind === "value_check" && (
        <Select
          label="Kondisi"
          value={form.condition}
          onChange={(event) => set("condition", event.target.value)}
          options={Object.entries(CONDITION_LABEL).map(([value, label]) => ({ value, label }))}
          hint="Hanya satu kondisi yang tersedia saat ini."
        />
      )}

      {rule.kind === "blokir_history" && <Switch checked={form.onlyRevision} onCheckedChange={(checked) => set("onlyRevision", checked)} label="Hanya dievaluasi di snapshot revisi (v2 dan seterusnya)" />}

      <Textarea
        label="Alasan (tampil ke reviewer)"
        value={form.reasonTemplate}
        onChange={(event) => set("reasonTemplate", event.target.value)}
        error={errors.reasonTemplate}
        hint={errors.reasonTemplate ? undefined : "Teks ini menjadi isian awal catatan saat reviewer mengonfirmasi flag."}
        rows={4}
      />

      <Select
        label="Ekspektasi default"
        value={form.expType}
        onChange={(event) => set("expType", event.target.value as ExpectationType)}
        options={expectationOptions}
        error={form.expType === "ganti_akun" ? errors.expTo ?? errors.akunBenar : undefined}
      />
      {form.expType === "ganti_akun" && rule.kind !== "keyword_wrong_account" && (
        <Input label="Akun tujuan" value={form.expTo} onChange={(event) => set("expTo", event.target.value)} error={errors.expTo} inputMode="numeric" maxLength={6} />
      )}
      {form.expType === "turunkan_nilai" && (
        <div className={styles.pair}>
          <Input label="Batas harga satuan (Rp)" value={form.expMaxUnitPrice} onChange={(event) => set("expMaxUnitPrice", event.target.value)} error={errors.expMaxUnitPrice} inputMode="numeric" />
          <Input label="Batas total (Rp)" value={form.expMaxTotal} onChange={(event) => set("expMaxTotal", event.target.value)} error={errors.expMaxTotal} inputMode="numeric" />
        </div>
      )}
      {form.expType === "manual" && <Textarea label="Instruksi untuk reviewer" value={form.expInstruction} onChange={(event) => set("expInstruction", event.target.value)} error={errors.expInstruction} rows={3} />}

      <Textarea
        label="Catatan validasi (opsional)"
        value={form.validationNote}
        onChange={(event) => set("validationNote", event.target.value)}
        error={errors.validationNote}
        hint={errors.validationNote ? undefined : "Selama terisi, aturan ditandai Perlu validasi di katalog. Kosongkan setelah auditor memvalidasi."}
        rows={2}
      />

      <Switch checked={form.active} onCheckedChange={(checked) => set("active", checked)} label="Aturan aktif" />
      <p className={styles.effect}>Perubahan berlaku untuk impor berikutnya dan saat siklus dihitung ulang. Hasil yang sudah ada tidak berubah.</p>
    </SidePanel>
  );
}
