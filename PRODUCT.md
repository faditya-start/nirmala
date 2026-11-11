# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: Reviewer** (Itjen, Biro PAKLN, Biro Keuangan Kemen PU). Government auditors who review RKA drafts line by line before the budget is approved. They work in an intense window of about one week per review stage, close to the ADK deadline to Kemenkeu (around the 10th to 12th), on office desktops, in long sessions over dense tables. Their job: find the RKA items that deserve a note, decide confirm or dismiss, write and publish the CHR, then verify that Satker's fixes actually happened.

**Secondary:**
- **PIC UKI eselon I**: coordinates follow-up across up to ~219 Satker, needs to see who has not moved, files justifications on behalf of Satker, fills the eselon I response in the CHR.
- **Pimpinan** (Irjen, Kepala Biro): reads dashboards and reports.
- **Admin**: manages users, eselon I access, rule catalog, score weights, cycles, audit log.
- **Public**: reads aggregate process metrics only, and only after the DIPA is issued.
- **Satker**: optional in the pilot, no dedicated role yet.

## Product Purpose

NIRMALA supports RKA review (reviu) for APIP and planning units in the Pra-DIPA phase. It prioritizes risky RKA items with explainable rules and a 0-100 score, then carries every CHR note through to Satker's fix being verified, before the budget is approved. Success: review finishes by H-3 before the ADK deadline, and auditor work shifts from searching to confirming.

## Positioning

The wedge is not detection, it is the missing verification step. Today no one re-checks Satker's revisions against CHR notes per item; the Itjen PU review guideline (SE Irjen PU 02/SE/Ij/2024) hands that responsibility to the eselon I unit. NIRMALA closes the loop with per-item evidence (before → after), which is also the answer when BPK asks. CHR is not recorded in SAKTI, so NIRMALA becomes its system of record. It is a preventive internal control that acts before approval, unlike Nemesis (external, public procurement data) or the reactive current SIPEKA.

## Operating Context

- Review cycle = budget year + stage (pagu / alokasi) + ADK deadline + DIPA issue date. Two stages per budget year.
- Data in via file import: SIPEKA-format CSV per eselon I (`es1_<BAES1>_<year>.csv`), first as snapshot "Awal", then "Revisi"; idempotent by file hash. SAKTI has no official API.
- Satker fixes happen in SAKTI, outside NIRMALA.
- One CHR per eselon I per stage, containing many notes. Publishing locks the document; changes become new versions in an audit log.
- Hosting: own server through Cloudflare Tunnel; SQLite + Drizzle for the MVP.

## Capabilities and Constraints

- Detection is rule-first: 8 explainable rules (R01-R08) plus a 5-factor score (F1-F5) used for ranking. Every flag shows the rule or reason that triggered it. No LLM or embeddings in the MVP.
- Note statuses (source of truth is the note, not the CHR document): Draf, Menunggu Revisi, Perlu Verifikasi, Dijustifikasi, Closed.
- Hard rule: the system never closes a note itself. Automatic check results are only proposals; the reviewer closes.
- Structured expectations per note: `ganti_akun`, `hapus_item`, `turunkan_nilai`, `rinci_item`, `manual`. Check results: terpenuhi, belum terpenuhi, data tidak cukup, item tidak ditemukan.
- Dismiss requires a reason category (feeds a feedback corpus). Confirm adds the item to the CHR draft.
- Access is scoped per eselon I. Roles: Reviewer, PIC UKI, Pimpinan, Admin.
- Notifications are in-app only (badge / "needs action" list) in the MVP.
- Public layer: process metrics only (notes per eselon I × category, closure rate), never items, Satker names or rupiah per item; small eselon I merged to prevent tracing; only for cycles whose DIPA is issued. Final limit still to be confirmed with PPID Kemen PU.
- Fase 2 (Revisi POK) and Fase 3 (early warning for RAB drafters) reuse the same engine; out of MVP scope.
- Undecided: full CHR checklist A-P (Formulir H), Itjen response, DOCX export, SBM price tables, historical CHR/LHR availability, real CSV column structure of SAKTI export.

## Brand Commitments

- Product name **NIRMALA** is fixed. The expansion of the acronym is open: the word "Laporan" is considered a poor fit (RKA is a plan, not a report) and may be replaced with another word starting with L.
- UI text is in formal, plain Indonesian (Bahasa Indonesia baku). Official terms stay as they are: Satker, Unor, CHR, Pra-DIPA, UKI, RKA, ADK.

## Evidence on Hand

- Locked docs in `docs/`: concept-brief, mvp-scope, data-analysis, rule-catalog, data-model, plan.
- `data/private/` holds real Kemen PU data (gitignored). Use aggregates only in anything shown or committed; demo and seed data must be synthetic. Never place real Satker names or item-level values in design mocks, screenshots, fixtures or docs.
- Not available: a real anonymized CHR sample, historical CHR/LHR in digital form, volume figures, any real user testimonials or adoption numbers. Do not fabricate them.

## Product Principles

1. **Explainable over clever.** Every flag points to a rule or reason a reviewer can state in an official note.
2. **Humans hold consequential decisions.** The system proposes; reviewers confirm, dismiss and close.
3. **Evidence per item.** Show before → after proof for each note, defensible when BPK asks.
4. **Fast for the one-week crunch.** Optimize dense triage and verification for auditors working against the ADK deadline.
5. **Flag risk, do not accuse.** The product marks risks for human review; the framing is inefficiency and follow-through, not fraud.

## Accessibility & Inclusion

No product-specific standard was established. Default to WCAG AA contrast and keyboard operability for dense, long-session table work; status must not rely on color alone.
