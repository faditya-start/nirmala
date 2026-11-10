import { FilePlus, FileText } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import type { ChrListItemDto } from "@nirmala/shared";
import { useAuth } from "../../app/auth";
import { useCycle } from "../../app/cycle";
import { cycleLabel } from "../../lib/types";
import { errorMessage } from "../../lib/api-error";
import { formatDate, formatNumber } from "../../lib/format";
import {
  Button,
  EmptyState,
  FilterBar,
  FilterSelect,
  FilterSpacer,
  FilterSummary,
  Loading,
  PageHeader,
  SectionHeader,
  StatusBadge,
  Table,
  TableFrame,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "../../ui";
import { chrApi } from "./chrApi";
import { DocStatusPill } from "./components/DocStatus";
import { ResourceError } from "./components/ResourceError";
import { NOTE_STATUS_ORDER } from "./logic";
import { useResource } from "./useResource";
import styles from "./Index.module.css";

const STATUS_FILTER = [
  { value: "", label: "Semua" },
  { value: "draft", label: "Draf dokumen" },
  { value: "issued", label: "Terbit" },
  { value: "completed", label: "Selesai" }
];

/** Nav target "CHR": CHR documents of the active cycle per eselon I. One eselon I with a CHR goes straight to it. Route: /chr. */
export function ChrIndexPage() {
  const { active, status: cycleStatus } = useCycle();
  const cycleId = active?.id ?? "";
  const [filter, setFilter] = useState("");
  const resource = useResource(() => (cycleId ? chrApi.list(cycleId, filter || undefined) : Promise.resolve(null)), [cycleId, filter]);

  if (cycleStatus === "loading" || cycleStatus === "idle" || resource.loading) return <Loading block label="Memuat daftar CHR…" />;
  if (!active) {
    return <EmptyState variant="page" icon={FileText} title="Belum ada siklus" description="CHR dibuat per siklus reviu. Siklus dibuat oleh Admin di Pengaturan." />;
  }
  if (resource.error) return <ResourceError error={resource.error} what="daftar CHR" onRetry={() => void resource.reload()} backTo="/dashboard" backLabel="Kembali ke Dashboard" />;
  const data = resource.data;
  if (!data) return null;

  if (!filter && data.items.length === 1 && data.organizationUnitsWithoutChr.length === 0) {
    return <Navigate to={`/chr/${encodeURIComponent(data.items[0].id)}`} replace />;
  }
  return <ChrList cycleName={cycleLabel(active)} cycleId={active.id} items={data.items} without={data.organizationUnitsWithoutChr} filter={filter} onFilter={setFilter} />;
}

function ChrList({
  cycleName,
  cycleId,
  items,
  without,
  filter,
  onFilter
}: {
  cycleName: string;
  cycleId: string;
  items: ChrListItemDto[];
  without: Array<{ id: string; code: string; shortName: string; name: string }>;
  filter: string;
  onFilter: (value: string) => void;
}) {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canCreate = hasRole("reviewer", "admin");
  const [creating, setCreating] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  async function create(organizationUnitId: string) {
    if (creating) return;
    setCreating(organizationUnitId);
    setCreateError(null);
    try {
      const result = await chrApi.create(cycleId, organizationUnitId);
      navigate(`/chr/${encodeURIComponent(result.document.id)}`);
    } catch (error) {
      setCreateError(errorMessage(error, "CHR belum bisa dibuat. Coba lagi."));
      setCreating(null);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title="CHR" subtitle={`Catatan Hasil Reviu per eselon I · ${cycleName}`} />

      <FilterBar label="Filter CHR">
        <FilterSelect label="Status" value={filter} onChange={onFilter} options={STATUS_FILTER} />
        <FilterSpacer />
        <FilterSummary>{formatNumber(items.length)} dokumen CHR</FilterSummary>
      </FilterBar>

      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filter ? "Tidak ada CHR dengan status ini" : "Belum ada CHR di siklus ini"}
          description={filter ? "Ubah filter status untuk melihat dokumen lain." : "CHR dibuat otomatis saat catatan pertama dikonfirmasi di Risk Triage, atau dibuat dari daftar di bawah."}
        />
      ) : (
        <TableFrame>
          <Table aria-label="Daftar CHR">
            <THead>
              <tr>
                <Th>Eselon I</Th>
                <Th width={150}>Status</Th>
                <Th>Nomor</Th>
                <Th>Catatan</Th>
                <Th width={120}>Terbit</Th>
                <Th width={120}>Diperbarui</Th>
              </tr>
            </THead>
            <TBody>
              {items.map((item) => (
                <Tr key={item.id} onActivate={() => navigate(`/chr/${encodeURIComponent(item.id)}`)}>
                  <Td>
                    <Link to={`/chr/${encodeURIComponent(item.id)}`} className={styles.link} title={item.organizationUnitName}>
                      {item.organizationUnitName}
                    </Link>
                  </Td>
                  <Td>
                    <DocStatusPill status={item.status} />
                  </Td>
                  <Td className="mono">{item.documentNumber ?? <span className={styles.muted}>Belum terbit</span>}</Td>
                  <Td>
                    <div className={styles.counts}>
                      <span className="num">{formatNumber(item.notesTotal)}</span>
                      {NOTE_STATUS_ORDER.filter((status) => item.notesByStatus[status] > 0).map((status) => (
                        <span key={status} className={styles.countItem}>
                          <StatusBadge status={status} />
                          <span className="num">{formatNumber(item.notesByStatus[status])}</span>
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td>{item.issuedAt ? formatDate(item.issuedAt) : <span className={styles.muted}>-</span>}</Td>
                  <Td>{formatDate(item.updatedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableFrame>
      )}

      {without.length > 0 && !filter && (
        <section className={styles.without} aria-labelledby="chr-without">
          <div id="chr-without">
            <SectionHeader title="Eselon I tanpa CHR" description="Belum ada catatan yang dikonfirmasi di siklus ini." />
          </div>
          {createError && (
            <p className={styles.error} role="alert">
              {createError}
            </p>
          )}
          <ul className={styles.withoutList}>
            {without.map((unit) => (
              <li key={unit.id} className={styles.withoutItem}>
                <span title={unit.name}>{unit.shortName}</span>
                {canCreate && (
                  <Button size="sm" icon={FilePlus} loading={creating === unit.id} disabled={creating !== null} onClick={() => void create(unit.id)}>
                    Buat CHR
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
