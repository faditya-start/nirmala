/**
 * Evaluator aturan deteksi (docs/rule-catalog.md §2). Fungsi murni: tidak menyentuh database.
 * Parameter tiap jenis aturan didefinisikan di `@nirmala/shared` (`parseRuleParams`) dan divalidasi sebelum dipakai.
 *
 * Aturan menghasilkan flag (bukan skor): `{ matchedTerms, reason }`.
 */
import { parseRuleParams, type RuleKind, type RuleParamsByKind } from "@nirmala/shared";

export interface EngineRule {
  id: string;
  code: string;
  kind: RuleKind;
  params: Record<string, unknown>;
  reasonTemplate: string;
}

/** Bagian item yang dibaca aturan. */
export interface EngineItem {
  description: string;
  accountCode: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  blokirCode: string | null;
}

export interface EngineContext {
  /** Snapshot ini revisi (versi >= 2). `blokir_history` dengan `onlyRevision` hanya berlaku di sini. */
  isRevision: boolean;
  /** `KODE_BLOKIR` padanan item di snapshot sebelumnya; null bila tidak ada padanan atau tidak berblokir. */
  previousBlokirCode: string | null;
}

export interface RuleMatch {
  ruleId: string;
  code: string;
  /** Alasan yang sudah dirender dari template. */
  reason: string;
  /** Kata yang cocok pada uraian (huruf kecil, unik). Kosong untuk aturan nilai / blokir. */
  matchedTerms: string[];
}

export interface CompiledRule {
  rule: EngineRule;
  /** Mengembalikan kata yang cocok, atau null bila item tidak kena aturan. */
  test(item: EngineItem, context: EngineContext): string[] | null;
  /** Variabel yang boleh dipakai di template alasan. */
  variables(item: EngineItem): Record<string, string>;
}

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();
const startsWithAny = (value: string, prefixes: readonly string[]) => prefixes.some((prefix) => value.startsWith(prefix));
const regex = (pattern: string) => new RegExp(pattern, "i");

function firstMatch(pattern: RegExp, text: string): string | null {
  const found = pattern.exec(text);
  return found ? found[0].toLowerCase() : null;
}

/** Template alasan: `{akun}` = akun item, `{akun_benar}` = akun tujuan (bila aturan punya). Placeholder lain dibiarkan. */
export function renderReason(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => variables[name] ?? whole);
}

/**
 * Mengompilasi aturan (regex dibuat sekali). Mengembalikan null bila parameter tidak valid; aturan seperti itu
 * dilewati engine (parameter divalidasi saat disimpan, jadi ini hanya pengaman untuk data rusak).
 */
export function compileRule(rule: EngineRule): CompiledRule | null {
  const parsed = parseRuleParams(rule.kind, rule.params);
  if (!parsed.ok) return null;
  const noVariables = () => ({});

  switch (rule.kind) {
    case "keyword": {
      const params = parsed.data as RuleParamsByKind["keyword"];
      const all = params.all.map(regex);
      const none = (params.none ?? []).map(regex);
      return {
        rule, variables: (item) => ({ akun: item.accountCode }),
        test(item) {
          if (params.akunPrefix && !item.accountCode.startsWith(params.akunPrefix)) return null;
          const text = normalizeText(item.description);
          const terms: string[] = [];
          for (const pattern of all) {
            const term = firstMatch(pattern, text);
            if (term === null) return null;
            terms.push(term);
          }
          if (none.some((pattern) => pattern.test(text))) return null;
          return [...new Set(terms)];
        }
      };
    }
    case "keyword_wrong_account": {
      const params = parsed.data as RuleParamsByKind["keyword_wrong_account"];
      const include = regex(params.include);
      const exclude = params.exclude ? regex(params.exclude) : null;
      return {
        rule, variables: (item) => ({ akun: item.accountCode, akun_benar: params.akunBenar }),
        test(item) {
          if (!startsWithAny(item.accountCode, params.akunSalah)) return null;
          if (params.akunSalahKecuali && startsWithAny(item.accountCode, params.akunSalahKecuali)) return null;
          if (params.minUnitPrice !== undefined && item.unitPrice < params.minUnitPrice) return null;
          const text = normalizeText(item.description);
          const term = firstMatch(include, text);
          if (term === null || (exclude && exclude.test(text))) return null;
          return [term];
        }
      };
    }
    case "value_check": {
      const params = parsed.data as RuleParamsByKind["value_check"];
      return {
        rule, variables: noVariables,
        test(item) {
          switch (params.condition) {
            case "volume_zero_total_positive": return item.quantity === 0 && item.totalAmount > 0 ? [] : null;
          }
        }
      };
    }
    case "blokir_history": {
      const params = parsed.data as RuleParamsByKind["blokir_history"];
      return {
        rule, variables: noVariables,
        test(item, context) {
          if (params.onlyRevision && !context.isRevision) return null;
          return item.blokirCode || context.previousBlokirCode ? [] : null;
        }
      };
    }
  }
}

export function compileRules(rules: EngineRule[]): CompiledRule[] {
  return rules.flatMap((rule) => compileRule(rule) ?? []);
}

/** Satu item terhadap semua aturan yang sudah dikompilasi; hasil urut kode aturan. */
export function evaluateRules(compiled: CompiledRule[], item: EngineItem, context: EngineContext): RuleMatch[] {
  const matches: RuleMatch[] = [];
  for (const entry of compiled) {
    const terms = entry.test(item, context);
    if (terms === null) continue;
    matches.push({ ruleId: entry.rule.id, code: entry.rule.code, matchedTerms: terms, reason: renderReason(entry.rule.reasonTemplate, entry.variables(item)) });
  }
  return matches.sort((a, b) => a.code.localeCompare(b.code));
}
