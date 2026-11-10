import type { ImportOverviewRow, ReviewCycleDto } from "@nirmala/shared";
import { ArrowRight, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { daysUntil, formatCountdown, formatDate, formatDateTime, formatNumber } from "../../../lib/format";
import { Button, ButtonLink, Table, TableFrame, TBody, Td, THead, Th, Tr } from "../../../ui";
import { rowAction, stageName, versionColumns, versionText } from "../logic";
import styles from "./CycleSnapshotTables.module.css";

export const resultHref = (cycleId: string, snapshotId: string) => `/siklus?siklus=${encodeURIComponent(cycleId)}&hasil=${encodeURIComponent(snapshotId)}`;

export function CycleTable({ cycles, activeId, onSelect }: { cycles: ReviewCycleDto[]; activeId: string | null; onSelect: (id: string) => void }) {
  return (
    <TableFrame className={styles.frame}>
      <Table aria-label="Daftar siklus">
        <THead>
          <tr>
            <Th width={180}>Tahun anggaran</Th>
            <Th width={180}>Tahap</Th>
            <Th width={220}>Tenggat ADK</Th>
            <Th width={220}>DIPA terbit</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {cycles.map((cycle) => {
            const active = cycle.id === activeId;
            const days = cycle.status === "aktif" ? daysUntil(cycle.adkDeadline) : null;
            return (
              <Tr key={cycle.id} className={active ? styles.active : undefined} aria-current={active ? "true" : undefined} onActivate={() => onSelect(cycle.id)}>
                <Td>TA {cycle.fiscalYear}</Td>
                <Td>{stageName(cycle.stage)}</Td>
                <Td>
                  {days !== null ? (
                    <div className={styles.stack}>
                      <span className={styles.primary}>{formatDate(cycle.adkDeadline)}</span>
                      <span className={styles.sub}>{formatCountdown(days)}</span>
                    </div>
                  ) : (
                    formatDate(cycle.adkDeadline)
                  )}
                </Td>
                <Td>{cycle.dipaIssuedAt ? formatDate(cycle.dipaIssuedAt) : "Belum"}</Td>
                <Td>
                  <span className={styles.status} data-status={cycle.status}>
                    <span className={styles.dot} aria-hidden="true" />
                    {cycle.status === "aktif" ? "Aktif" : "Selesai"}
                  </span>
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </TableFrame>
  );
}

export interface SnapshotTableProps {
  cycleId: string;
  rows: ImportOverviewRow[];
  canImport: boolean;
  onImport: (organizationId: string) => void;
}

export function SnapshotTable({ cycleId, rows, canImport, onImport }: SnapshotTableProps) {
  const columns = versionColumns(rows.map((row) => row.snapshots));
  return (
    <TableFrame className={styles.frame}>
      <Table aria-label="Snapshot per eselon I">
        <THead>
          <tr>
            <Th>Eselon I</Th>
            {columns.map((version) => (
              <Th key={version} width={280}>
                {versionText(version)}
              </Th>
            ))}
            <Th width={190}>Tindakan</Th>
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => {
            const action = rowAction(row.snapshots, row.nextVersionNo, canImport);
            return (
              <Tr key={row.organizationUnit.id}>
                <Td>
                  <div className={styles.stack}>
                    <span className={styles.primary}>{row.organizationUnit.shortName}</span>
                    <span className={styles.sub}>
                      {row.organizationUnit.code} · {formatNumber(row.satkerCount)} Satker sampel
                    </span>
                  </div>
                </Td>
                {columns.map((version) => {
                  const snapshot = row.snapshots.find((s) => s.versionNo === version);
                  return (
                    <Td key={version}>
                      {snapshot ? (
                        <div className={styles.stack}>
                          <Link className={styles.primaryLink} to={resultHref(cycleId, snapshot.id)} title={`Lihat hasil impor ${versionText(version)}`}>
                            {formatDateTime(snapshot.importedAt)}
                          </Link>
                          <span className={styles.sub}>
                            {formatNumber(snapshot.rowCount)} item{snapshot.importedByName ? ` · ${snapshot.importedByName}` : ""}
                            {snapshot.rowErrorCount > 0 ? ` · ${formatNumber(snapshot.rowErrorCount)} baris galat` : ""}
                          </span>
                        </div>
                      ) : (
                        <span className={styles.empty}>Belum diimpor</span>
                      )}
                    </Td>
                  );
                })}
                <Td>
                  {action.kind === "view" ? (
                    <ButtonLink to={resultHref(cycleId, action.snapshot.id)} icon={ArrowRight}>
                      Lihat hasil v{action.snapshot.versionNo}
                    </ButtonLink>
                  ) : action.kind === "import" ? (
                    <Button icon={Upload} onClick={() => onImport(row.organizationUnit.id)}>
                      Impor v{action.versionNo}
                    </Button>
                  ) : null}
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </TableFrame>
  );
}
