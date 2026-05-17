import { useEffect, useMemo, useState } from "react";
import {
  useSuspenseQuery,
  useQuery,
  useMutation,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { Viewbar, FloatingDock, SegmentedControl, DropdownMenu } from "@oh-writers/ui";
import { useCesareOpen } from "~/features/app-shell";
import { resourceTotal } from "@oh-writers/domain";
import type { Budget, FiscalRegime } from "@oh-writers/domain";
import { unwrapResult } from "@oh-writers/utils";
import {
  getBudget,
  generateBudget,
  getCastAndCrew,
  getProjectScenes,
  getRateCard,
  getDayCosts,
  getBudgetOverview,
  updateBudgetSettings,
  type BudgetOverview,
} from "../server/budget.server";
import type { CastSceneMap } from "../server/budget.server";
import type { BudgetCast, BudgetCrew } from "@oh-writers/db/schema";
import {
  CATEGORY_COLOR_VARS,
  CATEGORY_LABELS,
  type BudgetCategoryKey,
} from "../server/budget-helpers";
import { OverviewSection } from "./overview/OverviewSection";
import { ProductionDrillDown } from "./drilldowns/ProductionDrillDown";
import { DayView } from "./widgets/DayView";
import { CastWidget } from "./widgets/CastWidget";
import { CrewWidget } from "./widgets/CrewWidget";
import { CategoryFlatTable } from "./CategoryFlatTable";
import { RateCardSection } from "./RateCardSection";
import { SectionIds, type SectionId } from "./flat-sections";
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

const overviewQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget-overview", projectId],
    queryFn: () =>
      getBudgetOverview({ data: { projectId } }).then(unwrapResult),
  });

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

type ViewMode = "overview" | "category" | "day";

interface BudgetPageProps {
  projectId: string;
}

export function BudgetPage({ projectId }: BudgetPageProps) {
  const qc = useQueryClient();
  const openCesare = useCesareOpen();
  const { data: budget } = useSuspenseQuery(budgetQueryOptions(projectId));
  const { data: castCrew } = useSuspenseQuery(castCrewQueryOptions(projectId));
  const { data: allScenes } = useSuspenseQuery(scenesQueryOptions(projectId));
  const { data: rateCard } = useSuspenseQuery(rateCardQueryOptions(projectId));
  const { data: dayCosts } = useQuery(dayCostsQueryOptions(projectId));
  const { data: overview } = useQuery(overviewQueryOptions(projectId));

  const [view, setView] = useState<ViewMode>("overview");
  const [drillCategory, setDrillCategory] =
    useState<BudgetCategoryKey | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [selectedScene, setSelectedScene] = useState<number | null>(null);
  const [focusSection, setFocusSection] = useState<SectionId | null>(null);
  const [detailSection, setDetailSection] = useState<SectionId | null>(null);
  const [categoryTotal, setCategoryTotal] = useState<number | null>(null);

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
      qc.invalidateQueries({ queryKey: ["budget-overview", projectId] });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["budget-overview", projectId] });
    },
  });

  const cast = castCrew?.cast ?? [];
  const crew = castCrew?.crew ?? [];
  const castSceneMap = castCrew?.castSceneMap ?? {};
  const scenes = allScenes ?? [];

  const fallbackOverview: BudgetOverview = useMemo(() => {
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
    const grandTotal = castTotal + crewTotal;
    return {
      grandTotal,
      contingencyAmount: 0,
      castTotal,
      crewTotal,
      productionTotal: 0,
      previousTotal: null,
      deltaPercent: null,
      shootingDays: budget?.shootingDays ?? null,
      sceneCount: scenes.length,
      perDay: null,
      perScene: null,
      status: (budget?.status ?? "draft") as
        | "draft"
        | "estimated"
        | "locked",
      categories: [
        {
          id: "cast",
          label: CATEGORY_LABELS.cast,
          colorVar: CATEGORY_COLOR_VARS.cast,
          total: castTotal,
          percent: grandTotal > 0 ? (castTotal / grandTotal) * 100 : 0,
          resourceCount: cast.length,
          status: castTotal > 0 ? "ok" : "missing",
          statusReason: castTotal > 0 ? null : "Genera per stimare",
          sparkline: [0, 0, 0, 0, 0, castTotal],
        },
        {
          id: "crew",
          label: CATEGORY_LABELS.crew,
          colorVar: CATEGORY_COLOR_VARS.crew,
          total: crewTotal,
          percent: grandTotal > 0 ? (crewTotal / grandTotal) * 100 : 0,
          resourceCount: crew.filter((r) => r.enabled).length,
          status: crewTotal > 0 ? "ok" : "missing",
          statusReason: crewTotal > 0 ? null : "Genera per stimare",
          sparkline: [0, 0, 0, 0, 0, crewTotal],
        },
      ],
      lockedCategoryCount: 0,
      missingRatesCount: 0,
    };
  }, [cast, crew, budget, scenes.length]);

  const effectiveOverview: BudgetOverview = overview ?? fallbackOverview;

  const shootingDays = budget?.shootingDays ?? null;
  const contingencyPercent = budget?.contingencyPercent ?? 10;

  const versionLabel = "v3 · 14 mag 2026";

  const handleDrillDown = (categoryId: BudgetCategoryKey) => {
    setView("category");
    setDrillCategory(categoryId);
  };

  return (
    <div className={styles.page} data-testid="budget-page-v2">
      <Viewbar isScrolled={isStuck} className={styles.viewbar}>
        <SegmentedControl
          options={[
            { id: "overview", label: "Panoramica" },
            { id: "category", label: "Per categoria" },
            { id: "day", label: "Per giornata" },
          ]}
          activeId={view}
          onSelect={(id) => {
            setView(id as ViewMode);
            if (id !== "category") setDrillCategory(null);
          }}
          ariaLabel="Vista budget"
        />
        <span className={styles.viewbarRight} />
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
        {budget &&
          contingencyPercent !== null &&
          contingencyPercent !== undefined && (
            <SettingChip
              label="Cont."
              value={contingencyPercent}
              placeholder="10"
              disabled={false}
              onCommit={(v) =>
                settingsMutation.mutate({ contingencyPercent: v })
              }
              suffix="%"
              testId="contingency-percent"
            />
          )}
        <DropdownMenu
          trigger={
            <button type="button" className={styles.filter}>
              {versionLabel} ▾
            </button>
          }
          items={[
            {
              label: "Analisi di mercato",
              onClick: () => window.open("/market-analysis.html", "_blank"),
            },
          ]}
          align="end"
        />
      </Viewbar>

      <main className={styles.main} id="main">
        <div className={styles.content}>
          {view === "overview" && (
            <OverviewSection
              overview={effectiveOverview}
              onDrillDown={handleDrillDown}
            />
          )}

          {view === "category" && (
            <>
              <RateCardSection
                projectId={projectId}
                entries={rateCard ?? []}
              />
              {budget && (
                <section className={styles.section}>
                  <header className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Tutte le voci</h2>
                    <span className={styles.sectionMeta}>
                      Modifica diretta · ⌘K per cercare · Tab per saltare campo
                    </span>
                  </header>
                  <CategoryFlatTable
                    projectId={projectId}
                    budget={budget}
                    cast={cast}
                    crew={crew}
                    onOpenDetail={(id) => setDetailSection(id)}
                    initialFocusSection={focusSection}
                    onGrandTotal={setCategoryTotal}
                  />
                </section>
              )}
              {!budget && (
                <div className={styles.emptyCard}>
                  Configura le tariffe, poi premi{" "}
                  <strong>Rigenera</strong> per generare il budget.
                </div>
              )}
            </>
          )}

          {view === "category" && detailSection && budget && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>
                  Vista dettagliata · {detailSection}
                </h2>
                <button
                  type="button"
                  className={styles.filter}
                  onClick={() => setDetailSection(null)}
                >
                  Chiudi ✕
                </button>
              </header>
              {detailSection === SectionIds.CAST && (
                <CastWidget
                  cast={cast}
                  castSceneMap={castSceneMap}
                  selectedScene={selectedScene}
                  grandTotal={effectiveOverview.grandTotal}
                  projectId={projectId}
                  budgetId={budget.id}
                />
              )}
              {detailSection === SectionIds.CREW && (
                <CrewWidget
                  crew={crew}
                  budgetId={budget.id}
                  grandTotal={effectiveOverview.grandTotal}
                  projectId={projectId}
                />
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
        onCesareClick={openCesare}
      />

      {view === "category" && categoryTotal !== null && (
        <FloatingDock
          position="bottom-left"
          label="Totale stimato"
          infoChips={[
            {
              label: "totale",
              value: new Intl.NumberFormat("it-IT", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              }).format(categoryTotal),
            },
          ]}
        />
      )}
    </div>
  );
}

// ─── Category view ──────────────────────────────────────────────────────────

interface CategoryViewProps {
  readonly overview: BudgetOverview;
  readonly drillCategory: BudgetCategoryKey | null;
  readonly onDrillDown: (id: BudgetCategoryKey) => void;
  readonly onClose: () => void;
  readonly cast: ReadonlyArray<BudgetCast>;
  readonly castSceneMap: CastSceneMap;
  readonly crew: ReadonlyArray<BudgetCrew>;
  readonly budget: Budget | null;
  readonly projectId: string;
}

function CategoryView({
  overview,
  drillCategory,
  onDrillDown,
  onClose,
  cast,
  castSceneMap,
  crew,
  budget,
  projectId,
}: CategoryViewProps) {
  if (drillCategory !== null) {
    return (
      <div className={styles.drillWrap}>
        <button
          type="button"
          className={styles.backLink}
          onClick={onClose}
          data-testid="drill-back"
        >
          ← Torna a tutte le categorie
        </button>
        <CategoryDrillContent
          categoryId={drillCategory}
          overview={overview}
          cast={cast}
          castSceneMap={castSceneMap}
          crew={crew}
          budget={budget}
          projectId={projectId}
        />
      </div>
    );
  }

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Per categoria</h2>
        <span className={styles.sectionMeta}>
          {overview.categories.length} reparti · clicca per dettaglio
        </span>
      </header>
      <div className={styles.cats}>
        {overview.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={styles.cat}
            style={{ ["--cat-color" as string]: `var(${c.colorVar})` }}
            onClick={() => onDrillDown(c.id)}
            data-testid={`category-card-${c.id}`}
          >
            <div className={styles.catHead}>
              <span className={styles.catDot} aria-hidden="true" />
              <span className={styles.catName}>{c.label}</span>
            </div>
            <div className={styles.catNum}>
              {c.total > 0
                ? new Intl.NumberFormat("it-IT", {
                    style: "currency",
                    currency: "EUR",
                    maximumFractionDigits: 0,
                  }).format(c.total)
                : "—"}
            </div>
            <div className={styles.catFoot}>
              <span>{c.percent.toFixed(0)}%</span>
              <span>{c.resourceCount} voci</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

interface CategoryDrillContentProps {
  readonly categoryId: BudgetCategoryKey;
  readonly overview: BudgetOverview;
  readonly cast: ReadonlyArray<BudgetCast>;
  readonly castSceneMap: CastSceneMap;
  readonly crew: ReadonlyArray<BudgetCrew>;
  readonly budget: Budget | null;
  readonly projectId: string;
}

function CategoryDrillContent({
  categoryId,
  overview,
  cast,
  castSceneMap,
  crew,
  budget,
  projectId,
}: CategoryDrillContentProps) {
  if (categoryId === "cast") {
    if (!budget)
      return (
        <div className={styles.emptyCard}>
          Genera il budget per poter gestire il cast.
        </div>
      );
    return (
      <CastWidget
        cast={[...cast]}
        castSceneMap={castSceneMap}
        selectedScene={null}
        grandTotal={overview.grandTotal}
        projectId={projectId}
        budgetId={budget.id}
      />
    );
  }
  if (categoryId === "crew") {
    if (!budget || crew.length === 0)
      return (
        <div className={styles.emptyCard}>
          Nessun ruolo di troupe — esegui Genera per popolare.
        </div>
      );
    return (
      <CrewWidget
        crew={[...crew]}
        budgetId={budget.id}
        grandTotal={overview.grandTotal}
        projectId={projectId}
      />
    );
  }
  if (!budget) {
    return (
      <div className={styles.emptyCard}>
        Nessun budget generato — esegui Genera per popolare la categoria.
      </div>
    );
  }
  return (
    <ProductionDrillDown
      budget={budget}
      budgetId={budget.id}
      initialTab={mapCategoryToProductionTab(categoryId)}
      projectId={projectId}
    />
  );
}

const mapCategoryToProductionTab = (
  key: BudgetCategoryKey,
):
  | "locations"
  | "fotografia"
  | "suono"
  | "scenografia"
  | "costumi"
  | "vehicles"
  | "comparse"
  | "vfx" => {
  switch (key) {
    case "locations":
      return "locations";
    case "fotografia":
      return "fotografia";
    case "suono":
      return "suono";
    case "scenografia":
      return "scenografia";
    case "costumi":
      return "costumi";
    case "vehicles":
      return "vehicles";
    case "comparse":
      return "comparse";
    case "vfx":
      return "vfx";
    default:
      return "locations";
  }
};

// ─── Setting chip in viewbar ────────────────────────────────────────────────

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
