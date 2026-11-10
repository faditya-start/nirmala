import type { NoteCategory } from "@nirmala/shared";

/** Long category names (select options, charts). */
export const CATEGORY_LABEL: Record<NoteCategory, string> = {
  AKUN: "Ketepatan akun",
  EFISIENSI: "Efisiensi belanja",
  SATUAN_BIAYA: "Satuan biaya",
  LAINNYA: "Lainnya"
};

/** Short chip names used in the rule table (bOLIA). */
export const CATEGORY_CHIP: Record<NoteCategory, string> = {
  AKUN: "Akun",
  EFISIENSI: "Efisiensi",
  SATUAN_BIAYA: "Satuan biaya",
  LAINNYA: "Lainnya"
};

export const STAGE_LABEL = { pagu: "Pagu anggaran", alokasi: "Alokasi anggaran" } as const;

/** Audit codes as shown in the design (mono, snake_case). Unknown codes fall back to the raw code. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "auth.login": "masuk",
  "auth.login_failed": "gagal_masuk",
  "user.created": "buat_pengguna",
  "user.updated": "ubah_pengguna",
  "user.role_changed": "ubah_peran",
  "user.scopes_changed": "ubah_akses_eselon",
  "user.activated": "aktifkan_pengguna",
  "user.deactivated": "nonaktifkan_pengguna",
  "cycle.created": "buat_siklus",
  "cycle.updated": "ubah_siklus",
  "cycle.deleted": "hapus_siklus",
  "cycle.dipa_issued": "tandai_dipa_terbit",
  "cycle.dipa_retracted": "tarik_dipa_terbit",
  "public_metrics.generated": "buat_agregat_publik",
  "snapshot.imported": "impor_snapshot",
  "item.confirmed": "konfirmasi_item",
  "item.dismissed": "dismiss_item",
  "item.decision_reverted": "batalkan_keputusan",
  "rule.updated": "ubah_aturan",
  "rule.toggled": "ubah_status_aturan",
  "risk_config.created": "buat_bobot_skor",
  "risk_config.recalculated": "hitung_ulang_siklus",
  "chr.created": "buat_chr",
  "chr.note_created": "buat_catatan",
  "chr.note_updated": "ubah_catatan",
  "chr.note_deleted": "hapus_catatan",
  "chr.recommendation_updated": "ubah_rekomendasi",
  "chr.issued": "terbit_chr",
  "chr.unit_response_updated": "tanggapan_unit",
  "chr.addendum_added": "tambah_addendum",
  "chr.completed": "selesai_chr",
  "note.checked": "cek_catatan",
  "note.approved": "setujui_catatan",
  "note.returned": "kembalikan_catatan",
  "note.justified": "justifikasi_catatan",
  "note.justification_accepted": "terima_justifikasi"
};

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  user: "pengguna",
  review_cycle: "siklus",
  rka_document: "snapshot",
  rka_item: "item",
  chr_document: "chr",
  chr_note: "catatan",
  rule: "aturan",
  risk_config: "bobot skor",
  public_metrics: "agregat publik"
};

export const auditActionLabel = (code: string): string => AUDIT_ACTION_LABEL[code] ?? code;
export const auditEntityLabel = (code: string): string => AUDIT_ENTITY_LABEL[code] ?? code;
