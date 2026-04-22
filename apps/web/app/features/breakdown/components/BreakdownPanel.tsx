import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tag } from "@oh-writers/ui";
import {
  BREAKDOWN_CATEGORIES,
  CATEGORY_META,
  CAST_TIER_ORDER,
  CAST_TIER_META,
  type BreakdownCategory,
  type CastTier,
} from "@oh-writers/domain";
import {
  breakdownForSceneOptions,
  useCesareSuggest,
  useSetOccurrenceStatus,
} from "../hooks/useBreakdown";
import type {
  BreakdownSceneSummary,
  SceneOccurrenceWithElement,
} from "../server/breakdown.server";
import { CesareGhostTag } from "./CesareGhostTag";
import { CesareSuggestionBanner } from "./CesareSuggestionBanner";
import { AddElementModal } from "./AddElementModal";
import styles from "./BreakdownPanel.module.css";

interface Props {
  scene: BreakdownSceneSummary | null;
  projectId: string;
  versionId: string;
  canEdit: boolean;
}

export function BreakdownPanel({
  scene,
  projectId,
  versionId,
  canEdit,
}: Props) {
  const sceneId = scene?.id ?? "";
  const { data: occurrences = [] } = useQuery(
    breakdownForSceneOptions(sceneId, versionId),
  );
  const suggest = useCesareSuggest(sceneId, versionId);
  const setStatus = useSetOccurrenceStatus(sceneId, versionId);
  const [addOpen, setAddOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<BreakdownCategory, SceneOccurrenceWithElement[]>();
    for (const o of occurrences) {
      const cat = o.element.category;
      const arr = map.get(cat) ?? [];
      arr.push(o);
      map.set(cat, arr);
    }
    return map;
  }, [occurrences]);

  const pending = occurrences.filter(
    (o) => o.occurrence.cesareStatus === "pending",
  );

  if (!scene) {
    return <p className={styles.empty}>Seleziona una scena.</p>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Elementi scena {scene.number}</h3>
        {canEdit && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              data-testid="cesare-suggest-scene"
              onClick={() => suggest.mutate()}
              disabled={suggest.isPending}
            >
              {suggest.isPending ? "Cesare…" : "Suggerisci"}
            </button>
            <button
              type="button"
              className={styles.action}
              data-testid="add-element-trigger"
              onClick={() => setAddOpen(true)}
            >
              Aggiungi
            </button>
          </div>
        )}
      </div>

      {suggest.isError && canEdit && (
        <p className={styles.error} role="alert">
          {suggest.error instanceof Error
            ? suggest.error.message
            : "Cesare non è disponibile in questo momento."}
        </p>
      )}

      {pending.length > 0 && canEdit && (
        <CesareSuggestionBanner
          pendingCount={pending.length}
          onAcceptAll={() =>
            setStatus.mutate({
              occurrenceIds: pending.map((p) => p.occurrence.id),
              status: "accepted",
            })
          }
          onIgnoreAll={() =>
            setStatus.mutate({
              occurrenceIds: pending.map((p) => p.occurrence.id),
              status: "ignored",
            })
          }
        />
      )}

      {occurrences.length === 0 ? (
        <p className={styles.empty}>Nessun elemento ancora.</p>
      ) : (
        <div className={styles.groups}>
          {BREAKDOWN_CATEGORIES.map((cat) => {
            const items = grouped.get(cat);
            if (!items || items.length === 0) return null;
            const meta = CATEGORY_META[cat];
            const renderTag = (it: SceneOccurrenceWithElement) => {
              const { occurrence, element } = it;
              if (occurrence.cesareStatus === "pending") {
                return (
                  <CesareGhostTag
                    key={occurrence.id}
                    category={element.category}
                    name={element.name}
                    quantity={occurrence.quantity}
                    onAccept={() =>
                      setStatus.mutate({
                        occurrenceIds: [occurrence.id],
                        status: "accepted",
                      })
                    }
                    onIgnore={() =>
                      setStatus.mutate({
                        occurrenceIds: [occurrence.id],
                        status: "ignored",
                      })
                    }
                  />
                );
              }
              return (
                <span
                  key={occurrence.id}
                  className={occurrence.isStale ? styles.staleWrap : ""}
                  aria-disabled={occurrence.isStale}
                  data-stale={occurrence.isStale}
                  title={
                    occurrence.isStale ? "Non più trovato nel testo" : undefined
                  }
                >
                  <Tag
                    colorToken={meta.colorToken}
                    icon={meta.icon}
                    name={element.name}
                    count={occurrence.quantity}
                    data-testid={`accepted-tag-${element.name}`}
                  />
                </span>
              );
            };

            return (
              <section key={cat} className={styles.group}>
                <h4 className={styles.groupTitle}>{meta.labelIt}</h4>
                {cat === "cast" ? (
                  <CastTierGroups items={items} renderTag={renderTag} />
                ) : (
                  <div className={styles.tags}>{items.map(renderTag)}</div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {canEdit && (
        <AddElementModal
          isOpen={addOpen}
          onClose={() => setAddOpen(false)}
          projectId={projectId}
          versionId={versionId}
          sceneId={scene.id}
        />
      )}
    </div>
  );
}

interface CastTierGroupsProps {
  items: SceneOccurrenceWithElement[];
  renderTag: (it: SceneOccurrenceWithElement) => React.ReactNode;
}

function CastTierGroups({ items, renderTag }: CastTierGroupsProps) {
  const byTier = new Map<CastTier | "unassigned", SceneOccurrenceWithElement[]>(
    [],
  );
  for (const it of items) {
    const tier = (it.element.castTier ?? "unassigned") as
      | CastTier
      | "unassigned";
    const arr = byTier.get(tier) ?? [];
    arr.push(it);
    byTier.set(tier, arr);
  }

  const tierOrder: ReadonlyArray<CastTier | "unassigned"> = [
    ...CAST_TIER_ORDER,
    "unassigned",
  ];

  return (
    <div className={styles.castTierGroups}>
      {tierOrder.map((tier) => {
        const tierItems = byTier.get(tier);
        if (!tierItems || tierItems.length === 0) return null;
        const label =
          tier === "unassigned"
            ? "Non assegnato"
            : CAST_TIER_META[tier].labelIt;
        return (
          <div key={tier} className={styles.castTierGroup}>
            <h5
              className={styles.castTierLabel}
              data-tier={tier}
              data-testid={`cast-tier-label-${tier}`}
            >
              {label}
            </h5>
            <div className={styles.tags}>{tierItems.map(renderTag)}</div>
          </div>
        );
      })}
    </div>
  );
}
