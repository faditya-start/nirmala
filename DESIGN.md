---
name: NIRMALA
description: "Reviu RKA Pra-DIPA. A cold-neutral, graphite work tool for auditors who read dense tables for a week at a time."
colors:
  canvas: "#f2f4f6"
  surface: "#ffffff"
  surface-sunken: "#e7ebef"
  border: "#d3d9e0"
  border-strong: "#a9b3be"
  ink: "#14181c"
  ink-muted: "#3f4852"
  ink-faint: "#5a6571"
  graphite: "#22282e"
  on-graphite: "#ffffff"
  focus-blue: "#2563c9"
  sidebar: "#e6eaee"
  sidebar-active: "#ffffff"
  sidebar-line: "#cfd6dd"
  sidebar-ink-muted: "#46515c"
  draf-bg: "#e3e7eb"
  draf-fg: "#3f4852"
  draf-line: "#c3cad2"
  menunggu-bg: "#f5e6b0"
  menunggu-fg: "#6a4c00"
  menunggu-line: "#dcc574"
  verif-bg: "#d6e6fa"
  verif-fg: "#0f4a94"
  verif-line: "#a8c6ee"
  justif-bg: "#e3daf3"
  justif-fg: "#4d2c88"
  justif-line: "#c6b6e4"
  closed-bg: "#d1ead9"
  closed-fg: "#145733"
  closed-line: "#a3d3b5"
  flag-bg: "#f5d4cf"
  flag-fg: "#8c1b12"
  flag-line: "#e4a9a1"
  score-high: "#c5392b"
  score-mid: "#d5801f"
  score-low: "#3b8f5f"
typography:
  display:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.15
  headline:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  subtitle:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  body-large:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
  numeric:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "\"tnum\" 1"
  kpi:
    fontFamily: "Schibsted Grotesk Variable, Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1.2
rounded:
  sm: "2px"
  md: "4px"
  lg: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.on-graphite}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.ink-muted}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-sunken}"
  button-danger:
    backgroundColor: "{colors.flag-bg}"
    textColor: "{colors.flag-fg}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "32px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "34px"
  badge-status:
    backgroundColor: "{colors.draf-bg}"
    textColor: "{colors.draf-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "3px 8px"
  rule-chip:
    backgroundColor: "{colors.flag-bg}"
    textColor: "{colors.flag-fg}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  table-header:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    padding: "8px 12px"
  table-row-selected:
    backgroundColor: "{colors.verif-bg}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    width: "460px"
  sidebar:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.ink}"
    width: "248px"
    padding: "16px"
  sidebar-item-active:
    backgroundColor: "{colors.sidebar-active}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "34px"
---

# Design System: NIRMALA

Source of truth: the locked Pencil file `design/nirmala.pen` (frames E7nvf and qRTuO for tokens, cVL6Z / UApCm / SksK5 for components and shell). This document describes the shipped code in `apps/web/src/styles/tokens.css` and `apps/web/src/ui/`. If the two ever disagree, the Pencil frames win and the code is the bug.

## Overview

**Creative North Star: "The Audit Desk"**

A cold-neutral work surface with one graphite voice. Everything an auditor needs to read lies flat on the desk: white sheets on a pale blue-grey canvas, hairline borders, numbers in a monospaced face so columns line up. Nothing glows, nothing bounces, nothing is decorative. The look exists to disappear during a week of line-by-line reading, then become precise at the moments that matter: a flagged rule, a status that changed, a decision about to become part of an official document.

The palette is almost entirely greys with a faint steel-blue cast. Colour is reserved for meaning: five note statuses, risk score, and the red of "belum terpenuhi" and rule flags. Primary actions are graphite, not blue, so that colour keeps its job as a signal. The only saturated non-status colour is the focus blue, which only ever shows up when the keyboard lands somewhere or a row is selected.

Density is deliberate: 13 px body, 34 px controls, 10 x 12 px table cells. The interface assumes office desktops and long sessions. Public pages (P1, P2) share the same tokens but breathe more: a 1120 px column, 64 px between sections, 14 px body.

**Key Characteristics:**
- Cold neutral greys with a blue cast, never warm, never cream. Explicitly rejected: serif display type, cream paper, warm editorial palettes.
- Graphite (not blue) is the primary action colour.
- Colour carries meaning only: status, score, error, focus. It is never decoration.
- Status is never colour alone: every badge pairs a tinted fill with an icon and a word; selection pairs a tint with a left line and a check.
- Flat. Depth comes from tone (canvas, surface, sunken) and 1 px borders. Shadows appear only on floating layers.
- Light and dark are equal citizens, built from the same token names.

## Colors

A grey scale with a steel-blue undertone, plus three semantic families (status, score, focus). All values are CSS custom properties; light is the default, dark follows `prefers-color-scheme` or `<html data-theme="dark">`. Names below are the Pencil variable names; frontmatter keys are descriptive slugs of the same values.

### Primary
- **Graphite** (`--primary`, #22282e light / #e8ebee dark): Primary buttons, the monogram, selected tab counts, the "Perlu tindakan" count badge, filled checkbox and switch. In dark mode it flips to near-white so the primary button stays the strongest object on the page. Hover is `--ink-muted`.

### Secondary
- **Focus Blue** (`--focus`, #2563c9 light / #7faef5 dark): The keyboard focus ring (2 px, 2 px offset), input focus edge, and the 3 px left line of a selected table row. It is never a button fill and never decorative.

### Neutral
- **Canvas** (`--bg`, #f2f4f6): Page background behind everything.
- **Sheet** (`--surface`, #ffffff): Tables, cards, dialogs, header bar, inputs.
- **Sunken** (`--surface-sunken`, #e7ebef): Table header, hover row, disabled controls, dialog summary box, progress track.
- **Hairline** (`--border`, #d3d9e0): Row dividers, card outlines, header and footer rules.
- **Strong Hairline** (`--border-strong`, #a9b3be): Input, select and secondary-button outlines, dialog outline, switch track off.
- **Ink** (`--ink`, #14181c): Primary text, KPI numerals, active tab.
- **Ink Muted** (`--ink-muted`, #3f4852): Table headers, secondary text, hints.
- **Ink Faint** (`--ink-faint`, #5a6571): Placeholder, disabled text, separators. Still 5.9:1 on white; it is faint by role, not by contrast.
- **Sidebar** (`--sidebar`, #e6eaee / dark #0c0f12): The app sidebar is a slightly darker tone than the canvas in light and the deepest tone in dark. It has its own ink and line tokens (`--sidebar-ink-muted`, `--sidebar-active`, `--sidebar-line`).

### Status families
Each family has `-bg`, `-fg`, `-line` and is used as a bordered tinted pill with an icon.
- **Draf** (grey): #e3e7eb / #3f4852 / #c3cad2.
- **Menunggu Revisi** (amber): #f5e6b0 / #6a4c00 / #dcc574.
- **Perlu Verifikasi** (blue): #d6e6fa / #0f4a94 / #a8c6ee. Also the selected-row fill and text selection.
- **Dijustifikasi** (violet): #e3daf3 / #4d2c88 / #c6b6e4.
- **Closed** (green): #d1ead9 / #145733 / #a3d3b5. Also "terpenuhi".
- **Flag / warn** (red): #f5d4cf / #8c1b12 / #e4a9a1. Rule chips, "belum terpenuhi", form errors, destructive buttons.

### Score
- **Score High / Mid / Low** (#c5392b / #d5801f / #3b8f5f; dark #e8695c / #e39a47 / #5db583). Only ever painted as a 3 x 18 px marker beside the number and a word (tinggi >= 70, sedang >= 35, rendah). Never as a text colour or a fill.

### Dark palette (same token names)
| Token | Dark |
|---|---|
| `--bg` / `--surface` / `--surface-sunken` | #111418 / #181c21 / #20252b |
| `--border` / `--border-strong` | #2f353c / #566069 |
| `--ink` / `--ink-muted` / `--ink-faint` | #e8ebee / #aeb6bf / #929ba5 |
| `--sidebar` / `--sidebar-active` / `--sidebar-line` | #0c0f12 / #20252b / #232930 |
| status bg / fg | deep tinted bg (e.g. #3a3216) with light fg (e.g. #ebcf70) |

### Named Rules
**The Signal-Only Rule.** Colour is information. A hue appears on screen only when it encodes status, score, error or focus. If you are reaching for a colour to make a screen livelier, stop.

**The Not-Colour-Alone Rule.** Every state expressed by colour also has an icon, a word or a shape (left line, check, marker). A greyscale screenshot must still be readable.

**The Token-Only Rule.** No hex, rgb or hsl outside `styles/tokens.css`. Both dark blocks in that file are identical by design: edit both.

## Typography

**UI Font:** Schibsted Grotesk Variable (self-hosted via @fontsource, fallback system-ui)
**Numeric / Code Font:** IBM Plex Mono 400 / 500 / 600 (fallback ui-monospace)

**Character:** A slightly condensed, clear grotesk for reading and a technical mono for anything that is counted, coded or compared. Two families, no serif, no third voice.

### Hierarchy
- **Display** (600, 40 px `--fs-3xl`, 1.15): Public hero headline only.
- **Headline** (600, 28 px `--fs-2xl`, 1.2): Page titles in the app (`PageHeader`) and public section titles.
- **Title** (600, 20 px `--fs-xl`, 1.3): Section titles, the empty-state page variant.
- **Subtitle** (600, 16 px `--fs-lg`, 1.3): Dialog titles, empty-state card titles, public body.
- **Body large** (400, 14 px `--fs-md`): Public body, rule names, sidebar brand name.
- **Body** (400, 13 px `--fs-base`): The app default: tables, inputs, buttons, nav. Long paragraphs use line-height 1.5 to 1.55.
- **Label** (500, 12 px `--fs-xs`): Field labels, table headers, badges, hints, footers. This is the floor: no text under 12 px.
- **KPI numeral** (500, 30 px, 1.2): Large figures in KPI cards.
- **Numeric** (IBM Plex Mono, tabular): Money, counts, codes, dates in columns. Use the `.num` class.

### Named Rules
**The Sentence-Case Rule.** Labels, headers and buttons are sentence case in formal, plain Indonesian. No uppercase transforms, no letter-spaced caps (the wordmark "NIRMALA" is typed in caps and is the only letter-spaced text).

**The Tabular Rule.** Anything a reviewer will scan down a column or compare across rows (rupiah, counts, percentages, codes R01 to R08, dates) is mono with tabular figures and right-aligned in tables. Format with `lib/format.ts` (id-ID).

**The Floor Rule.** 12 px is the minimum size. If something does not fit at 12 px, change the layout.

## Layout

Desktop first at 1024 px and up; the app is built for office monitors. App shell: a sticky 248 px sidebar, a sticky 56 px header (breadcrumb on the left, "Perlu tindakan" on the right), then content with 32 px padding (24 x 16 below 1024 px). Public shell: a 63 px header and a centred 1120 px container (160 px gutters at 1440; 16 px at 390), 64 px between sections (32 px on mobile), 72 px top padding.

Spacing is a 4 px scale (`--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 24, `--sp-6` 32, `--sp-7` 48). Common rhythm: 8 px between filter controls, 12 px inside card stacks, 16 px card padding, 24 px dialog padding. Control heights: 34 px fields, 30 px filter controls, 32 px buttons (28 px small).

Responsive: below 1024 px the sidebar becomes a left drawer opened from a menu button in the header. Below 640 px the public nav hides and the footer stacks. Internal screens are not designed for phones; public screens P1 and P2 are, at 390 px.

### Named Rules
**The Dense-Not-Cramped Rule.** Tables are dense (10 x 12 px cells, one line per row where possible, long text truncated with a `title`), but cards and dialogs keep 16 to 24 px of padding. Density lives in rows, calm lives around them.

## Elevation & Depth

Flat by default, tonal layering instead of shadows. Canvas (`--bg`) sits behind white sheets (`--surface`); recessed things (table header, hover row, summary box, disabled fields) go one step darker (`--surface-sunken`); separation is a 1 px `--border`. Shadows exist only for layers that float above the page.

### Shadow Vocabulary
- **Floating** (`box-shadow: 0 8px 12px var(--shadow)`; `--shadow-md`): Dialog, needs-action popover, the open drawer.
- **Small** (`box-shadow: 0 4px 6px var(--shadow)`; `--shadow-sm`): Reserved for small floating pieces such as tooltips.
- **Overlay** (`--overlay`, #14181c at 70% light / black at 70% dark): Dialog backdrop and drawer scrim.

### Named Rules
**The Float-Only Rule.** A shadow means "this sits above the page". Cards, tables and KPI blocks never get one.

## Shapes

Square and quiet. Controls, badges and buttons use a 4 px radius (`--r-md`); small chips and checkboxes 2 px (`--r-sm`); dialogs and popovers 8 px (`--r-lg`). Pills (`--r-pill`) are only for count bubbles in tabs and the "Perlu tindakan" badge. Tables, cards and evidence blocks have no radius at all: they are sheets. Emphasis is by a straight line, not a curve: a 2 px black rule above a KPI, a 3 px red rule above a rule card, a 3 px blue line on a selected row, a 3 px marker beside a score.

### Named Rules
**The Straight-Line Rule.** Hierarchy and state are drawn with thin straight rules and the radius scale above. No side-stripe accents wider than 3 px, no gradients, no glass.

## Components

Every component lives in `apps/web/src/ui/` as a CSS module, imported from `ui/index.ts`. Motion is state feedback only, on three tokens: `--dur-fast` 100 ms (hover, press, row and tab colour), `--dur-base` 140 ms (popover, notice, switch), `--dur-slow` 180 ms (dialog, drawer), all with `--ease-out` (cubic-bezier(0.22, 1, 0.36, 1)). Dialog and popover enter with a fade and a 4 to 6 px rise; the drawer slides; closing is instant. Press is one tone darker than hover with no movement. Focus appears instantly. Under `prefers-reduced-motion` everything is instant and busy spinners breathe (opacity pulse) instead of rotating.

**The Operate-Motion Rule.** Animate colour, opacity and short transforms to explain a change of state. Never animate layout, never loop decoration, never delay a control.

### Buttons
- **Shape:** 4 px radius, 32 px high (28 px small), 13 px / 500, 14 px side padding, 6 px icon gap.
- **Primary (utama):** Graphite fill, white text. Hover lightens to `--ink-muted`. One per view area.
- **Secondary (sekunder, default):** White fill, 1 px `--border-strong`, ink text. Hover goes sunken.
- **Ghost:** Transparent; hover goes sunken. For low-priority actions and icon buttons.
- **Danger (bahaya):** `--st-flag-bg` fill, flag text and line; hover darkens the line. Used for dismiss and destructive confirms.
- **Disabled (nonaktif):** Same shape, sunken fill, faint text, no border, `not-allowed` cursor.
- **Loading:** 14 px spinner replaces the icon; the button stays the same width and is disabled.
- **IconButton:** square, ghost, required `label` (aria-label plus tooltip).

### Inputs / Fields
- **Style:** 34 px, 1 px `--border-strong`, 4 px radius, white fill, 10 px inline padding. Label above (12 px / 500), hint or error below (12 px). Required is marked with a muted "(wajib)" word rather than a red asterisk.
- **Hover:** border darkens to ink. **Focus:** focus-blue border plus the global ring.
- **Error:** flag-fg border and an icon-led message in flag-fg. **Disabled:** sunken fill, faint text.
- **Select:** native select with a 32 px right gutter and a chevron; placeholder state is faint.
- **Checkbox / Switch:** 16 px square with 2 px radius, graphite when checked or indeterminate; switch is 36 x 20 with a 16 px knob (role switch, 150 ms).

### Badges and chips
- **Status badge:** 4 px radius, 1 px line, tinted fill, icon plus word, 12 px / 500. Statuses: draf, menunggu_revisi, perlu_verifikasi, dijustifikasi, closed, flag, siap_diajukan. Check results and decisions use the same shape (belum terpenuhi is red, data tidak cukup and item tidak ditemukan are grey outline / sunken).
- **Score badge:** a 3 x 18 px colour marker, the number in 14 px / 600 and a word (tinggi, sedang, rendah).
- **Rule chip:** red-tinted 2 px radius, code in mono 600 (R01 to R08). **Tag chip:** sunken fill, muted text.

### Tables
- **Frame:** white with 1 px border, no radius. Header sunken, 12 px / 500 muted text, 1 px strong rule below.
- **Rows:** 10 x 12 px cells, 1 px hairline between, hover sunken. Clickable rows get `tabindex`, Enter, and a focus outline inset 2 px.
- **Selected:** blue-tinted fill, 3 px inset left line in focus blue, and a check mark in the first cell. Never colour alone.
- **Sortable header:** a plain button with an arrow icon. **Numeric cells:** mono, tabular, right-aligned.
- **Pagination:** footer inside the frame: "Menampilkan x-y dari z noun" left, 26 px page buttons right.

### Filters
A wrapping row of 30 px controls with 8 px gap: a 260 px search field with a leading icon, selects that read "Label: Nilai" with a chevron, a flexible spacer, and a plain count summary. Same hover, focus and border behaviour as fields.

### Tabs
Underline tabs with a 1 px baseline, 20 px between, 2 px ink underline on the active tab (600 weight). Count bubbles are pills: sunken when inactive, graphite when active. Arrow, Home and End keys move between tabs.

### Cards and blocks
- **KPI card:** a 2 px ink rule on top, 12 px label, 30 px value, optional hint and a 4 px progress bar. No border box.
- **Rule card:** white card with 3 px red top rule, mono code chip, name, reason and a definition list (120 px term column).
- **Factor row / Score breakdown:** code, name, value x weight, 4 px bar and one-line explanation; not applicable shows a grey "N/A" pill.
- **Evidence card:** header, before and after rows (changed rows sunken, unchanged flagged red), and a muted footnote.
- **Timeline:** vertical list with a dot per event, time in mono, description in muted ink.
- **Empty state:** card (white, strong border, 40 x 24 padding) or page (96 px vertical). A 44 px outlined icon box, 16 or 20 px title, 360 to 420 px max description and an optional action.

### Dialog
Native `<dialog>`: 460 px (640 px for forms), 8 px radius, strong border, floating shadow. A 36 px icon box, 16 px / 600 title, muted 1.55 description, optional mono summary box, then a right-aligned footer separated by a hairline. Escape and backdrop close it unless a request is running (`busy`).

### Navigation
- **Sidebar:** 248 px, 16 px padding, 16 px gap. Brand (30 px graphite monogram "N", wordmark, tagline), cycle picker (bordered box with "Siklus aktif", name, ADK countdown and a native select overlaid), grouped nav with 12 px headings, 34 px items with 16 px icons. Active item is a white chip with weight 500; count badges are small 2 px-radius boxes. User footer: 32 px initials avatar, name, role and unit, logout icon button.
- **Header:** 56 px, white, hairline below. Breadcrumb left (last item is the current page), "Perlu tindakan" button right with a pill count and a 320 px popover list.
- **Public header:** brand left, text links, current page underlined 2 px with an 8 px offset (also bold), so it is not colour alone.

## Do's and Don'ts

### Do:
- **Do** use tokens for every colour, size, space and radius. Open `styles/tokens.css` before writing a value.
- **Do** pair every status colour with an icon and a word; show selection with the left line and check.
- **Do** put money, counts, codes and dates in `.num` (IBM Plex Mono, tabular) and format with `lib/format.ts`.
- **Do** keep copy in formal, plain Indonesian; keep official terms (Satker, Unor, CHR, Pra-DIPA, UKI, RKA, ADK). Flag risk for review; never accuse.
- **Do** show an explicit state for loading, empty, error and no-access in every data view, and truncate long text with a `title`.
- **Do** keep the 2 px focus ring on every focusable element, in both themes.
- **Do** design light and dark together; test both.
- **Do** use motion only to explain a change of state (dialog, popover, drawer, hover, press), 100 to 200 ms, and respect `prefers-reduced-motion`.

### Don't:
- **Don't** use serif type, cream or warm backgrounds, or any warm editorial look. They were tried and rejected.
- **Don't** make primary actions blue or brand-coloured. Graphite is the primary; blue is focus and selection.
- **Don't** use colour as the only carrier of meaning, and don't use red for anything that is not a flag, error, or destructive action.
- **Don't** add shadows to cards or tables, gradients, glass, hero metrics, or decorative icons.
- **Don't** set text under 12 px, uppercase labels, or letter-spaced captions.
- **Don't** put emphasis in coloured side stripes thicker than 3 px, and don't round tables or cards.
- **Don't** invent new components or tokens in a feature. Build locally and ask for promotion into `ui/`.
- **Don't** put real Satker names or item values in mocks, screenshots, docs or examples.
