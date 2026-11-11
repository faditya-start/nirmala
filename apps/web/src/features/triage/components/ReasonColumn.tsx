import type { PeerComparisonDto, RuleHitDto, SatkerHistoryDto, ScoreBreakdownDto } from "@nirmala/shared";
import { FactorRow, RuleCard, ScoreBadge, SectionHeader, Table, TableFrame, TBody, Td, Th, THead } from "../../../ui";
import { formatNumber } from "../../../lib/format";
import { CATEGORY_SHORT, FINDING_THEME_LABEL, RISK_TO_SCORE_CATEGORY } from "../labels";
import { PeerPrice } from "./PeerPrice";
import styles from "./ReasonColumn.module.css";

export interface ReasonColumnProps {
  ruleHits: RuleHitDto[];
  score: ScoreBreakdownDto | null;
  peer: PeerComparisonDto | null;
  satkerHistory: SatkerHistoryDto;
}

/** Kolom tengah S5: Aturan yang terpicu, Rincian skor, Harga satuan vs Satker lain, Riwayat temuan BPK. */
export function ReasonColumn({ ruleHits, score, peer, satkerHistory }: ReasonColumnProps) {
  return (
    <div className={styles.column}>
      <section className={styles.group}>
        <SectionHeader title="Aturan yang terpicu" />
        {ruleHits.length === 0 ? (
          <p className={styles.note}>Tidak ada aturan aktif yang mengenai item ini. Item tetap bisa ditinjau berdasarkan skor.</p>
        ) : (
          <div className={styles.cards}>
            {ruleHits.map((hit) => (
              <RuleCard
                key={hit.ruleId}
                code={hit.code}
                name={hit.name}
                category={CATEGORY_SHORT[hit.category]}
                reason={hit.reason}
                details={[
                  ...(hit.matchedTerms.length > 0 ? [{ label: "Uraian cocok", value: hit.matchedTerms.join(" + "), mono: true }] : []),
                  { label: "Sumber", value: hit.source },
                  { label: "Ekspektasi bawaan", value: hit.defaultExpectation ? hit.defaultExpectation.type : "Tidak ada", mono: Boolean(hit.defaultExpectation) }
                ]}
              />
            ))}
          </div>
        )}
      </section>

      <section className={styles.group}>
        <SectionHeader title="Rincian skor" description="Hanya untuk mengurutkan, bukan dasar flag." />
        {score ? (
          <>
            <div className={styles.total}>
              <span>Skor total (tinggi ≥ {score.thresholds.high})</span>
              <ScoreBadge score={score.value} category={RISK_TO_SCORE_CATEGORY[score.category]} />
            </div>
            <div className={styles.factors}>
              {score.factors.map((factor) => (
                <FactorRow
                  key={factor.code}
                  className={styles.factor}
                  code={factor.key}
                  name={factor.label}
                  value={factor.normalizedScore ?? undefined}
                  weight={factor.weight}
                  contribution={factor.contribution ?? undefined}
                  explanation={factor.explanation}
                  na={!factor.dataAvailable}
                />
              ))}
            </div>
            {score.dataCompleteness === "partial" && <p className={styles.footnote}>Data sebagian faktor tidak tersedia. Faktor itu tidak menaikkan skor.</p>}
            <p className={styles.footnote}>Konfigurasi skor {score.configVersion}.</p>
          </>
        ) : (
          <p className={styles.note}>Item ini belum dinilai skor. Skor muncul setelah perhitungan untuk snapshot ini selesai.</p>
        )}
      </section>

      <section className={styles.group}>
        <SectionHeader title="Harga satuan vs Satker lain" description={`Kelompok: uraian dan satuan sama, muncul di ≥ ${peer?.minSatker ?? 5} Satker pada siklus ini.`} />
        {peer ? (
          <PeerPrice peer={peer} />
        ) : (
          <p className={styles.note}>Tidak ada perbandingan. Uraian dan satuan yang sama belum muncul di cukup banyak Satker pada siklus ini.</p>
        )}
      </section>

      <section className={styles.group}>
        <SectionHeader title={`Riwayat temuan BPK · ${satkerHistory.workUnitName}`} description="Hanya jumlah per tema, tanpa detail temuan." />
        {satkerHistory.hasProfile && satkerHistory.themes.every((theme) => theme.countTotal === 0) ? (
          <p className={styles.note}>Tidak ada rekomendasi BPK pada tema yang diperiksa.</p>
        ) : satkerHistory.hasProfile ? (
          <TableFrame>
            <Table aria-label={`Riwayat temuan BPK ${satkerHistory.workUnitName}`}>
              <THead>
                <tr>
                  <Th>Tema</Th>
                  <Th align="right" width={120}>
                    Rekomendasi
                  </Th>
                  <Th align="right" width={120}>
                    Belum selesai
                  </Th>
                </tr>
              </THead>
              <TBody>
                {satkerHistory.themes.filter((theme) => theme.countTotal > 0).map((theme) => (
                  <tr key={theme.theme}>
                    <Td>{FINDING_THEME_LABEL[theme.theme] ?? theme.theme}</Td>
                    <Td numeric>{formatNumber(theme.countTotal)}</Td>
                    <Td numeric className={theme.countOpen === 0 ? styles.zero : styles.open}>
                      {formatNumber(theme.countOpen)}
                    </Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </TableFrame>
        ) : (
          <p className={styles.note}>Satker ini belum punya profil temuan BPK, jadi faktor F3 tidak dihitung.</p>
        )}
      </section>
    </div>
  );
}
