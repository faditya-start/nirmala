import { Input, Select, Textarea } from "../../../ui";
import { EXPECTATION_HINT, EXPECTATION_LABEL, EXPECTATION_TYPES, type ExpectationErrors, type ExpectationForm } from "../expectation";
import { AccountPicker } from "./AccountPicker";

export interface ExpectationEditorProps {
  value: ExpectationForm;
  onChange: (value: ExpectationForm) => void;
  errors: ExpectationErrors;
  disabled?: boolean;
}

const OPTIONS = EXPECTATION_TYPES.map((type) => ({ value: type, label: EXPECTATION_LABEL[type] }));

/** Editor ekspektasi perubahan: pilih jenis, isi parameter jenis itu. Hasilnya `Expectation` lewat `expectationFromForm`. */
export function ExpectationEditor({ value, onChange, errors, disabled }: ExpectationEditorProps) {
  const set = (patch: Partial<ExpectationForm>) => onChange({ ...value, ...patch });
  const hint = value.type ? EXPECTATION_HINT[value.type] : "Pilih apa yang diharapkan berubah di revisi. Sistem memakainya untuk cek otomatis.";
  return (
    <>
      <Select
        label="Ekspektasi perubahan"
        placeholder="Pilih ekspektasi"
        disabled={disabled}
        options={OPTIONS}
        value={value.type}
        error={errors.type}
        hint={hint}
        onChange={(event) => set({ type: event.target.value as ExpectationForm["type"] })}
      />
      {value.type === "ganti_akun" && <AccountPicker label="Akun tujuan" value={value.accountCode} onChange={(accountCode) => set({ accountCode })} error={errors.accountCode} disabled={disabled} />}
      {value.type === "turunkan_nilai" && (
        <>
          <Input
            label="Batas harga satuan (Rp)"
            inputMode="numeric"
            autoComplete="off"
            disabled={disabled}
            value={value.maxUnitPrice}
            error={errors.limit}
            hint="Kosongkan bila hanya membatasi total."
            onChange={(event) => set({ maxUnitPrice: event.target.value })}
          />
          <Input
            label="Batas total (Rp)"
            inputMode="numeric"
            autoComplete="off"
            disabled={disabled}
            value={value.maxTotal}
            hint="Kosongkan bila hanya membatasi harga satuan."
            onChange={(event) => set({ maxTotal: event.target.value })}
          />
        </>
      )}
      {value.type === "manual" && (
        <Textarea
          label="Instruksi untuk Satker"
          required
          maxLength={1000}
          rows={3}
          disabled={disabled}
          value={value.instruction}
          error={errors.instruction}
          onChange={(event) => set({ instruction: event.target.value })}
        />
      )}
    </>
  );
}
