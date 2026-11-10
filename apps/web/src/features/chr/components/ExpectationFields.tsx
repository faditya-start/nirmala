import { useEffect, useId, useState } from "react";
import type { AccountDto } from "@nirmala/shared";
import { Input, Select, Textarea } from "../../../ui";
import { chrApi } from "../chrApi";
import { EXPECTATION_KIND_OPTIONS, emptyExpectationForm, type ExpectationForm } from "../logic";
import styles from "./Forms.module.css";

export interface ExpectationFieldsProps {
  value: ExpectationForm;
  onChange: (next: ExpectationForm) => void;
  /** Message from validation (shared zod schema); shown under the fields that matter. */
  error?: string;
  disabled?: boolean;
}

const KIND_HINT: Partial<Record<ExpectationForm["kind"], string>> = {
  hapus_item: "Satker diminta menghapus item ini dari RKA. Tidak ada isian tambahan.",
  rinci_item: "Satker diminta merinci item ini lebih lanjut. Tidak ada isian tambahan."
};

/** Structured editor for the expectation of a note (kinds: ganti_akun, hapus_item, turunkan_nilai, rinci_item, manual). */
export function ExpectationFields({ value, onChange, error, disabled }: ExpectationFieldsProps) {
  const listId = useId();
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const query = value.kind === "ganti_akun" ? value.to.trim() : "";

  // Account suggestions are a convenience: a failed lookup is ignored and the code can still be typed.
  useEffect(() => {
    if (value.kind !== "ganti_akun") return;
    let active = true;
    const timer = window.setTimeout(() => {
      chrApi
        .accounts(query)
        .then((result) => active && setAccounts(result.accounts))
        .catch(() => active && setAccounts([]));
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [value.kind, query]);

  const matched = accounts.find((account) => account.code === value.to.trim());
  const set = (patch: Partial<ExpectationForm>) => onChange({ ...value, ...patch });

  return (
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={styles.legend}>Ekspektasi tindak lanjut</legend>
      <Select
        label="Jenis ekspektasi"
        value={value.kind}
        onChange={(event) => onChange({ ...emptyExpectationForm(event.target.value as ExpectationForm["kind"]) })}
        options={EXPECTATION_KIND_OPTIONS}
        hint={KIND_HINT[value.kind]}
      />
      {value.kind === "ganti_akun" && (
        <>
          <Input
            label="Kode akun tujuan"
            value={value.to}
            inputMode="numeric"
            maxLength={6}
            autoComplete="off"
            list={listId}
            placeholder="Contoh: 521111"
            onChange={(event) => set({ to: event.target.value.replace(/\D/g, "") })}
            hint={matched ? matched.name : "6 digit sesuai bagan akun standar."}
            error={error}
            inputClassName="mono"
          />
          <datalist id={listId}>
            {accounts.map((account) => (
              <option key={account.code} value={account.code}>
                {account.name}
              </option>
            ))}
          </datalist>
        </>
      )}
      {value.kind === "turunkan_nilai" && (
        <div className={styles.pair}>
          <Input
            label="Batas harga satuan (Rp)"
            value={value.maxUnitPrice}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Contoh: 350000"
            onChange={(event) => set({ maxUnitPrice: event.target.value.replace(/[^\d.]/g, "") })}
            inputClassName="num"
          />
          <Input
            label="Batas total (Rp)"
            value={value.maxTotal}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Contoh: 48600000"
            onChange={(event) => set({ maxTotal: event.target.value.replace(/[^\d.]/g, "") })}
            inputClassName="num"
          />
          <p className={styles.pairHint} role={error ? "alert" : undefined} data-error={error ? "" : undefined}>
            {error ?? "Isi salah satu atau keduanya. Angka bulat rupiah."}
          </p>
        </div>
      )}
      {value.kind === "manual" && (
        <Textarea
          label="Instruksi tindak lanjut"
          value={value.instruction}
          maxLength={1000}
          rows={3}
          onChange={(event) => set({ instruction: event.target.value })}
          hint="Tulis apa yang harus dilakukan Satker. Maksimal 1.000 karakter."
          error={error}
        />
      )}
    </fieldset>
  );
}
