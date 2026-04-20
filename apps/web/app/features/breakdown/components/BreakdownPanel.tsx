import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tag } from "@oh-writers/ui";
import {
  BREAKDOWN_CATEGORIES,
  CATEGORY_META,
  type BreakdownCategory,
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
            return (
              <section key={cat} className={styles.group}>
                <h4 className={styles.groupTitle}>{meta.labelIt}</h4>
                <div className={styles.tags}>
                  {items.map(({ occurrence, element }) => {
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
                          occurrence.isStale
                            ? "Non più trovato nel testo"
                            : undefined
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
                  })}
                </div>
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
