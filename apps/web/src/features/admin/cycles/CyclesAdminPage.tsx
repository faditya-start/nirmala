import type { CycleListResponse, ReviewCycleDto } from "@nirmala/shared";
import { CalendarDays, Globe, Plus, SquarePen } from "lucide-react";
import { useState } from "react";
import { useCycle } from "../../../app/cycle";
import { cn } from "../../../lib/cn";
import density from "../components/density.module.css";
import { api } from "../../../lib/api";
import { failureMessage } from "../errors";
import { formatDate } from "../../../lib/format";
import { Button, EmptyState, Loading, PageHeader, Table, TableFrame, TagChip, TBody, Td, Th, THead, Tr } from "../../../ui";
import { InfoNote } from "../components/InfoNote";
import { STAGE_LABEL } from "../labels";
import { useResource } from "../useResource";
import { CreateCycleDialog, EditCycleDialog, MarkDipaDialog } from "./CycleDialogs";
import { sortCycles } from "./cycleForm";
import styles from "./CyclesAdminPage.module.css";

type Dialogs = { kind: "create" } | { kind: "dipa"; cycle: ReviewCycleDto } | { kind: "edit"; cycle: ReviewCycleDto };

/** S12d · Siklus (Fa6ZU, l9cPH, e2AA59). Route: /admin/siklus. */
export function CyclesAdminPage() {
  const { reload: reloadShell } = useCycle();
  const resource = useResource(() => api.get<CycleListResponse>("/cycles"), "cycles");
  const [dialog, setDialog] = useState<{ what: Dialogs; open: boolean; nonce: number } | null>(null);

  const cycles = sortCycles(resource.data?.cycles ?? []);
  const nextYear = cycles.reduce((year, cycle) => Math.max(year, cycle.fiscalYear), new Date().getFullYear() - 1) + 1;

  const show = (what: Dialogs) => setDialog((current) => ({ what, open: true, nonce: (current?.nonce ?? 0) + 1 }));
  const close = () => setDialog((current) => (current ? { ...current, open: false } : current));
  // The sidebar's cycle picker reads the same list, so refresh both after any change.
  const done = () => {
    close();
    resource.reload();
    void reloadShell();
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Siklus"
        subtitle="Tahun anggaran, tahap, tenggat ADK, dan penandaan DIPA terbit"
        actions={
          <Button variant="utama" icon={Plus} onClick={() => show({ kind: "create" })} disabled={!resource.data}>
            Buat siklus
          </Button>
        }
      />

      {resource.error && !resource.data ? (
        <EmptyState icon={CalendarDays} title="Daftar siklus belum bisa dimuat" description={failureMessage(resource.error)} action={<Button onClick={resource.reload}>Coba lagi</Button>} />
      ) : !resource.data ? (
        <Loading label="Memuat siklus…" block />
      ) : (
        <>
          {cycles.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Belum ada siklus" description="Buat siklus pertama untuk mulai mengimpor data RKA." action={<Button variant="utama" icon={Plus} onClick={() => show({ kind: "create" })}>Buat siklus</Button>} />
          ) : (
            <TableFrame className={cn(density.roomy, density.rows16)}>
              <Table aria-label="Daftar siklus">
                <THead>
                  <tr>
                    <Th width={150}>Tahun anggaran</Th>
                    <Th width={140}>Tahap</Th>
                    <Th width={150}>Tenggat ADK</Th>
                    <Th width={120}>Status</Th>
                    <Th width={240}>DIPA terbit</Th>
                    <Th>Tindakan</Th>
                  </tr>
                </THead>
                <TBody>
                  {cycles.map((cycle) => (
                    <Tr key={cycle.id}>
                      <Td>
                        <strong>TA&nbsp; {cycle.fiscalYear}</strong>
                      </Td>
                      <Td>{STAGE_LABEL[cycle.stage]}</Td>
                      <Td>{formatDate(cycle.adkDeadline)}</Td>
                      <Td>
                        <TagChip>{cycle.status === "aktif" ? "Aktif" : "Selesai"}</TagChip>
                      </Td>
                      <Td>
                        {cycle.dipaIssuedAt ? (
                          <div className={styles.dipa}>
                            <span className={styles.dipaDate}>
                              <Globe size={14} aria-hidden="true" />
                              {formatDate(cycle.dipaIssuedAt)}
                            </span>
                            <span className={styles.dipaNote}>Agregat tampil di Transparansi publik</span>
                          </div>
                        ) : (
                          <span className={styles.muted}>Belum</span>
                        )}
                      </Td>
                      <Td>
                        <div className={styles.actions}>
                          <Button variant="ghost" icon={SquarePen} aria-label={`Ubah ${cycle.name}`} onClick={() => show({ kind: "edit", cycle })}>
                            Ubah
                          </Button>
                          {!cycle.dipaIssuedAt && (
                            <Button icon={Globe} onClick={() => show({ kind: "dipa", cycle })}>
                              Tandai DIPA terbit
                            </Button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableFrame>
          )}
          <InfoNote>Menandai DIPA terbit membuka agregat siklus itu di halaman Transparansi publik. Yang tampil hanya jumlah dan persentase, tanpa item, nama Satker, atau rupiah per item.</InfoNote>
        </>
      )}

      {dialog?.what.kind === "create" && <CreateCycleDialog key={dialog.nonce} open={dialog.open} onClose={close} defaultYear={nextYear} onDone={done} />}
      {dialog?.what.kind === "dipa" && <MarkDipaDialog key={dialog.nonce} cycle={dialog.what.cycle} open={dialog.open} onClose={close} onDone={done} />}
      {dialog?.what.kind === "edit" && <EditCycleDialog key={dialog.nonce} cycle={dialog.what.cycle} open={dialog.open} onClose={close} onDone={done} />}
    </div>
  );
}
