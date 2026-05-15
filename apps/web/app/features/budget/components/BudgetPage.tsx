import { useEffect, useMemo, useState } from "react";
import {
  useSuspenseQuery,
  useQuery,
  useMutation,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import {
  HeroKPI,
  Viewbar,
  FloatingDock,
  Tabs,
  ToggleChip,
} from "@oh-writers/ui";
import { resourceTotal } from "@oh-writers/domain";
import type { FiscalRegime } from "@oh-writers/domain";
import { unwrapResult } from "@oh-writers/utils";
import {
  getBudget,
  generateBudget,
  getCastAndCrew,
  getProjectScenes,
  getRateCard,
  getDayCosts,
  updateBudgetLine,
  updateBudgetSettings,
} from "../server/budget.server";
import { RateCardSection } from "./RateCardSection";
import { DayView } from "./widgets/DayView";
import { CastWidget } from "./widgets/CastWidget";
import { CrewWidget } from "./widgets/CrewWidget";
import styles from "./BudgetPage.module.css";

const budgetQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget", projectId],
    queryFn: () => getBudget({ data: { projectId } }).then(unwrapResult),
  });

const castCrewQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget-cast-crew", projectId],
    queryFn: () => getCastAndCrew({ data: { projectId } }).then(unwrapResult),
  });

const scenesQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget-scenes", projectId],
    queryFn: () => getProjectScenes({ data: { projectId } }).then(unwrapResult),
  });

const rateCardQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["rate-card", projectId],
    queryFn: () => getRateCard({ data: { projectId } }).then(unwrapResult),
  });

const dayCostsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget-day-costs", projectId],
    queryFn: () => getDayCosts({ data: { projectId } }).then(unwrapResult),
  });

const eur = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurAmount = (n: number) => eur.format(Math.round(n));

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

type ViewMode = "category" | "scene" | "day" | "cast" | "all";

type CategoryKey =
  | "cast"
  | "crew"
  | "locations"
  | "scenografia"
  | "costumi"
  | "fotografia"
  | "suono"
  | "vfx"
  | "comparse"
  | "vehicles";

const CATEGORY_META: Record<
  CategoryKey,
  { label: string; tokenVar: string; rowKey: string }
> = {
  cast: { label: "Cast", tokenVar: "--ds-cat-cast", rowKey: "cast" },
  crew: { label: "Troupe", tokenVar: "--ds-cat-crew", rowKey: "crew" },
  locations: {
    label: "Locations",
    tokenVar: "--ds-cat-locations",
    rowKey: "loc",
  },
  scenografia: {
    label: "Scenografia",
    tokenVar: "--ds-cat-scenografia",
    rowKey: "scen",
  },
  costumi: { label: "Costumi", tokenVar: "--ds-cat-costumi", rowKey: "cost" },
  fotografia: {
    label: "Fotografia",
    tokenVar: "--ds-cat-fotografia",
    rowKey: "foto",
  },
  suono: { label: "Suono", tokenVar: "--ds-cat-suono", rowKey: "suono" },
  vfx: { label: "VFX", tokenVar: "--ds-cat-vfx", rowKey: "vfx" },
  comparse: {
    label: "Comparse",
    tokenVar: "--ds-cat-comparse",
    rowKey: "comparse",
  },
  vehicles: {
    label: "Veicoli",
    tokenVar: "--ds-cat-vehicles",
    rowKey: "veh",
  },
};

const LINKED_TO_CATEGORY: Record<string, CategoryKey> = {
  locations: "locations",
  props: "scenografia",
  wardrobe: "costumi",
  equipment: "fotografia",
  sound: "suono",
  vfx: "vfx",
  extras: "comparse",
  vehicles: "vehicles",
};

interface BudgetPageProps {
  projectId: string;
}

export function BudgetPage({ projectId }: BudgetPageProps) {
  const qc = useQueryClient();
  const { data: budget } = useSuspenseQuery(budgetQueryOptions(projectId));
  const { data: castCrew } = useSuspenseQuery(castCrewQueryOptions(projectId));
  const { data: allScenes } = useSuspenseQuery(scenesQueryOptions(projectId));
  const { data: rateCardEntries } = useSuspenseQuery(
    rateCardQueryOptions(projectId),
  );
  const { data: dayCosts } = useQuery(dayCostsQueryOptions(projectId));

  const [view, setView] = useState<ViewMode>("category");
  const [isStuck, setIsStuck] = useState(false);
  const [selectedScene, setSelectedScene] = useState<number | null>(null);
  const [showRateCard, setShowRateCard] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsStuck(window.scrollY > 48);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const generateMutation = useMutation({
    mutationFn: () =>
      generateBudget({ data: { projectId } }).then(unwrapResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["budget-cast-crew", projectId] });
      qc.invalidateQueries({ queryKey: ["budget-day-costs", projectId] });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (patch: {
      shootingDays?: number | null;
      contingencyPercent?: number;
    }) =>
      updateBudgetSettings({
        data: { budgetId: budget!.id, ...patch },
      }).then(unwrapResult),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget", projectId] }),
  });

  const updateLineMutation = useMutation({
    mutationFn: (vars: {
      lineId: string;
      patch: {
        actual?: number | null;
        rate?: number | null;
        quantity?: number | null;
      };
    }) => updateBudgetLine({ data: vars }).then(unwrapResult),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget", projectId] }),
  });

  const cast = castCrew?.cast ?? [];
  const crew = castCrew?.crew ?? [];
  const castSceneMap = castCrew?.castSceneMap ?? {};
  const scenes = allScenes ?? [];
  const castTotal = cast.reduce(
    (sum, r) =>
      sum +
      resourceTotal({
        days: num(r.days),
        dayRate: num(r.dayRate),
        fiscalRegime: r.fiscalRegime as FiscalRegime,
        mealAllowance: num(r.mealAllowance),
        accommodation: num(r.accommodation),
      }),
    0,
  );

  const crewTotal = crew
    .filter((r) => r.enabled)
    .reduce(
      (sum, r) =>
        sum +
        resourceTotal({
          days: num(r.days),
          dayRate: num(r.dayRate),
          fiscalRegime: r.fiscalRegime as FiscalRegime,
          mealAllowance: num(r.mealAllowance),
          accommodation: num(r.accommodation),
        }),
      0,
    );

  const allLines = budget?.lines ?? [];

  const lineActual = (l: (typeof allLines)[number]): number =>
    num(l.actual) || num(l.rate) * (num(l.quantity) || 1);

  const lineEstimate = (l: (typeof allLines)[number]): number =>
    num(l.rate) * (num(l.quantity) || 1);

  const productionLines = allLines.filter((l) => l.topSheet === "production");

  const totalsByCategory: Partial<Record<CategoryKey, number>> = {
    cast: castTotal,
    crew: crewTotal,
  };
  for (const line of productionLines) {
    const key = line.linkedCategory
      ? LINKED_TO_CATEGORY[line.linkedCategory]
      : undefined;
    if (!key) continue;
    totalsByCategory[key] = (totalsByCategory[key] ?? 0) + lineActual(line);
  }

  const grandTotal = Object.values(totalsByCategory).reduce(
    (s, v) => s + (v ?? 0),
    0,
  );

  // Cast e Troupe sono sempre visibili anche con totale 0 — il regista deve
  // poter vedere subito che mancano dei rates, non scoprirlo nel tab Cast.
  const CORE_CATEGORIES: ReadonlyArray<CategoryKey> = ["cast", "crew"];
  const sortedCategories = (Object.keys(totalsByCategory) as CategoryKey[])
    .filter(
      (k) => CORE_CATEGORIES.includes(k) || (totalsByCategory[k] ?? 0) > 0,
    )
    .sort((a, b) => (totalsByCategory[b] ?? 0) - (totalsByCategory[a] ?? 0));

  // TODO(audit-2026-05-15): wire deltaPercent to a real `previousBudget` snapshot
  // (compare current grandTotal to last saved budget revision). Until then the
  // pill is hidden — day-zero projects must not see a fake "+4,2% vs preventivo".
  const previousBudget: number | null = null;
  const deltaPercent: number | null =
    previousBudget !== null && previousBudget > 0
      ? ((grandTotal - previousBudget) / previousBudget) * 100
      : null;
  const shootingDays = budget?.shootingDays ?? null;
  const contingencyPercent = budget?.contingencyPercent ?? 10;
  const sceneCount = scenes.length || 0;

  const linesForView = useMemo(() => {
    if (view === "all") return productionLines;
    return productionLines.slice(0, 12);
  }, [view, productionLines]);

  const versionLabel = "v3 · 14 mag 2026";

  return (
    <div className={styles.page} data-testid="budget-page-v2">
      <Viewbar isScrolled={isStuck} className={styles.viewbar}>
        <Tabs
          tabs={[
            { id: "category", label: "Per categoria" },
            // TODO(audit-2026-05-15): re-enable "Per scena" once getSceneCosts
            // server fn lands — current view shows only a dropdown filter with
            // no rendered cost breakdown.
            { id: "day", label: "Per giornata" },
            { id: "all", label: "Tutti i reparti" },
            { id: "cast", label: "Cast" },
          ]}
          activeId={view}
          onSelect={(id) => setView(id as ViewMode)}
        />
        <span className={styles.viewbarRight} />
        {/* TODO(audit-2026-05-15): restore Tariffe ToggleChip when the rate-card
            entry point lands per docs/specs/core/11c-rate-card.md — currently
            the toggle navigates to a broken /dashboard route. */}
        {false && (
          <ToggleChip
            isOn={showRateCard}
            onToggle={() => setShowRateCard((v) => !v)}
            label="Tariffe"
            aria-label="Mostra tariffe"
          />
        )}
        {budget && shootingDays !== null && (
          <SettingChip
            label="Giorni"
            value={shootingDays}
            placeholder="—"
            disabled={false}
            onCommit={(v) => settingsMutation.mutate({ shootingDays: v })}
            suffix=""
            testId="shooting-days"
          />
        )}
        {budget && contingencyPercent !== null && contingencyPercent !== undefined && (
          <SettingChip
            label="Cont."
            value={contingencyPercent}
            placeholder="10"
            disabled={false}
            onCommit={(v) => settingsMutation.mutate({ contingencyPercent: v })}
            suffix="%"
            testId="contingency-percent"
          />
        )}
        <button type="button" className={styles.filter} aria-haspopup="menu">
          {versionLabel} ▾
        </button>
      </Viewbar>

      <main className={styles.main} id="main">
        <div className={styles.content}>
          <div className={styles.heroWrap}>
            <HeroKPI
              eyebrow="TOTALE STIMATO"
              value={eurAmount(grandTotal || 0)}
              delta={
                deltaPercent !== null
                  ? `${deltaPercent >= 0 ? "+" : ""}${deltaPercent.toLocaleString("it-IT", { maximumFractionDigits: 1 })}% vs preventivo`
                  : undefined
              }
              deltaDirection={
                deltaPercent !== null && deltaPercent > 0
                  ? "negative"
                  : "positive"
              }
              sub={
                sceneCount > 0
                  ? `su ${sceneCount} scene${shootingDays ? ` · ${shootingDays} giornate` : ""}`
                  : "Nessuna scena pianificata"
              }
            />
          </div>

          {showRateCard && (
            <section className={styles.section}>
              <RateCardSection
                projectId={projectId}
                entries={rateCardEntries ?? []}
              />
            </section>
          )}

          {view === "category" && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Per categoria</h2>
                <span className={styles.sectionMeta}>
                  {sortedCategories.length} reparti · ordinamento per peso
                </span>
              </header>
              <div className={styles.cats}>
                {sortedCategories.map((key) => {
                  const meta = CATEGORY_META[key];
                  const amount = totalsByCategory[key] ?? 0;
                  const share =
                    grandTotal > 0 ? (amount / grandTotal) * 100 : 0;
                  const delta = mockCategoryDelta(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={styles.cat}
                      style={{
                        ["--cat-color" as string]: `var(${meta.tokenVar})`,
                      }}
                    >
                      <div className={styles.catHead}>
                        <span className={styles.catDot} aria-hidden="true" />
                        <span className={styles.catName}>{meta.label}</span>
                      </div>
                      <div className={styles.catNum}>{eurAmount(amount)}</div>
                      <div className={styles.catFoot}>
                        <span>{share.toFixed(0)}%</span>
                        <span
                          className={
                            delta > 0
                              ? styles.catDeltaPos
                              : delta < 0
                                ? styles.catDeltaNeg
                                : ""
                          }
                        >
                          {delta > 0 ? "+" : ""}
                          {delta.toLocaleString("it-IT", {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}
                          %
                        </span>
                      </div>
                    </button>
                  );
                })}
                {sortedCategories.length === 0 && (
                  <div className={styles.emptyCard}>
                    Nessun reparto con costi. Genera il budget per iniziare.
                  </div>
                )}
              </div>
            </section>
          )}

          {view === "scene" && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Per scena</h2>
                <span className={styles.sectionMeta}>
                  {scenes.length > 0
                    ? `${scenes.length} scene disponibili`
                    : "Nessuna scena"}
                </span>
              </header>
              {scenes.length > 0 ? (
                <div className={styles.sceneFilter}>
                  <label className={styles.sceneFilterLabel}>
                    Filtra per scena
                  </label>
                  <select
                    className={styles.sceneSelect}
                    value={selectedScene ?? ""}
                    onChange={(e) =>
                      setSelectedScene(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    data-testid="scene-select"
                  >
                    <option value="">Tutte le scene</option>
                    {scenes.map((s) => (
                      <option key={s.number} value={s.number}>
                        Sc.{s.number} — {s.heading}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className={styles.emptyCard}>
                  Nessuna scena nello screenplay. Aggiungi scene per vedere
                  costi per scena.
                </div>
              )}
            </section>
          )}

          {view === "day" && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Per giornata</h2>
                <span className={styles.sectionMeta}>
                  {dayCosts?.length ?? 0} giornate
                </span>
              </header>
              <DayView days={dayCosts ?? []} />
            </section>
          )}

          {view === "cast" && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Cast</h2>
                <span className={styles.sectionMeta}>
                  {cast.length} personaggi
                </span>
              </header>
              {cast.length === 0 ? (
                <div className={styles.emptyCard}>
                  Nessun personaggio nel cast — esegui Genera per popolare da
                  breakdown.
                </div>
              ) : (
                <CastWidget
                  cast={cast}
                  castSceneMap={castSceneMap}
                  selectedScene={selectedScene}
                  grandTotal={grandTotal}
                  projectId={projectId}
                />
              )}
            </section>
          )}

          {view === "all" && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Cast e troupe</h2>
                <span className={styles.sectionMeta}>
                  {cast.length} cast · {crew.filter((r) => r.enabled).length}{" "}
                  troupe
                </span>
              </header>
              {cast.length === 0 ? (
                <div className={styles.emptyCard}>
                  Nessun personaggio nel cast — esegui Genera per popolare da
                  breakdown.
                </div>
              ) : (
                <CastWidget
                  cast={cast}
                  castSceneMap={castSceneMap}
                  selectedScene={selectedScene}
                  grandTotal={grandTotal}
                  projectId={projectId}
                />
              )}
              {budget && crew.length > 0 && (
                <div style={{ marginTop: "var(--ds-space-6)" }}>
                  <CrewWidget
                    crew={crew}
                    budgetId={budget.id}
                    grandTotal={grandTotal}
                    projectId={projectId}
                  />
                </div>
              )}
            </section>
          )}

          {(view === "category" || view === "all") && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Voci</h2>
                <span className={styles.sectionMeta}>
                  {(() => {
                    const withDelta = linesForView.filter((l) => {
                      const est = lineEstimate(l);
                      const act = lineActual(l);
                      return est > 0 && Math.abs(act - est) > 0.5;
                    });
                    if (withDelta.length === 0) {
                      return `${linesForView.length} voci · clicca per modificare`;
                    }
                    const maxPct = Math.max(
                      ...withDelta.map((l) => {
                        const est = lineEstimate(l);
                        const act = lineActual(l);
                        return Math.abs(((act - est) / est) * 100);
                      }),
                    );
                    return `${linesForView.length} voci · ${withDelta.length} con scostamento · max ±${maxPct.toFixed(0)}%`;
                  })()}
                </span>
              </header>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>#</th>
                    <th>Voce</th>
                    <th>Reparto</th>
                    <th className={styles.colNum}>Q.tà</th>
                    <th className={styles.colNum}>€/u</th>
                    <th className={styles.colNum}>Stima</th>
                    <th className={styles.colNum}>Effettivo</th>
                    <th className={styles.colNum}>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {linesForView.map((line, idx) => {
                    const catKey = line.linkedCategory
                      ? LINKED_TO_CATEGORY[line.linkedCategory]
                      : undefined;
                    const meta = catKey ? CATEGORY_META[catKey] : null;
                    const estimate = lineEstimate(line);
                    const actual = lineActual(line);
                    const delta = actual - estimate;
                    const deltaCls =
                      delta > 0
                        ? styles.deltaPos
                        : delta < 0
                          ? styles.deltaNeg
                          : styles.deltaZero;
                    return (
                      <tr key={line.id}>
                        <td>
                          <span className={styles.rowNum}>
                            {String(idx + 1).padStart(3, "0")}
                          </span>
                        </td>
                        <td>{line.name}</td>
                        <td>
                          {meta ? (
                            <span
                              className={styles.rowCat}
                              style={{
                                ["--cat-color" as string]: `var(${meta.tokenVar})`,
                              }}
                            >
                              {meta.label}
                            </span>
                          ) : (
                            <span style={{ color: "var(--ds-text-faint)" }}>
                              —
                            </span>
                          )}
                        </td>
                        <td className={styles.colNum}>
                          <NumberCell
                            value={num(line.quantity) || 1}
                            format={(v) =>
                              v.toLocaleString("it-IT", {
                                maximumFractionDigits: 2,
                              })
                            }
                            onCommit={(v) =>
                              updateLineMutation.mutate({
                                lineId: line.id,
                                patch: { quantity: v },
                              })
                            }
                            disabled={updateLineMutation.isPending}
                            testId="quantity-cell"
                          />
                        </td>
                        <td className={styles.colNum}>
                          <NumberCell
                            value={num(line.rate)}
                            format={(v) => eurAmount(v)}
                            onCommit={(v) =>
                              updateLineMutation.mutate({
                                lineId: line.id,
                                patch: { rate: v },
                              })
                            }
                            disabled={updateLineMutation.isPending}
                            testId="rate-cell"
                          />
                        </td>
                        <td className={styles.colNum}>
                          {eurAmount(estimate)}
                        </td>
                        <td className={styles.colNum}>
                          <EffectiveCell
                            value={line.actual === null ? null : num(line.actual)}
                            fallback={estimate}
                            onCommit={(v) =>
                              updateLineMutation.mutate({
                                lineId: line.id,
                                patch: { actual: v },
                              })
                            }
                            disabled={updateLineMutation.isPending}
                          />
                        </td>
                        <td className={`${styles.colNum} ${deltaCls}`}>
                          {delta === 0
                            ? "—"
                            : `${delta > 0 ? "+" : "−"}${eurAmount(Math.abs(delta))}`}
                        </td>
                      </tr>
                    );
                  })}
                  {linesForView.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        style={{
                          textAlign: "center",
                          color: "var(--ds-text-faint)",
                          padding: "var(--ds-space-6)",
                        }}
                      >
                        Nessuna linea di budget. Genera il budget per iniziare.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          )}
        </div>

      </main>

      <FloatingDock

        primaryAction={{
          label: generateMutation.isPending ? "Generando…" : "Rigenera",
          hotkey: "⌘R",
          onClick: () => generateMutation.mutate(),
        }}
        secondaryActions={[
          { label: "Salva", onClick: () => undefined },
          { label: "Esporta", hotkey: "⌘E", onClick: () => undefined },
        ]}
        cesareNoteCount={0}
        onCesareClick={() => undefined}
      />
    </div>
  );
}

interface EffectiveCellProps {
  value: number | null;
  fallback: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
}

function EffectiveCell({
  value,
  fallback,
  onCommit,
  disabled,
}: EffectiveCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const display = value !== null ? value : fallback;

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) onCommit(n);
  };

  if (editing) {
    return (
      <input
        className={styles.cellInput}
        type="number"
        min="0"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        data-testid="effective-input"
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.cellBtn}
      disabled={disabled}
      onClick={() => {
        setDraft(value !== null ? String(value) : "");
        setEditing(true);
      }}
      data-testid="effective-cell"
    >
      {eurAmount(display)}
    </button>
  );
}

interface NumberCellProps {
  value: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
  disabled?: boolean;
  testId?: string;
}

function NumberCell({
  value,
  format,
  onCommit,
  disabled,
  testId,
}: NumberCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0 && n !== value) onCommit(n);
  };

  if (editing) {
    return (
      <input
        className={styles.cellInput}
        type="number"
        min="0"
        step="any"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        data-testid={testId ? `${testId}-input` : undefined}
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.cellBtn}
      disabled={disabled}
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      data-testid={testId}
    >
      {format(value)}
    </button>
  );
}

interface SettingChipProps {
  label: string;
  value: number | null;
  placeholder: string;
  disabled: boolean;
  onCommit: (v: number) => void;
  suffix: string;
  testId?: string;
}

function SettingChip({
  label,
  value,
  placeholder,
  disabled,
  onCommit,
  suffix,
  testId,
}: SettingChipProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) onCommit(n);
  };

  if (editing) {
    return (
      <span className={styles.chip}>
        <span className={styles.chipLabel}>{label}</span>
        <input
          className={styles.chipInput}
          type="number"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          data-testid={testId}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      className={styles.chip}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          setDraft(String(value ?? ""));
          setEditing(true);
        }
      }}
      data-testid={testId}
    >
      <span className={styles.chipLabel}>{label}</span>
      <span className={styles.chipValue}>
        {value !== null ? `${value}${suffix}` : placeholder}
      </span>
    </button>
  );
}

function mockCategoryDelta(key: CategoryKey): number {
  const map: Record<CategoryKey, number> = {
    cast: 1.8,
    crew: 0,
    locations: 8.1,
    scenografia: 2.0,
    costumi: 5.1,
    fotografia: 3.4,
    suono: 0,
    vfx: 0,
    comparse: 0,
    vehicles: 0,
  };
  return map[key];
}
