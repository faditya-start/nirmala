/**
 * Pure form logic for "Edit aturan" (pFsNp): rule DTO <-> form strings <-> UpdateRuleBody.
 * No app imports (types only), so `node --test` runs ruleForm.test.ts directly.
 */
import type { Expectation, NoteCategory, RuleAdminDto, RuleKind, UpdateRuleBody } from "@nirmala/shared";

export type ExpectationType = "" | Expectation["type"];

export interface RuleForm {
  name: string;
  category: NoteCategory;
  reasonTemplate: string;
  validationNote: string;
  active: boolean;
  /** keyword_wrong_account */
  include: string;
  exclude: string;
  akunSalah: string;
  akunSalahKecuali: string;
  akunBenar: string;
  minUnitPrice: string;
  /** keyword: one pattern per line */
  all: string;
  none: string;
  akunPrefix: string;
  /** value_check / blokir_history */
  condition: string;
  onlyRevision: boolean;
  /** default expectation */
  expType: ExpectationType;
  expTo: string;
  expMaxUnitPrice: string;
  expMaxTotal: string;
  expInstruction: string;
}

export type RuleFormErrors = Partial<Record<keyof RuleForm, string>>;

const unsafeForDisplay = (pattern: string) => /[()[\]\\]/.test(pattern);

/** Stored `a|b|c` -> shown `a | b | c`. Patterns with groups or escapes are shown as stored. */
export function toDisplayPattern(pattern: string): string {
  return unsafeForDisplay(pattern) ? pattern : pattern.split("|").map((part) => part.trim()).join(" | ");
}

/** Shown `a | b | c` -> stored `a|b|c`. */
export function fromDisplayPattern(text: string): string {
  const trimmed = text.trim();
  return unsafeForDisplay(trimmed) ? trimmed : trimmed.split("|").map((part) => part.trim()).join("|");
}

export function parseList(text: string): string[] {
  return text.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean);
}

export const formatList = (values: unknown): string => (Array.isArray(values) ? values.join(", ") : "");

const lines = (text: string): string[] => text.split(/\r?\n/).map((line) => fromDisplayPattern(line)).filter(Boolean);

const str = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

export function toForm(rule: RuleAdminDto): RuleForm {
  const p = rule.params;
  const expectation = rule.defaultExpectation;
  return {
    name: rule.name,
    category: rule.category,
    reasonTemplate: rule.reasonTemplate,
    validationNote: rule.validationNote ?? "",
    active: rule.active,
    include: toDisplayPattern(str(p.include)),
    exclude: toDisplayPattern(str(p.exclude)),
    akunSalah: formatList(p.akunSalah),
    akunSalahKecuali: formatList(p.akunSalahKecuali),
    akunBenar: str(p.akunBenar),
    minUnitPrice: str(p.minUnitPrice),
    all: Array.isArray(p.all) ? p.all.map((item) => toDisplayPattern(str(item))).join("\n") : "",
    none: Array.isArray(p.none) ? p.none.map((item) => toDisplayPattern(str(item))).join("\n") : "",
    akunPrefix: str(p.akunPrefix),
    condition: str(p.condition),
    onlyRevision: p.onlyRevision === true,
    expType: expectation?.type ?? "",
    expTo: expectation?.type === "ganti_akun" ? expectation.to : "",
    expMaxUnitPrice: expectation?.type === "turunkan_nilai" && expectation.maxUnitPrice !== undefined ? String(expectation.maxUnitPrice) : "",
    expMaxTotal: expectation?.type === "turunkan_nilai" && expectation.maxTotal !== undefined ? String(expectation.maxTotal) : "",
    expInstruction: expectation?.type === "manual" ? expectation.instruction : ""
  };
}

/** Optional parameter fields are only shown when the rule already has them, so nothing is silently dropped. */
export function visibleOptionals(rule: Pick<RuleAdminDto, "params">): { exclude: boolean; akunSalahKecuali: boolean; minUnitPrice: boolean; none: boolean; akunPrefix: boolean } {
  const has = (key: string) => rule.params[key] !== undefined && rule.params[key] !== null;
  return { exclude: has("exclude"), akunSalahKecuali: has("akunSalahKecuali"), minUnitPrice: has("minUnitPrice"), none: has("none"), akunPrefix: has("akunPrefix") };
}

function validRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

const ACCOUNT = /^\d{2,6}$/;
const POSITIVE_INT = /^\d+$/;

export const effectiveGantiAkun = (kind: RuleKind, form: RuleForm): string => (kind === "keyword_wrong_account" ? form.akunBenar.trim() : form.expTo.trim());

export function validateForm(kind: RuleKind, form: RuleForm): RuleFormErrors {
  const errors: RuleFormErrors = {};
  if (form.name.trim().length < 3) errors.name = "Nama aturan minimal 3 karakter.";
  else if (form.name.trim().length > 200) errors.name = "Nama aturan maksimal 200 karakter.";
  if (form.reasonTemplate.trim().length < 10) errors.reasonTemplate = "Alasan minimal 10 karakter.";
  else if (form.reasonTemplate.trim().length > 1000) errors.reasonTemplate = "Alasan maksimal 1.000 karakter.";
  if (form.validationNote.trim().length > 1000) errors.validationNote = "Catatan validasi maksimal 1.000 karakter.";

  if (kind === "keyword_wrong_account") {
    const include = fromDisplayPattern(form.include);
    if (!include) errors.include = "Pola uraian wajib diisi.";
    else if (!validRegex(include)) errors.include = "Pola tidak valid (bukan ekspresi reguler yang benar).";
    if (form.exclude.trim() && !validRegex(fromDisplayPattern(form.exclude))) errors.exclude = "Pola tidak valid (bukan ekspresi reguler yang benar).";
    const wrong = parseList(form.akunSalah);
    if (wrong.length === 0) errors.akunSalah = "Isi minimal satu akun.";
    else if (wrong.some((account) => !ACCOUNT.test(account))) errors.akunSalah = "Akun atau awalan akun harus 2-6 digit, dipisah koma.";
    if (parseList(form.akunSalahKecuali).some((account) => !ACCOUNT.test(account))) errors.akunSalahKecuali = "Akun atau awalan akun harus 2-6 digit, dipisah koma.";
    if (!/^\d{6}$/.test(form.akunBenar.trim())) errors.akunBenar = "Akun benar harus 6 digit.";
    if (form.minUnitPrice.trim() && !POSITIVE_INT.test(form.minUnitPrice.trim())) errors.minUnitPrice = "Isi bilangan bulat tanpa titik.";
  }
  if (kind === "keyword") {
    const all = lines(form.all);
    if (all.length === 0) errors.all = "Pola uraian wajib diisi.";
    else if (all.some((pattern) => !validRegex(pattern))) errors.all = "Pola tidak valid (bukan ekspresi reguler yang benar).";
    if (lines(form.none).some((pattern) => !validRegex(pattern))) errors.none = "Pola tidak valid (bukan ekspresi reguler yang benar).";
    if (form.akunPrefix.trim() && !ACCOUNT.test(form.akunPrefix.trim())) errors.akunPrefix = "Awalan akun harus 2-6 digit.";
  }

  if (form.expType === "ganti_akun" && !/^\d{6}$/.test(effectiveGantiAkun(kind, form))) {
    errors[kind === "keyword_wrong_account" ? "akunBenar" : "expTo"] = "Akun tujuan harus 6 digit.";
  }
  if (form.expType === "turunkan_nilai") {
    if (!form.expMaxUnitPrice.trim() && !form.expMaxTotal.trim()) errors.expMaxTotal = "Isi batas harga satuan atau batas total.";
    for (const key of ["expMaxUnitPrice", "expMaxTotal"] as const) {
      if (form[key].trim() && !POSITIVE_INT.test(form[key].trim())) errors[key] = "Isi bilangan bulat tanpa titik.";
    }
  }
  if (form.expType === "manual" && !form.expInstruction.trim()) errors.expInstruction = "Isi instruksi untuk reviewer.";
  return errors;
}

export function buildParams(rule: Pick<RuleAdminDto, "kind" | "params">, form: RuleForm): Record<string, unknown> {
  const params: Record<string, unknown> = { ...rule.params };
  const setOptional = (key: string, value: unknown, empty: boolean) => {
    if (empty) delete params[key];
    else params[key] = value;
  };
  switch (rule.kind) {
    case "keyword_wrong_account":
      params.include = fromDisplayPattern(form.include);
      setOptional("exclude", fromDisplayPattern(form.exclude), !form.exclude.trim());
      params.akunSalah = parseList(form.akunSalah);
      setOptional("akunSalahKecuali", parseList(form.akunSalahKecuali), parseList(form.akunSalahKecuali).length === 0);
      params.akunBenar = form.akunBenar.trim();
      setOptional("minUnitPrice", Number(form.minUnitPrice), !form.minUnitPrice.trim());
      break;
    case "keyword":
      params.all = lines(form.all);
      setOptional("none", lines(form.none), lines(form.none).length === 0);
      setOptional("akunPrefix", form.akunPrefix.trim(), !form.akunPrefix.trim());
      break;
    case "value_check":
      params.condition = form.condition;
      break;
    case "blokir_history":
      params.onlyRevision = form.onlyRevision;
      break;
  }
  return params;
}

export function buildExpectation(kind: RuleKind, form: RuleForm): Expectation | null {
  switch (form.expType) {
    case "ganti_akun":
      return { type: "ganti_akun", to: effectiveGantiAkun(kind, form) };
    case "hapus_item":
      return { type: "hapus_item" };
    case "rinci_item":
      return { type: "rinci_item" };
    case "turunkan_nilai":
      return {
        type: "turunkan_nilai",
        ...(form.expMaxUnitPrice.trim() ? { maxUnitPrice: Number(form.expMaxUnitPrice) } : {}),
        ...(form.expMaxTotal.trim() ? { maxTotal: Number(form.expMaxTotal) } : {})
      };
    case "manual":
      return { type: "manual", instruction: form.expInstruction.trim() };
    default:
      return null;
  }
}

/** Only the fields that changed, or null when nothing changed. */
export function buildBody(rule: RuleAdminDto, form: RuleForm): UpdateRuleBody | null {
  const body: UpdateRuleBody = {};
  if (form.name.trim() !== rule.name) body.name = form.name.trim();
  if (form.category !== rule.category) body.category = form.category;
  if (form.reasonTemplate.trim() !== rule.reasonTemplate) body.reasonTemplate = form.reasonTemplate.trim();
  const note = form.validationNote.trim() || null;
  if (note !== rule.validationNote) body.validationNote = note;
  if (form.active !== rule.active) body.active = form.active;
  const params = buildParams(rule, form);
  if (JSON.stringify(sortKeys(params)) !== JSON.stringify(sortKeys(rule.params))) body.params = params;
  const expectation = buildExpectation(rule.kind, form);
  if (JSON.stringify(sortKeys(expectation)) !== JSON.stringify(sortKeys(rule.defaultExpectation))) body.defaultExpectation = expectation;
  return Object.keys(body).length === 0 ? null : body;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortKeys(item)]));
  }
  return value;
}
