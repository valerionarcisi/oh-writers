import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { CATEGORY_META, BREAKDOWN_CATEGORIES } from "@oh-writers/domain";
import { Skeleton } from "@oh-writers/ui";
import { getBreakdownForScene } from "~/features/breakdown";
import { unwrapResult } from "@oh-writers/utils";
import type { StripView } from "../server/schedule.server";
import { useTranslation } from "~/features/i18n";
import styles from "./SceneDrawer.module.css";

interface SceneDrawerProps {
  strip: StripView | null;
  screenplayVersionId: string | null;
  onClose: () => void;
}

export function SceneDrawer({
  strip,
  screenplayVersionId,
  onClose,
}: SceneDrawerProps) {
  const { t } = useTranslation();
  const { data: elements } = useQuery({
    queryKey: ["scene-breakdown", strip?.sceneId, screenplayVersionId],
    queryFn: () =>
      getBreakdownForScene({
        data: {
          sceneId: strip!.sceneId,
          screenplayVersionId: screenplayVersionId!,
        },
      }).then(unwrapResult),
    enabled: !!strip && !!screenplayVersionId,
    staleTime: 60_000,
  });

  const grouped =
    elements &&
    BREAKDOWN_CATEGORIES.reduce<
      Record<string, { name: string; status: string }[]>
    >((acc, cat) => {
      const items = elements
        .filter((e) => e.element.category === cat)
        .map((e) => ({
          name: e.element.name,
          status: e.occurrence.cesareStatus,
        }));
      if (items.length > 0) acc[cat] = items;
      return acc;
    }, {});

  return (
    <div
      className={`${styles.backdrop} ${strip ? styles.open : ""}`}
      onClick={onClose}
    >
      <aside
        className={`${styles.drawer} ${strip ? styles.open : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.drawerHeader}>
          <div className={styles.sceneLabel}>
            {strip ? `Sc. ${strip.sceneNumber}` : ""}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            title={t("schedule.close")}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {strip && (
          <>
            <div className={styles.sceneInfo}>
              <div className={styles.sceneHeading}>{strip.sceneHeading}</div>
              <div className={styles.sceneMeta}>
                <span>{strip.intExt}</span>
                {strip.timeOfDay && <span>· {strip.timeOfDay}</span>}
                <span>
                  · {strip.pageCount} {t("schedule.pagesShort")}
                </span>
              </div>
            </div>

            <div className={styles.elementsList}>
              {!elements && (
                <div className={styles.loading}>
                  <Skeleton
                    lines={5}
                    widths={["60%", "100%", "40%", "100%", "30%"]}
                    ariaLabel={t("schedule.loadingSceneElements")}
                  />
                </div>
              )}

              {grouped && Object.keys(grouped).length === 0 && (
                <div className={styles.empty}>
                  {t("schedule.sceneDrawer.noBreakdown")}
                </div>
              )}

              {grouped &&
                BREAKDOWN_CATEGORIES.filter((c) => grouped[c]).map((cat) => {
                  const meta = CATEGORY_META[cat];
                  return (
                    <div key={cat} className={styles.categoryGroup}>
                      <div
                        className={styles.categoryHeader}
                        style={
                          {
                            "--cat-color": `var(${meta.colorToken})`,
                          } as React.CSSProperties
                        }
                      >
                        <span className={styles.categoryDot} />
                        <span className={styles.categoryLabel}>
                          {meta.labelIt}
                        </span>
                      </div>
                      <ul className={styles.elementItems}>
                        {grouped[cat]!.map((item) => (
                          <li
                            key={item.name}
                            className={styles.elementItem}
                            data-status={item.status}
                          >
                            {item.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
