import type { AuditLogFacetsResponse, AuditLogListResponse } from "@nirmala/shared";
import { Lock, ScrollText } from "lucide-react";
import { useState } from "react";
import { cn } from "../../../lib/cn";
import density from "../components/density.module.css";
import { api, errorMessage } from "../../../lib/api";
import { formatDateTime, formatNumber } from "../../../lib/format";
import { Button, EmptyState, FilterBar, FilterSelect, FilterSummary, Loading, PageHeader, Pagination, Table, TableFrame, TagChip, TBody, Td, Th, THead, Tr } from "../../../ui";
import { Alert } from "../components/Alert";
import { auditActionLabel, auditEntityLabel } from "../labels";
import { useResource } from "../useResource";
import styles from "./AuditLogPage.module.css";

const PAGE_SIZE = 25;
const ALL = "";

/** S12e · Audit log (aISAr). Route: /admin/audit. Read only. */
export function AuditLogPage() {
  const [action, setAction] = useState(ALL);
  const [entityType, setEntityType] = useState(ALL);
  const [actorUserId, setActorUserId] = useState(ALL);
  const [page, setPage] = useState(1);

  const facets = useResource(() => api.get<AuditLogFacetsResponse>("/audit-logs/facets"), "facets");
  const list = useResource(
    () => api.get<AuditLogListResponse>("/audit-logs", { query: { page, pageSize: PAGE_SIZE, action, entityType, actorUserId } }),
    `${page}|${action}|${entityType}|${actorUserId}`
  );

  const filtered = action !== ALL || entityType !== ALL || actorUserId !== ALL;
  const data = list.data;

  function pick(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  function reset() {
    setAction(ALL);
    setEntityType(ALL);
    setActorUserId(ALL);
    setPage(1);
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Audit log"
        subtitle="Setiap aksi tercatat. Halaman ini hanya baca."
        actions={
          <span className={styles.readonly}>
            <Lock size={14} aria-hidden="true" />
            Hanya baca
          </span>
        }
      />

      <FilterBar label="Filter audit log">
        <FilterSelect label="Aksi" value={action} onChange={pick(setAction)} options={[{ value: ALL, label: "Semua" }, ...(facets.data?.actions ?? []).map((code) => ({ value: code, label: auditActionLabel(code) }))]} />
        <FilterSelect label="Entitas" value={entityType} onChange={pick(setEntityType)} options={[{ value: ALL, label: "Semua" }, ...(facets.data?.entityTypes ?? []).map((code) => ({ value: code, label: auditEntityLabel(code) }))]} />
        <FilterSelect label="Pengguna" value={actorUserId} onChange={pick(setActorUserId)} options={[{ value: ALL, label: "Semua" }, ...(facets.data?.actors ?? []).map((actor) => ({ value: actor.id, label: actor.name }))]} />
        {data && <FilterSummary>{formatNumber(data.pagination.total)} entri</FilterSummary>}
      </FilterBar>

      {facets.error && <Alert>Pilihan filter belum bisa dimuat. {errorMessage(facets.error)}</Alert>}

      {list.error && !data ? (
        <EmptyState icon={ScrollText} title="Audit log belum bisa dimuat" description={errorMessage(list.error)} action={<Button onClick={list.reload}>Coba lagi</Button>} />
      ) : !data ? (
        <Loading label="Memuat audit log…" block />
      ) : data.logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={filtered ? "Tidak ada entri yang cocok" : "Belum ada entri"}
          description={filtered ? "Ubah atau hapus filter untuk melihat entri lain." : "Aksi pengguna dan sistem akan tercatat di sini."}
          action={filtered ? <Button onClick={reset}>Hapus filter</Button> : undefined}
        />
      ) : (
        <div className={styles.table} aria-busy={list.loading || undefined} data-stale={list.loading || undefined}>
          <TableFrame className={cn(density.roomy, density.rows16)}>
            <Table aria-label="Entri audit log">
              <THead>
                <tr>
                  <Th width={190}>Waktu</Th>
                  <Th width={150}>Pengguna</Th>
                  <Th width={230}>Aksi</Th>
                  <Th width={130}>Entitas</Th>
                  <Th>Ringkasan</Th>
                </tr>
              </THead>
              <TBody>
                {data.logs.map((entry) => (
                  <Tr key={entry.id}>
                    <Td>
                      <span className="mono">{formatDateTime(entry.createdAt)}</span>
                    </Td>
                    <Td>{entry.actor}</Td>
                    <Td>
                      <span className="mono" title={entry.action}>
                        {auditActionLabel(entry.action)}
                      </span>
                    </Td>
                    <Td>
                      <TagChip>{auditEntityLabel(entry.entityType)}</TagChip>
                    </Td>
                    <Td>
                      <span className={styles.summary} title={entry.detail}>
                        {entry.detail}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {data.pagination.totalPages > 1 && <Pagination page={data.pagination.page} pageSize={data.pagination.pageSize} total={data.pagination.total} onPageChange={setPage} noun="entri" />}
          </TableFrame>
        </div>
      )}
    </div>
  );
}
