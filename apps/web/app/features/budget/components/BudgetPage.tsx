import { useState, useEffect } from "react";
import {
  useSuspenseQuery,
  useQuery,
  useMutation,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { resourceTotal } from "@oh-writers/domain";
import type { FiscalRegime } from "@oh-writers/domain";
import {
  getBudget,
  generateBudget,
  getCastAndCrew,
  getProjectScenes,
  getRateCard,
  getDayCosts,
  updateBudgetSettings,
} from "../server/budget.server";
import { unwrapResult } from "@oh-writers/utils";
import { TotalWidget } from "./widgets/TotalWidget";
import { CastWidget } from "./widgets/CastWidget";
import { CrewWidget } from "./widgets/CrewWidget";
import { MiscWidget } from "./widgets/MiscWidget";
import { RateCardSection } from "./RateCardSection";
import { CategoryLineWidget } from "./widgets/CategoryLineWidget";
import { LocationsWidget, VehiclesWidget } from "./widgets/LocationsWidget";
import { DayView } from "./widgets/DayView";
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

const parseNum = (v: string) => Number(v);

const PRODUCTION_CATEGORY_CONFIG = [
  { linkedCategory: "equipment", icon: "🎬", title: "Fotografia" },
  { linkedCategory: "sound", icon: "🎵", title: "Suono" },
  { linkedCategory: "props", icon: "🏛", title: "Scenografia" },
  { linkedCategory: "wardrobe", icon: "👗", title: "Costumi & Make-up" },
  { linkedCategory: "extras", icon: "👥", title: "Comparse" },
  { linkedCategory: "vfx", icon: "✨", title: "VFX / SFX" },
  { linkedCategory: "stunts", icon: "🎯", title: "Stunt" },
  { linkedCategory: "animals", icon: "🐾", title: "Animali" },
] as const;

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

  const [view, setView] = useState<"category" | "day">("category");
  const [selectedScene, setSelectedScene] = useState<number | null>(null);

  const generateMutation = useMutation({
    mutationFn: () =>
      generateBudget({ data: { projectId } }).then(unwrapResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["budget-cast-crew", projectId] });
      qc.invalidateQueries({ queryKey: ["budget-day-costs", projectId] });
    },
    onError: () => {},
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

  // Auto-generate on first visit when no budget exists and there are scenes
  useEffect(() => {
    if (!budget && scenes.length > 0 && !generateMutation.isPending) {
      generateMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cast = castCrew?.cast ?? [];
  const crew = castCrew?.crew ?? [];
  const castSceneMap = castCrew?.castSceneMap ?? {};
  const scenes = allScenes ?? [];

  const filteredCast =
    selectedScene === null
      ? cast
      : cast.filter((r) => (castSceneMap[r.id] ?? []).includes(selectedScene));

  const sceneRatio = (rowId: string): number => {
    if (selectedScene === null) return 1;
    const rowScenes = castSceneMap[rowId] ?? [];
    return rowScenes.length > 0 ? 1 / rowScenes.length : 0;
  };

  const castTotal =
    selectedScene === null
      ? filteredCast.reduce(
          (sum, r) =>
            sum +
            resourceTotal({
              days: parseNum(r.days),
              dayRate: parseNum(r.dayRate),
              fiscalRegime: r.fiscalRegime as FiscalRegime,
              mealAllowance: parseNum(r.mealAllowance),
              accommodation: parseNum(r.accommodation),
            }),
          0,
        )
      : filteredCast.reduce((sum, r) => {
          const full = resourceTotal({
            days: parseNum(r.days),
            dayRate: parseNum(r.dayRate),
            fiscalRegime: r.fiscalRegime as FiscalRegime,
            mealAllowance: parseNum(r.mealAllowance),
            accommodation: parseNum(r.accommodation),
          });
          return sum + full * sceneRatio(r.id);
        }, 0);

  const crewTotal = crew
    .filter((r) => r.enabled)
    .reduce(
      (sum, r) =>
        sum +
        resourceTotal({
          days: parseNum(r.days),
          dayRate: parseNum(r.dayRate),
          fiscalRegime: r.fiscalRegime as FiscalRegime,
          mealAllowance: parseNum(r.mealAllowance),
          accommodation: parseNum(r.accommodation),
        }),
      0,
    );

  const productionLines =
    budget?.lines.filter((l) => l.topSheet === "production") ?? [];
  const miscLines =
    budget?.lines.filter((l) => l.topSheet === "contingency") ?? [];

  const locationLines = productionLines.filter(
    (l) => l.linkedCategory === "locations",
  );
  const vehicleLines = productionLines.filter(
    (l) => l.linkedCategory === "vehicles",
  );

  // Active element IDs — used to detect stale lines whose element was removed
  const activeElementIds = new Set(
    cast.map((r) => r.elementId).filter(Boolean) as string[],
  );

  const productionTotal = productionLines.reduce(
    (sum, l) => sum + (l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1)),
    0,
  );
  const miscTotal = miscLines.reduce(
    (sum, l) => sum + (l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1)),
    0,
  );

  const grandTotal = castTotal + crewTotal + productionTotal + miscTotal;
  const contingencyPercent = budget?.contingencyPercent ?? 10;
  const shootingDays = budget?.shootingDays ?? null;
  const hasDayCosts = (dayCosts?.length ?? 0) > 0;

  return (
    <div className={styles.page} data-testid="budget-page">
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarLabel}>Giorni ripresa:</span>
          <SettingField
            value={shootingDays}
            placeholder="—"
            disabled={!budget}
            onCommit={(v) => settingsMutation.mutate({ shootingDays: v })}
            suffix=""
            data-testid="shooting-days"
          />
          <span className={styles.toolbarLabel}>Contingenza:</span>
          <SettingField
            value={contingencyPercent}
            placeholder="10"
            disabled={!budget}
            onCommit={(v) => settingsMutation.mutate({ contingencyPercent: v })}
            suffix="%"
            data-testid="contingency-percent"
          />
          {scenes.length > 0 && (
            <>
              <div className={styles.toolbarDivider} />
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
              {selectedScene !== null && (
                <span className={styles.sceneTotal}>
                  {new Intl.NumberFormat("it-IT", {
                    style: "currency",
                    currency: "EUR",
                    maximumFractionDigits: 0,
                  }).format(castTotal)}
                </span>
              )}
            </>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
          }}
        >
          <div className={styles.viewToggle}>
            <button
              type="button"
              className={`${styles.viewBtn} ${view === "category" ? styles.active : ""}`}
              onClick={() => setView("category")}
            >
              Per categoria
            </button>
            <button
              type="button"
              className={`${styles.viewBtn} ${view === "day" ? styles.active : ""}`}
              onClick={() => setView("day")}
              disabled={!hasDayCosts}
              title={
                !hasDayCosts
                  ? "Pianifica le giornate nello schedule per attivare questa vista"
                  : undefined
              }
            >
              Per giornata
            </button>
          </div>
          <button
            type="button"
            className={styles.generateBtn}
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="generate-budget-btn"
          >
            {generateMutation.isPending
              ? "Generando…"
              : budget
                ? "Rigenera"
                : "Genera budget"}
          </button>
        </div>
      </div>

      {generateMutation.isError && (
        <div className={styles.error}>
          {(generateMutation.error as { _tag?: string })?._tag ===
          "NoBreakdownError"
            ? "Completa prima il breakdown delle scene per generare il budget."
            : "Errore nella generazione. Verifica che il breakdown sia stato completato."}
        </div>
      )}

      <RateCardSection projectId={projectId} entries={rateCardEntries ?? []} />

      <div className={styles.grid}>
        <div className={styles.sideCol}>
          <TotalWidget
            castTotal={castTotal}
            crewTotal={crewTotal}
            productionLines={productionLines}
            miscTotal={miscTotal}
            contingencyPercent={contingencyPercent}
          />
        </div>
        <div className={styles.mainCol}>
          {view === "category" ? (
            <>
              <div className={styles.categoryGroup}>
                <span className={styles.groupLabel}>Cast & Crew</span>
                <CastWidget
                  cast={filteredCast}
                  castSceneMap={castSceneMap}
                  selectedScene={selectedScene}
                  grandTotal={grandTotal}
                  projectId={projectId}
                />
                {(crew.length > 0 || budget) && (
                  <CrewWidget
                    crew={crew}
                    budgetId={budget?.id ?? ""}
                    grandTotal={grandTotal}
                    projectId={projectId}
                  />
                )}
              </div>

              {budget && (
                <div className={styles.categoryGroup}>
                  <span className={styles.groupLabel}>
                    Produzione — da breakdown
                  </span>
                  <LocationsWidget
                    lines={locationLines}
                    activeElementIds={activeElementIds}
                    projectId={projectId}
                  />
                  <VehiclesWidget
                    lines={vehicleLines}
                    activeElementIds={activeElementIds}
                    projectId={projectId}
                  />
                  {PRODUCTION_CATEGORY_CONFIG.map(
                    ({ linkedCategory, icon, title }) => {
                      const line =
                        productionLines.find(
                          (l) =>
                            l.linkedCategory === linkedCategory &&
                            l.linkedElementId === null,
                        ) ?? null;
                      if (!line) return null;
                      const elementCount = Number(line.quantity ?? 0);
                      return (
                        <CategoryLineWidget
                          key={linkedCategory}
                          icon={icon}
                          title={title}
                          line={line}
                          elementCount={elementCount}
                          projectId={projectId}
                        />
                      );
                    },
                  )}
                </div>
              )}

              {miscLines.length > 0 && (
                <MiscWidget
                  lines={miscLines}
                  total={miscTotal}
                  projectId={projectId}
                />
              )}
            </>
          ) : (
            <DayView days={dayCosts ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}

function SettingField({
  value,
  placeholder,
  disabled,
  onCommit,
  suffix,
  ...rest
}: {
  value: number | null;
  placeholder: string;
  disabled: boolean;
  onCommit: (v: number) => void;
  suffix: string;
  "data-testid"?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) onCommit(n);
  };

  if (editing) {
    return (
      <input
        className={styles.settingInput}
        type="number"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        {...rest}
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.settingBtn}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          setDraft(String(value ?? ""));
          setEditing(true);
        }
      }}
      {...rest}
    >
      {value !== null ? `${value}${suffix}` : placeholder}
    </button>
  );
}
