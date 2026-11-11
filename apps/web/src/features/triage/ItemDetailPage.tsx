import type { DismissReasonDto, TriageItemDetailResponse } from "@nirmala/shared";
import { ChevronLeft, ChevronRight, CircleAlert, SearchX } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { usePageBreadcrumb } from "../../app/breadcrumb";
import { useCycle } from "../../app/cycle";
import { useNeedsAction } from "../../app/needsAction";
import { api, isApiError } from "../../lib/api";
import { formatNumber } from "../../lib/format";
import { Button, ButtonLink, EmptyState, Loading, RuleChip, ScoreBadge, TagChip } from "../../ui";
import { AccessDeniedInline } from "./components/AccessDeniedInline";
import { DecisionPanel } from "./components/DecisionPanel";
import { ItemContext } from "./components/ItemContext";
import { ReasonColumn } from "./components/ReasonColumn";
import { filterToQuery, itemPath, listPath, pageForPosition, parseFilter } from "./filters";
import { CHANGE_LABEL, RISK_TO_SCORE_CATEGORY } from "./labels";
import styles from "./ItemDetailPage.module.css";
import { friendlyError, useRequest } from "./useRequest";

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || element.closest("input, textarea, select, [role='combobox'], dialog")));
}

/** S5 · Detail item (BftML konfirmasi, l5Oo0 dismiss, rs38h setelah keputusan). Route: /triage/:itemId. */
export function ItemDetailPage() {
  const { itemId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { active } = useCycle();
  const needsAction = useNeedsAction();
  const filter = useMemo(() => parseFilter(params), [params]);
  const filterKey = params.toString();

  const detailReq = useRequest<TriageItemDetailResponse>(`${itemId}?${filterKey}?${active?.id ?? ""}`, (signal) =>
    api.get<TriageItemDetailResponse>(`/triage/items/${encodeURIComponent(itemId)}`, {
      signal,
      query: { ...filterToQuery(filter), cycleId: active?.id }
    })
  );
  const reasonsReq = useRequest<{ reasons: DismissReasonDto[] }>("reasons", (signal) => api.get("/references/dismiss-reasons", { signal }));
  const detail = detailReq.data;

  // Setelah keputusan, item bisa keluar dari daftar ber-filter (mis. "belum ditinjau") sehingga server menjawab
  // navigation null. Pakai navigasi terakhir untuk item yang sama supaya "Item berikutnya" tetap ada.
  const navMemo = useRef<{ id: string; nav: NonNullable<TriageItemDetailResponse["navigation"]> } | null>(null);
  if (detail?.navigation) navMemo.current = { id: detail.item.id, nav: detail.navigation };
  const nav = detail ? (detail.navigation ?? (navMemo.current?.id === detail.item.id ? navMemo.current.nav : null)) : null;
  const prevHref = nav?.previousItemId ? itemPath(nav.previousItemId, filter) : null;
  const nextHref = nav?.nextItemId ? itemPath(nav.nextItemId, filter) : null;
  const backTo = listPath(filter, nav ? pageForPosition(nav.position) : 1);

  usePageBreadcrumb(
    detail
      ? [
          { label: "Reviu" },
          { label: "Risk Triage", to: backTo },
          { label: detail.item.organizationUnitName, to: listPath({ ...filter, organizationUnitId: detail.item.organizationUnitId, workUnitId: "" }) },
          { label: detail.item.description.length > 60 ? `${detail.item.description.slice(0, 57)}…` : detail.item.description }
        ]
      : null
  );

  // j / k pindah item (bukan saat mengetik atau dialog terbuka).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || isTypingTarget(event.target)) return;
      const href = event.key === "j" ? nextHref : event.key === "k" ? prevHref : null;
      if (href) {
        event.preventDefault();
        navigate(href, { replace: true });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextHref, prevHref, navigate]);

  if (!detail) {
    const error = detailReq.error;
    if (error) {
      if (isApiError(error) && error.status === 403) return <AccessDeniedInline message={error.message} />;
      if (isApiError(error) && error.status === 404) {
        return (
          <EmptyState
            icon={SearchX}
            title="Item tidak ditemukan"
            description="Item ini tidak ada di data yang Anda akses. Mungkin tautannya sudah lama atau item berasal dari snapshot sebelumnya."
            action={<ButtonLink to={listPath(filter)}>Kembali ke Risk Triage</ButtonLink>}
          />
        );
      }
      return (
        <EmptyState
          icon={CircleAlert}
          title="Detail item belum bisa dimuat"
          description={friendlyError(error, "Detail item tidak dapat dimuat. Coba lagi.")}
          action={<Button onClick={() => void detailReq.reload()}>Coba lagi</Button>}
        />
      );
    }
    return <Loading block label="Memuat detail item…" />;
  }

  const { item, score, ruleHits } = detail;
  const contextParts = [item.workUnitName, item.accountCode, nav ? `item ${formatNumber(nav.position)} dari ${formatNumber(nav.total)}` : null].filter(Boolean);

  async function afterDecision() {
    await detailReq.reload();
    void needsAction.refresh();
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title} title={item.description}>
            {item.description}
          </h1>
          <div className={styles.meta}>
            <span className={styles.context}>{contextParts.join(" · ")}</span>
            {ruleHits.map((hit) => (
              <RuleChip key={hit.ruleId} code={hit.code} />
            ))}
            {score ? <ScoreBadge score={score.value} category={RISK_TO_SCORE_CATEGORY[score.category]} /> : <span className={styles.context}>Belum dinilai</span>}
            {item.changeType !== "tetap" && <TagChip>{CHANGE_LABEL[item.changeType]}</TagChip>}
          </div>
        </div>
        {nav && (
          <nav className={styles.pager} aria-label="Pindah item">
            {prevHref ? (
              <ButtonLink to={prevHref} replace icon={ChevronLeft} aria-keyshortcuts="k" title="Item sebelumnya (k)">
                Sebelumnya
              </ButtonLink>
            ) : (
              <Button icon={ChevronLeft} disabled>
                Sebelumnya
              </Button>
            )}
            {nextHref ? (
              <ButtonLink to={nextHref} replace icon={ChevronRight} aria-keyshortcuts="j" title="Item berikutnya (j)">
                Berikutnya
              </ButtonLink>
            ) : (
              <Button icon={ChevronRight} disabled>
                Berikutnya
              </Button>
            )}
          </nav>
        )}
      </header>

      {detailReq.error && (
        <p className={styles.inlineError} role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {friendlyError(detailReq.error, "Detail tidak dapat dimuat ulang.")} Data yang tampil mungkin sudah lama.
        </p>
      )}

      <div className={styles.grid} aria-busy={detailReq.loading || undefined}>
        <div className={styles.context_}>
          <ItemContext item={item} previousVersion={detail.previousVersion} />
        </div>
        <div className={styles.reason}>
          <ReasonColumn ruleHits={ruleHits} score={score} peer={detail.peer} satkerHistory={detail.satkerHistory} />
        </div>
        <div className={styles.decision}>
          <DecisionPanel
            key={item.id}
            detail={detail}
            reasons={reasonsReq.data?.reasons ?? null}
            reasonsFailed={Boolean(reasonsReq.error)}
            onChanged={afterDecision}
            nextHref={nextHref}
          />
        </div>
      </div>
    </div>
  );
}
