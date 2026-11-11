import { useEffect, useState } from "react";
import type { WorkUnitDto } from "@nirmala/shared";
import { Input, Select, Textarea } from "../../../ui";
import { formatNumber } from "../../../lib/format";
import { chrApi } from "../chrApi";
import { CATEGORY_OPTIONS, TEXT_MAX, TITLE_MAX, type NoteForm, type NoteFormErrors } from "../logic";
import { ExpectationFields } from "./ExpectationFields";
import styles from "./Forms.module.css";

const workUnitCache = new Map<string, WorkUnitDto[]>();

/** Satker of one eselon I for the "Satker" dropdown of a manual note. Cached for the session. */
function useWorkUnits(organizationUnitId: string, enabled: boolean) {
  const [units, setUnits] = useState<WorkUnitDto[] | null>(() => workUnitCache.get(organizationUnitId) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled || workUnitCache.has(organizationUnitId)) return;
    let active = true;
    chrApi
      .workUnits(organizationUnitId)
      .then((result) => {
        workUnitCache.set(organizationUnitId, result.workUnits);
        if (active) setUnits(result.workUnits);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [organizationUnitId, enabled]);
  return { units, failed };
}

export interface NoteFieldsProps {
  form: NoteForm;
  onChange: (next: NoteForm) => void;
  errors: NoteFormErrors;
  organizationUnitId: string;
  /** A manual note (no RKA item) needs a Satker; editing an existing note does not. */
  withWorkUnit: boolean;
  disabled?: boolean;
}

/** Shared fields of a catatan: Satker, category, title, text and the structured expectation. */
export function NoteFields({ form, onChange, errors, organizationUnitId, withWorkUnit, disabled }: NoteFieldsProps) {
  const { units, failed } = useWorkUnits(organizationUnitId, withWorkUnit);
  const set = (patch: Partial<NoteForm>) => onChange({ ...form, ...patch });
  const textLength = form.text.length;

  return (
    <>
      {withWorkUnit && (
        <Select
          label="Satker"
          required
          value={form.workUnitId}
          onChange={(event) => set({ workUnitId: event.target.value })}
          placeholder={units === null && !failed ? "Memuat daftar Satker…" : "Pilih Satker"}
          disabled={disabled || units === null}
          options={(units ?? []).map((unit) => ({ value: unit.id, label: `${unit.name} · ${unit.code}` }))}
          error={errors.workUnitId ?? (failed ? "Daftar Satker belum bisa dimuat. Tutup dialog ini lalu coba lagi." : undefined)}
        />
      )}
      <Select
        label="Kategori"
        value={form.category}
        onChange={(event) => set({ category: event.target.value as NoteForm["category"] })}
        options={CATEGORY_OPTIONS}
        disabled={disabled}
      />
      <Input
        label="Judul catatan"
        required
        value={form.title}
        maxLength={TITLE_MAX}
        placeholder="Contoh: Pakaian seragam hari besar"
        onChange={(event) => set({ title: event.target.value })}
        error={errors.title}
        hint={errors.title ? undefined : "Uraian singkat item yang dicatat."}
        disabled={disabled}
      />
      <Textarea
        label="Teks catatan"
        required
        value={form.text}
        rows={4}
        maxLength={TEXT_MAX}
        onChange={(event) => set({ text: event.target.value })}
        error={errors.text}
        hint={errors.text ? undefined : `${formatNumber(textLength)} dari ${formatNumber(TEXT_MAX)} karakter`}
        disabled={disabled}
      />
      <ExpectationFields value={form.expectation} onChange={(expectation) => set({ expectation })} error={errors.expectation} disabled={disabled} />
    </>
  );
}
