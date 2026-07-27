import { Suspense, useMemo } from "react";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { CATEGORY_META, type BreakdownCategory } from "@oh-writers/domain";
import { RecapStrip } from "~/features/predictions";
import {
  sceneCostEstimateOptions,
  breakdownForSceneOptions,
} from "../hooks/useBreakdown";
import {
  getBudget,
  addBudgetLine,
} from "~/features/budget/server/budget.server";
import type { BreakdownSceneSummary } from "../server/breakdown.server";

// Mockup-driven order for the scene recap chips. Locations / cast first because
// they drive cost; misc categories tail the strip.
const RECAP_CATEGORY_ORDER: ReadonlyArray<BreakdownCategory> = [
  "cast",
  "locations",
  "props",
  "set_dress",
  "wardrobe",
  "makeup",
  "vfx",
  "sfx",
  "sound",
  "vehicles",
  "extras",
  "stunts",
  "animals",
  "atmosphere",
  "equipment",
];

interface Props {
  projectId: string;
  scene: BreakdownSceneSummary | null;
  sceneNumber: number;
  versionId: string;
}

const sceneLabel = (scene: BreakdownSceneSummary): string => {
  const tod = scene.timeOfDay ? ` — ${scene.timeOfDay.toUpperCase()}` : "";
  return `${scene.intExt}. ${scene.location.toUpperCase()}${tod}`;
};

export function BreakdownRecapStrip({
  projectId,
  scene,
  sceneNumber,
  versionId,
}: Props) {
  if (!scene) return null;
  return (
    <Suspense fallback={null}>
      <BreakdownRecapStripInner
        projectId={projectId}
        scene={scene}
        sceneNumber={sceneNumber}
        versionId={versionId}
      />
    </Suspense>
  );
}

function BreakdownRecapStripInner({
  projectId,
  scene,
  sceneNumber,
  versionId,
}: Props & { scene: BreakdownSceneSummary }) {
  const { data: estimate } = useSuspenseQuery(
    sceneCostEstimateOptions(projectId, sceneNumber, versionId),
  );
  const { data: sceneData } = useSuspenseQuery(
    breakdownForSceneOptions(scene.id, versionId),
  );

  const categoryItems = useMemo(() => {
    const counts = new Map<BreakdownCategory, number>();
    for (const occ of sceneData) {
      counts.set(
        occ.element.category,
        (counts.get(occ.element.category) ?? 0) + 1,
      );
    }
    return RECAP_CATEGORY_ORDER.filter((cat) => counts.has(cat)).map((cat) => ({
      category: cat,
      label: CATEGORY_META[cat].labelIt,
      count: counts.get(cat) ?? 0,
    }));
  }, [sceneData]);

  const addToBudget = useMutation({
    mutationFn: async () => {
      const budget = unwrapResult(await getBudget({ data: { projectId } }));
      if (!budget) throw new Error("Budget non ancora generato");
      const linkedCategoryByCategory: Record<string, string | null> = {
        cast: "cast",
        crew: "crew",
        locations: "locations",
        equipment: "equipment",
        sfx: "sfx",
        vfx: "vfx",
        catering: null,
      };
      for (const line of estimate.lines) {
        if (line.amount <= 0) continue;
        unwrapResult(
          await addBudgetLine({
            data: {
              budgetId: budget.id,
              topSheet:
                line.category === "cast"
                  ? "above_the_line"
                  : line.category === "crew"
                    ? "crew"
                    : "production",
              name: `Sc.${sceneNumber} — ${line.description}`,
              costType: "flat",
              quantity: 1,
              rate: line.amount,
              linkedCategory: linkedCategoryByCategory[line.category] ?? null,
            },
          }),
        );
      }
    },
  });

  return (
    <RecapStrip
      sceneId={scene.id}
      sceneNumber={sceneNumber}
      sceneLabel={sceneLabel(scene)}
      cost={estimate.total}
      categories={categoryItems}
      onAddToBudget={() => addToBudget.mutate()}
      isAddPending={addToBudget.isPending}
    />
  );
}
