# NIRMALA web (apps/web)

React 19 + Vite + react-router 7. Visual source of truth is the Pencil file `design/nirmala.pen`
(node map in `design/SCREENS.md`). UI copy is formal, plain Indonesian.
The visual system is written down in `DESIGN.md` at the repo root (tokens, type scale, components, do and don't): read it before adding UI.

```
npm run dev -w @nirmala/web                 # proxies /api to the API on :8787
VITE_MOCK=1 npm run dev -w @nirmala/web     # no API needed: requests are answered by mocks
```

Mock mode starts signed in as `reviewer`. Open `?as=uki|leader|admin|reviewer` to switch role, or sign in
with username `reviewer`, `uki`, `pimpinan` or `admin` and any password. Dev catalogue of every component:
`/dev/komponen` (dev server only; `?theme=dark` forces dark).

## Layout

```
src/
  main.tsx              fonts, tokens, mock bootstrap, render <App/>
  styles/tokens.css     every Pencil variable as a CSS custom property (light, dark, [data-theme])
  styles/base.css       reset, focus ring, .num / .mono helpers, .sr-only, .skip-link
  lib/                  api.ts (client), mock.ts (+ mock-defaults, mock-loader), format.ts, roles.ts, types.ts, storage.ts
  ui/                   component library (CSS modules). Import from "../../ui"
  shells/               AppShell (sidebar + header), PublicShell
  app/                  routes.tsx (THE route table), nav.ts, App.tsx, auth.tsx, cycle.tsx, needsAction.tsx (needs-action + nav-counts), breadcrumb.tsx
  features/<fitur>/     index.tsx (+ optional mock.ts). One folder per feature agent
  dev/                  component catalogue (dev only)
```

## Add or build a feature

Every screen in `design/SCREENS.md` already has a route in `app/routes.tsx` that lazy-loads
`features/<fitur>/index.tsx` and renders a "Belum dibangun" placeholder. To build a screen, edit **only** your
`features/<fitur>/` folder:

1. Replace the placeholder component exported from `features/<fitur>/index.tsx` (keep the export name).
   Split into more files inside the folder as needed.
2. Fetch with `api.get<T>("/path", { query })`, `api.post(...)`. Paths are relative to `/api`.
3. Use `useAuth()` (`user` with `unitLabel` and `scopeOrganizationUnitIds`, plus `organizationUnits`), `useCycle()` (`active.id` is the selected cycle), `useNeedsAction()` when needed. After an action that changes a queue (confirm, close, publish), call `useNeedsAction().refresh()` so the header and sidebar counts update.
4. Compose from `ui/`. Do not write colors, font sizes or radii: use tokens (see rules below).
5. Detail pages can replace the header breadcrumb with `usePageBreadcrumb([...])` from `app/breadcrumb`.
6. Ship a `features/<fitur>/mock.ts` (below) so the screen works with `VITE_MOCK=1`.

Never edit `app/routes.tsx`, `ui/`, `shells/`, `lib/` or `styles/` from a feature branch. If you need a new
route, shared component or token, ask the foundation owner (the table is deliberately single-owner).

### Route table

`AppRoute = { path, component, shell: "app" | "public" | "none", title, roles?, auth?, devOnly? }`.

- `shell: "app"` requires login and wraps the page in the sidebar/header. `"public"` uses the public header and
  footer. `"none"` is bare (login, print view, dev catalogue).
- `roles` restricts access. Not signed in goes to `/login` (and returns after login). Wrong role renders
  "Akses ditolak" (JD30D) inside the shell. Route access follows `mvp-scope.md` section 5 matrix; sidebar
  visibility (`app/nav.ts`) is narrower and role based.
- `title` is the breadcrumb tail, document title and the access-denied message.

## Mock mode

`VITE_MOCK=1` makes `lib/api.ts` answer from handlers instead of the network. `main.tsx` loads
`lib/mock-defaults.ts` (auth/me, cycles, needs-action, nav-counts, all shaped like `docs/api-contract.md` 3.1) and every `features/*/mock.ts` before rendering.
Mocks are not loaded in normal builds.

```ts
// features/triage/mock.ts
import { ApiError } from "../../lib/api-error";
import { registerMock, respond } from "../../lib/mock";

registerMock("GET", "/triage/items", ({ query }) => ({ items: [], total: 0, page: Number(query.page ?? 1) }));
registerMock("GET", "/triage/items/:id", ({ params }) => ({ id: params.id }), { delay: 400 });
registerMock("POST", "/triage/items/:id/dismiss", ({ body }) => {
  if (!(body as { reason?: string }).reason) throw new ApiError(422, "Kategori alasan wajib dipilih.");
  return respond(204);
});
```

- Handler gets `{ method, path, params, query, body }`; return data for 200, `respond(status, data)` for others,
  or throw `ApiError` to inject an error.
- Options: `{ delay: ms | [min, max], fail: { status, message?, probability? } }`. Default delay 120-280 ms.
- Add `?__fail=500` to any request path to force an error. In the browser console:
  `__nirmalaMock.failNextMockRequest(500)`, `__nirmalaMock.setMockDelay(2000)`.
- Later registrations of the same method and path win, so a feature can override a default.
- All mock data must be synthetic. Never put real Satker names or item values in a mock.

## Shell data

The shell calls `GET /auth/me` (`MeResponse`: user with `unitLabel`, `scopeOrganizationUnitIds`; and `organizationUnits`),
`GET /cycles`, `GET /needs-action` (`NeedsActionResponse`, header popover) and `GET /nav-counts` (`NavCountsResponse`,
sidebar badges for Risk Triage and Smart Tracker). Needs-action and nav-counts are sent with the active `cycleId`,
refresh every 60 s, on window focus and when a feature calls `useNeedsAction().refresh()`. A failed count request hides
that badge; it never blocks the shell. `POST /auth/login` answers with the short `SessionUser`; the provider then reads
`/auth/me` to fill in the rest.

## API client

`api.get/post/put/patch/delete` (`credentials: "include"`, JSON). Non-2xx throws `ApiError { status, message, payload }`
where `message` is the server's `error` string. Requests time out after 60 s (`{ timeoutMs }`, 0 = never, for long uploads) and a 2xx
answer that is not JSON (proxy or SPA fallback page) throws `ApiError(502)`. `errorMessage(err)` gives presentable text. A 401 clears the session
(AuthProvider) and the route guard redirects to `/login`; pass `{ skipUnauthorized: true }` for calls where 401 is an
expected answer (login).

## Tokens and styling rules

- Colors, type scale, spacing and radii come from `styles/tokens.css` (`var(--ink)`, `var(--st-closed-bg)`,
  `var(--fs-base)`, `var(--sp-4)`, `var(--r-md)`). No hex values outside that file.
- Dark mode: `prefers-color-scheme: dark`, or force with `<html data-theme="light|dark">`.
- Text floor is 12 px. Labels are sentence case (no uppercase transform).
- Money, counts, codes and other numeric columns use the `num` class (IBM Plex Mono, tabular figures) and
  `lib/format.ts` (`formatNumber`, `formatDate`, ...).
- Status is never color alone: every badge has an icon and text; selected rows have a left line and a check.
- Focus ring is global (`:focus-visible`, 2 px `--focus`, 2 px offset). Do not remove outlines.
- Component styles are CSS modules (`*.module.css`) next to the component.
- Fonts are self-hosted through `@fontsource` (Schibsted Grotesk variable, IBM Plex Mono 400/500/600).

## Components (`import { ... } from "../../ui"`)

| Component | Props (summary) |
|---|---|
| `Button`, `ButtonLink` | `variant` utama / sekunder (default) / ghost / bahaya, `size` md / sm, `icon`, `iconRight` (lucide), `loading`; `disabled` = Nonaktif. ButtonLink takes `to` |
| `IconButton` | `icon`, `label` (required, aria-label + tooltip), `pressed`, `disabled` |
| `Input`, `Select`, `Textarea` | `label`, `hint`, `error`, `hideLabel`, `required`, `className` (wrapper), native props. Select also `placeholder`, `options` or `<option>` children. `invalid` + `describedBy` mark a field red and link it to an external message, for two fields that share one error line: render `<FieldError id="x">` under the pair and pass `describedBy="x"` to both |
| `Checkbox` | `label`, `indeterminate`, native input props |
| `Switch` | `checked`, `onCheckedChange`, `label` (role switch) |
| `Tabs`, `TabPanel` | `tabs [{value,label,count}]`, `value`, `onChange`, `idPrefix`, `label`; arrow/Home/End keys |
| `StatusBadge` | `status`: draf, menunggu_revisi, perlu_verifikasi, dijustifikasi, closed, flag, siap_diajukan; `children` overrides label |
| `CheckResultBadge` | `result`: terpenuhi, belum_terpenuhi (red), data_tidak_cukup, item_tidak_ditemukan |
| `DecisionBadge` | `decision`: belum_ditinjau, draf_di_chr, dismiss |
| `ScoreBadge` | `score` 0-100 (tinggi >= 70, sedang >= 35), optional `category` |
| `RuleChip`, `TagChip` | `code` (R01..R08) / `children` |
| `TableFrame`, `Table`, `THead`, `TBody`, `Th`, `Tr`, `Td` | Th: `align`, `width`, `sort` + `onSort`. Tr: `selected`, `onActivate`. Td: `align`, `numeric`, `width`. Helpers `CellTitle`, `CellEmpty`, `SelectedMark` |
| `Pagination` | `page`, `pageSize`, `total`, `onPageChange`, `noun`. Numbered pages, for short lists |
| `Pager` | "Menampilkan 1-11 dari 12.702 item" + "Halaman x dari y" + Sebelumnya / Berikutnya (frame oHui1), for very long lists. `page`, `pageSize`, `total`, `pageCount?`, `onPageChange`, `noun` |
| `FilterBar`, `FilterSearch`, `FilterSelect`, `FilterSpacer`, `FilterSummary` | Search: `value`, `onChange`, `placeholder`. Select: `label`, `value`, `onChange`, `options` |
| `KpiCard`, `ProgressBar` | `label`, `value`, `hint`, `progress` (0-1) / `value` (0-1), `label` |
| `RuleCard` | `code`, `name`, `category`, `reason`, `details [{label,value,mono}]` |
| `FactorRow`, `ScoreBreakdown` | `code`, `name`, `value`, `weight`, `contribution?`, `explanation`, `na` / `title`, `score`, children |
| `EvidenceCard`, `EvidenceRow` | Card: `title`, `result`, `footnote`. Row: `field`, `state` berubah / tetap / tidak_berubah, `before`, `after`, `value`, `tag` (replaces the default Berubah/Tetap badge), `hideTag` |
| `Timeline`, `TimelineItem` | `title`, `time`, `description`, `tone`, `pending`, `last` |
| `Dialog`, `ConfirmDialog` | Dialog: `open`, `onClose`, `title`, `icon`, `actions`, `size`, `dismissible`, `error` (message from the last attempt: alert role, linked with aria-describedby, dialog stays open), `describedBy` (id of an element in `children`). Confirm: `description`, `summary`, `confirmLabel`, `tone` utama / bahaya, `busy`, `error`, `onConfirm`, `onCancel` |
| `Notice` | Inline message: `tone` sukses / galat / info, `onDismiss`, `action`. Galat is `role="alert"`, the others `role="status"` |
| `EmptyState` | `icon`, `title`, `description`, `action`, `variant` card / page |
| `Breadcrumb`, `Crumb` | `items [{label,to?}]`, last is current |
| `TextLink` | router link with underline and arrow |
| `PageHeader`, `SectionHeader` | `title`, `subtitle`/`description`, `actions`. PageHeader also `status` (inline badge next to the title, e.g. `<StatusBadge status="draf" />`) |
| `Loading` | `label`, `block` |

Long text: `CellTitle` clamps the title to two lines (full text in `title`); badges, buttons and filter selects cut long
labels with an ellipsis; dialogs, cards and breadcrumbs wrap anywhere. Add your own `title` attribute for text you truncate.

Shells: `shells/AppShell` (used by the route frame, not by features) and `shells/PublicShell`. Public pages render
their own sections inside it (it provides header, footer, a 1120 px content column with 160 px gutters at 1440 px and the
vertical rhythm). The footer line "Data pada demo ini sintetis." is **not** shown by default: a public page whose data
is synthetic calls `useSyntheticDataNotice()` (from `shells/PublicShell`) while mounted, or `useSyntheticDataNotice(flag)`.
Below 1024 px the AppShell sidebar becomes a drawer: hidden and inert when closed, focus moves in on open and back to the
menu button on Escape, the page behind is inert. On every route change focus moves to `<main>`.

## Shared helpers (`lib/`)

- `useRequest(key, load, { keepPreviousData? })` returns `{ data, error, loading, reload }`. Race safe: a new `key` aborts
  the previous request and a late answer for an old key is ignored (`key = null` stays idle). `load` receives an
  `AbortSignal`; pass it to `api.get(path, { signal })`. Use `keepPreviousData` for filterable tables.
- `describeError(error, fallback?)` (`lib/api-error`) gives presentable text per status (501 not built, 0 network, 5xx).
  `errorMessage` still returns only the server message.
- `lib/paging`: `pageCountFor`, `pageRange`, `clampPage` (pure, tested).
- `lib/format` is id-ID and null safe (missing or NaN values render "–", never "NaN"): `formatNumber`, `formatDecimal(v, digits)`,
  `formatDecimal1`, `formatRupiah`, `formatPercent(ratio, digits)`, `formatDate` ("3 Nov 2026"), `formatDateLong`
  ("3 November 2026"), `formatTime` ("14.20"), `formatDateTime`, `formatDayMonth`, `toDateInput` (epoch to `YYYY-MM-DD`),
  `daysUntil`, `formatCountdown`.

## Motion

Tokens `--dur-fast` 100 ms, `--dur-base` 140 ms, `--dur-slow` 180 ms and `--ease-out` (tokens.css). Motion is state feedback
only: hover and press color changes, dialog / popover / notice entrance, drawer slide. Never animate layout. With
`prefers-reduced-motion` everything is instant and busy spinners pulse instead of rotating (base.css). Use the tokens for
any motion in a feature.
