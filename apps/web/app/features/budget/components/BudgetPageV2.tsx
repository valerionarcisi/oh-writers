import { useEffect, useState } from "react";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import {
  HeroKPI,
  MarginNote,
  Viewbar,
  ViewbarSep,
  FloatingDock,
} from "@oh-writers/ui";
import { resourceTotal } from "@oh-writers/domain";
import type { FiscalRegime } from "@oh-writers/domain";
import { unwrapResult } from "@oh-writers/utils";
import {
  getBudget,
  generateBudget,
  getCastAndCrew,
  getProjectScenes,
} from "../server/budget.server";
import styles from "./BudgetPageV2.module.css";

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

type ViewMode = "category" | "scene" | "day" | "all";

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

interface BudgetPageV2Props {
  projectId: string;
}

export function BudgetPageV2({ projectId }: BudgetPageV2Props) {
  const qc = useQueryClient();
  const { data: budget } = useSuspenseQuery(budgetQueryOptions(projectId));
  const { data: castCrew } = useSuspenseQuery(castCrewQueryOptions(projectId));
  const { data: allScenes } = useSuspenseQuery(scenesQueryOptions(projectId));

  const [view, setView] = useState<ViewMode>("category");
  const [isStuck, setIsStuck] = useState(false);

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

  const cast = castCrew?.cast ?? [];
  const crew = castCrew?.crew ?? [];
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

  const sortedCategories = (Object.keys(totalsByCategory) as CategoryKey[])
    .filter((k) => (totalsByCategory[k] ?? 0) > 0)
    .sort((a, b) => (totalsByCategory[b] ?? 0) - (totalsByCategory[a] ?? 0));

  const deltaPercent = 4.2; // placeholder vs preventivo
  const shootingDays = budget?.shootingDays ?? 22;
  const sceneCount = scenes.length || 28;

  const visibleLines = productionLines.slice(0, 12);

  const versionLabel = "v3 · 14 mag 2026";

  return (
    <div className={styles.page} data-testid="budget-page-v2">
      <Viewbar isScrolled={isStuck} className={styles.viewbar}>
        <button
          type="button"
          className={`${styles.filter} ${view === "category" ? styles.isActive : ""}`}
          onClick={() => setView("category")}
        >
          Per categoria
        </button>
        <button
          type="button"
          className={`${styles.filter} ${view === "scene" ? styles.isActive : ""}`}
          onClick={() => setView("scene")}
        >
          Per scena
        </button>
        <button
          type="button"
          className={`${styles.filter} ${view === "day" ? styles.isActive : ""}`}
          onClick={() => setView("day")}
        >
          Per giornata
        </button>
        <ViewbarSep />
        <button
          type="button"
          className={`${styles.filter} ${view === "all" ? styles.isActive : ""}`}
          onClick={() => setView("all")}
        >
          Tutti i reparti
        </button>
        <span className={styles.viewbarRight} />
        <button type="button" className={styles.filter} aria-haspopup="menu">
          {versionLabel} ▾
        </button>
      </Viewbar>

      <main className={styles.main} id="main">
        <div className={styles.content}>
          <div className={styles.heroWrap}>
            <HeroKPI
              eyebrow="TOTALE STIMATO"
              value={eurAmount(grandTotal || 1247000)}
              delta={`+${deltaPercent.toLocaleString("it-IT")}% vs preventivo`}
              deltaDirection="negative"
              sub={`su ${sceneCount} scene · ${shootingDays} giornate`}
            />
          </div>

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
                const share = grandTotal > 0 ? (amount / grandTotal) * 100 : 0;
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
            </div>
          </section>

          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Linee di budget</h2>
              <span className={styles.sectionMeta}>
                {productionLines.length} voci · effettivo modificabile
              </span>
            </header>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th>Voce</th>
                  <th>Reparto</th>
                  <th className={styles.colNum}>Stima</th>
                  <th className={styles.colNum}>Effettivo</th>
                  <th className={styles.colNum}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines.map((line, idx) => {
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
                      <td className={styles.colNum}>{eurAmount(estimate)}</td>
                      <td className={styles.colNum}>{eurAmount(actual)}</td>
                      <td className={`${styles.colNum} ${deltaCls}`}>
                        {delta === 0
                          ? "—"
                          : `${delta > 0 ? "+" : "−"}${eurAmount(Math.abs(delta))}`}
                      </td>
                    </tr>
                  );
                })}
                {visibleLines.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
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
        </div>

        <aside className={styles.margin} aria-label="Note di Cesare">
          <div className={styles.marginLabel}>Note di Cesare</div>
          <div className={styles.marginNotes}>
            <MarginNote
              kind="dramaturg"
              text="Hai segnato 2.222 € per la Pizzeria. La media per location di 5 giorni con permessi comunali a Roma è ~18.000 €. Sicuro non sia un typo?"
              onAccept={() => undefined}
              onIgnore={() => undefined}
            />
            <MarginNote
              kind="producer"
              text="Il DOP ha richiesto un'unità extra notte per sc.18-21. Suggerisco di aggiungere 12.000 € al reparto."
              onAccept={() => undefined}
              onIgnore={() => undefined}
            />
            <MarginNote
              kind="dramaturg"
              text="Giulia ha già firmato per 115k. Ho aggiornato lo storico, il preventivo originale (120k) resta come riferimento."
              onAccept={() => undefined}
            />
          </div>
        </aside>
      </main>

      <FloatingDock
        label="BUDGET"
        primaryAction={{
          label: "Rigenera",
          hotkey: "⌘R",
          onClick: () => generateMutation.mutate(),
        }}
        secondaryActions={[
          { label: "Salva", onClick: () => undefined },
          { label: "Esporta", hotkey: "⌘E", onClick: () => undefined },
        ]}
        cesareNoteCount={3}
        onCesareClick={() => undefined}
      />
    </div>
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
