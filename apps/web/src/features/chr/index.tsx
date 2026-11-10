import { ComingSoon } from "../../app/ComingSoon";

/** Nav target "CHR": list of CHR per eselon I, or a redirect to the current one. Route: /chr. */
export function ChrIndexPage() {
  return <ComingSoon title="CHR" />;
}

/** S6 · CHR Editor (AbBPt draf, gjkcp terkunci, G0gXnD dialog terbit). Route: /chr/:chrId. */
export function ChrEditorPage() {
  return <ComingSoon title="CHR Editor" />;
}

/** S7 · Cetak CHR A4 (Bko3K). Route: /chr/:chrId/cetak (no shell). */
export function ChrPrintPage() {
  return <ComingSoon title="Cetak CHR" />;
}
