import type { ImportOverviewRow } from "@nirmala/shared";
import { ArrowRight, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDateTime, formatNumber } from "../../../lib/format";
import { Button, ButtonLink, Table, TableFrame, TBody, Td, THead, Th, Tr } from "../../../ui";
import { rowAction, versionColumns, versionText } from "../logic";
import styles from "./CycleSnapshotTables.module.css";

export const resultHref = (cycleId: string, snapshotId: string) => `/siklus?siklus=${encodeURIComponent(cycleId)}&hasil=${encodeURIComponent(snapshotId)}`;

export interface SnapshotTableProps {
  cycleId: string;
  rows: ImportOverviewRow[];
  canImport: boolean;
  onImport: (organizationId: string) => void;
}

export function SnapshotTable({ cycleId, rows, canImport, onImport }: SnapshotTableProps) {
  const columns = versionColumns(rows.map((row) => row.snapshots));
  return (
    <TableFrame className={`${styles.frame} ${styles.tall}`}>
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
