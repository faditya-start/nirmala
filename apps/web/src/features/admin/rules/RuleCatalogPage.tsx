import type { RuleAdminDto, RuleListResponse, RuleResponse } from "@nirmala/shared";
import { BookOpen, SquarePen, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { api, errorMessage } from "../../../lib/api";
import { formatNumber } from "../../../lib/format";
import { cycleLabel } from "../../../lib/types";
import { Button, CellEmpty, CellTitle, EmptyState, IconButton, Loading, PageHeader, RuleChip, Table, TableFrame, TagChip, TBody, Td, Th, THead, Tr, Switch } from "../../../ui";
import { Alert } from "../components/Alert";
import { InfoNote } from "../components/InfoNote";
import { CATEGORY_CHIP } from "../labels";
import { useResource } from "../useResource";
import { RuleEditPanel } from "./RuleEditPanel";
import styles from "./RuleCatalogPage.module.css";

/** S12a · Katalog aturan (bOLIA, pFsNp panel edit). Route: /admin/aturan. */
export function RuleCatalogPage() {
  const resource = useResource(() => api.get<RuleListResponse>("/admin/rules"), "rules");
  const [overrides, setOverrides] = useState<Record<string, RuleAdminDto>>({});
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ rule: RuleAdminDto; open: boolean; nonce: number } | null>(null);

  const data = resource.data;
  const rules = (data?.rules ?? []).map((rule) => overrides[rule.id] ?? rule);
  const activeCount = rules.filter((rule) => rule.active).length;

  async function toggle(rule: RuleAdminDto, active: boolean) {
    if (toggling) return;
    setToggling(rule.id);
    setError(null);
    try {
      const result = await api.put<RuleResponse>(`/admin/rules/${rule.id}/active`, { active });
      setOverrides((current) => ({ ...current, [rule.id]: result.rule }));
    } catch (failure) {
      setError(`Status ${rule.code} belum bisa diubah. ${errorMessage(failure)}`);
    } finally {
      setToggling(null);
    }
  }

  function openEditor(rule: RuleAdminDto) {
    setError(null);
    setEditing((current) => ({ rule, open: true, nonce: (current?.nonce ?? 0) + 1 }));
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Katalog aturan"
        subtitle={
          data
            ? `${formatNumber(rules.length)} aturan · ${formatNumber(activeCount)} aktif · hit dihitung di snapshot terbaru ${data.cycle ? cycleLabel(data.cycle).replace(" · ", " ") : "siklus aktif"}`
            : "Aturan yang dipakai engine untuk menandai item"
        }
      />

      {resource.error && !data ? (
        <EmptyState
          icon={BookOpen}
          title="Katalog aturan belum bisa dimuat"
          description={errorMessage(resource.error)}
          action={
            <Button onClick={resource.reload}>
              Coba lagi
            </Button>
          }
        />
      ) : !data ? (
        <Loading label="Memuat katalog aturan…" block />
      ) : (
        <>
          <InfoNote>Isi aturan belum divalidasi auditor. Kolom Validasi menandai aturan yang masih punya catatan validasi di katalog.</InfoNote>
          {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
          {rules.length === 0 ? (
            <EmptyState icon={BookOpen} title="Belum ada aturan" description="Katalog terisi saat server pertama kali dijalankan. Hubungi pengelola sistem bila daftar ini kosong." />
          ) : (
            <TableFrame>
              <Table aria-label="Katalog aturan">
                <THead>
                  <tr>
                    <Th width={90}>Kode</Th>
                    <Th>Aturan</Th>
                    <Th width={150}>Kategori</Th>
                    <Th align="right" width={150}>
                      Hit di siklus aktif
                    </Th>
                    <Th width={170}>Validasi</Th>
                    <Th width={190}>Status</Th>
                    <Th width={56}>
                      <span className="sr-only">Ubah</span>
                    </Th>
                  </tr>
                </THead>
                <TBody>
                  {rules.map((rule) => (
                    <Tr key={rule.id}>
                      <Td>
                        <RuleChip code={rule.code} />
                      </Td>
                      <Td>
                        <CellTitle title={<span title={rule.name}>{rule.name}</span>} meta={[<span key="kind" className="mono">{rule.kind}</span>]} />
                      </Td>
                      <Td>
                        <TagChip>{CATEGORY_CHIP[rule.category]}</TagChip>
                      </Td>
                      <Td numeric>{formatNumber(rule.hitCount)}</Td>
                      <Td>
                        {rule.needsValidation ? (
                          <span className={styles.validation} title={rule.validationNote ?? undefined}>
                            <TriangleAlert size={14} aria-hidden="true" />
                            Perlu validasi
                          </span>
                        ) : (
                          <CellEmpty />
                        )}
                      </Td>
                      <Td>
                        <div className={styles.status}>
                          <Switch
                            checked={rule.active}
                            disabled={toggling !== null}
                            aria-label={`Aturan ${rule.code}`}
                            label={rule.active ? "Aktif" : "Nonaktif"}
                            onCheckedChange={(checked) => void toggle(rule, checked)}
                          />
                          {rule.appliesToRevisionOnly && <span className={styles.scope}>Hanya snapshot revisi</span>}
                        </div>
                      </Td>
                      <Td align="right">
                        <IconButton icon={SquarePen} label={`Ubah aturan ${rule.code}`} onClick={() => openEditor(rule)} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableFrame>
          )}
        </>
      )}

      {editing && (
        <RuleEditPanel
          key={`${editing.rule.id}:${editing.nonce}`}
          rule={editing.rule}
          open={editing.open}
          onClose={() => setEditing((current) => (current ? { ...current, open: false } : current))}
          onSaved={(saved) => {
            setOverrides((current) => ({ ...current, [saved.id]: saved }));
            setEditing((current) => (current ? { ...current, rule: saved, open: false } : current));
          }}
        />
      )}
    </div>
  );
}
