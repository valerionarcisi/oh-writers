import {
  createEditorialApprovalAdvice,
  editorialAdviceMemoryKey,
  type EditorialAdvice,
  type EditorialAdviceStatus,
} from "@oh-writers/domain";
import type { ReactNode } from "react";
import { useTranslation } from "~/features/i18n";
import {
  EditorialAdviceActions,
  EditorialAdviceCard,
} from "./EditorialAdviceCard";
import styles from "./EditorialAdviceStack.module.css";

type AdviceActionHandlers = {
  onExplore?: (advice: EditorialAdvice) => void;
  onMarkAuthorialChoice?: (advice: EditorialAdvice) => void;
  onIgnore?: (advice: EditorialAdvice) => void;
  onResolve?: (advice: EditorialAdvice) => void;
  onApprove?: (advice: EditorialAdvice) => void;
  onApply?: (advice: EditorialAdvice) => void;
};

type EditorialAdviceStackProps = AdviceActionHandlers & {
  advice: readonly EditorialAdvice[];
  rememberedStatuses?: Record<string, EditorialAdviceStatus>;
  fallbackArea: string;
  emptyState?: ReactNode;
  scenePrefix?: string;
};

const hiddenStatuses = new Set<EditorialAdviceStatus>([
  "ignored",
  "authorial_choice",
  "resolved",
  "approved",
]);

export function EditorialAdviceStack({
  advice,
  rememberedStatuses,
  fallbackArea,
  emptyState = null,
  scenePrefix = "Sc.",
  ...handlers
}: EditorialAdviceStackProps) {
  const { t } = useTranslation();
  const visible = advice
    .map((item) => ({
      ...item,
      status:
        rememberedStatuses?.[editorialAdviceMemoryKey(item)] ?? item.status,
    }))
    .filter((item) => !item.status || !hiddenStatuses.has(item.status));

  const primary = visible.filter(
    (item) => item.severity === "high" || item.severity === "medium",
  );
  const optional = visible.filter(
    (item) => item.severity === "low" || item.severity === "optional",
  );

  // #99 — the approval card stands for "nothing to say about this text". It used
  // to be synthesised whenever no note was high or medium, so a reading that
  // produced six genuine low/optional notes was still crowned "OK editoriale" —
  // the writer read the verdict and stopped there. It now appears only when there
  // is genuinely nothing to show.
  const approvedVisible = visible.find((item) => item.type === "approved");
  const approvalCard =
    approvedVisible ??
    (visible.length === 0
      ? createEditorialApprovalAdvice(fallbackArea, {
          id: `auto-approved-${fallbackArea}`,
        })
      : null);

  if (primary.length === 0 && optional.length === 0 && approvalCard === null) {
    return emptyState;
  }

  return (
    <div className={styles.stack}>
      {primary.length > 0 ? (
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              {t("cesare.editorial.priorityTitle")}
            </h2>
          </header>
          <ul className={styles.list}>
            {primary.map((item, index) => (
              <li key={item.id} className={styles.item}>
                <EditorialAdviceCard
                  advice={item}
                  defaultOpen={index === 0}
                  meta={
                    typeof item.scene === "number" ? (
                      <span>
                        {scenePrefix} {item.scene}
                      </span>
                    ) : null
                  }
                  actions={
                    <EditorialAdviceActions
                      onExplore={
                        handlers.onExplore
                          ? () => handlers.onExplore?.(item)
                          : undefined
                      }
                      onApply={
                        handlers.onApply
                          ? () => handlers.onApply?.(item)
                          : undefined
                      }
                      onMarkAuthorialChoice={
                        handlers.onMarkAuthorialChoice
                          ? () => handlers.onMarkAuthorialChoice?.(item)
                          : undefined
                      }
                      onIgnore={
                        handlers.onIgnore
                          ? () => handlers.onIgnore?.(item)
                          : undefined
                      }
                      onResolve={
                        handlers.onResolve
                          ? () => handlers.onResolve?.(item)
                          : undefined
                      }
                      onApprove={
                        handlers.onApprove
                          ? () => handlers.onApprove?.(item)
                          : undefined
                      }
                    />
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {approvalCard ? (
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              {t("cesare.editorial.stateTitle")}
            </h2>
            <p className={styles.sectionHint}>
              {t("cesare.editorial.stateHint")}
            </p>
          </header>
          <EditorialAdviceCard
            advice={approvalCard}
            actions={
              <EditorialAdviceActions
                onApprove={
                  handlers.onApprove
                    ? () => handlers.onApprove?.(approvalCard)
                    : undefined
                }
              />
            }
          />
        </section>
      ) : null}

      {optional.length > 0 ? (
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              {t("cesare.editorial.optionalTitle")}
            </h2>
            <p className={styles.sectionHint}>
              {t("cesare.editorial.optionalHint")}
            </p>
          </header>
          <ul className={styles.list}>
            {optional.map((item) => (
              <li key={item.id} className={styles.item}>
                <EditorialAdviceCard
                  advice={item}
                  meta={
                    typeof item.scene === "number" ? (
                      <span>
                        {scenePrefix} {item.scene}
                      </span>
                    ) : null
                  }
                  actions={
                    <EditorialAdviceActions
                      onExplore={
                        handlers.onExplore
                          ? () => handlers.onExplore?.(item)
                          : undefined
                      }
                      onApply={
                        handlers.onApply
                          ? () => handlers.onApply?.(item)
                          : undefined
                      }
                      onMarkAuthorialChoice={
                        handlers.onMarkAuthorialChoice
                          ? () => handlers.onMarkAuthorialChoice?.(item)
                          : undefined
                      }
                      onIgnore={
                        handlers.onIgnore
                          ? () => handlers.onIgnore?.(item)
                          : undefined
                      }
                      onResolve={
                        handlers.onResolve
                          ? () => handlers.onResolve?.(item)
                          : undefined
                      }
                      onApprove={
                        handlers.onApprove
                          ? () => handlers.onApprove?.(item)
                          : undefined
                      }
                    />
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
