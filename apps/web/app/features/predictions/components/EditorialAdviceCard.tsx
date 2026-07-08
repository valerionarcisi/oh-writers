import type { EditorialAdvice } from "@oh-writers/domain";
import { Button, DropdownMenu, type DropdownMenuItem } from "@oh-writers/ui";
import type { ReactNode } from "react";
import {
  getAdviceSeverityMeta,
  getAdviceStatusMeta,
  getAdviceTypeMeta,
  getAdviceAreaLabel,
} from "../editorial-advice-config";
import { useTranslation } from "~/features/i18n";
import styles from "./EditorialAdviceCard.module.css";

type EditorialAdviceCardProps = {
  advice: EditorialAdvice;
  actions?: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
};

const typeClassName: Record<EditorialAdvice["type"], string> = {
  real_problem: styles.realProblem ?? "",
  risk: styles.risk ?? "",
  authorial_choice: styles.authorialChoice ?? "",
  optional: styles.optional ?? "",
  already_resolved: styles.alreadyResolved ?? "",
  approved: styles.approved ?? "",
};

export function EditorialAdviceCard({
  advice,
  actions,
  meta,
  defaultOpen = false,
  testId,
}: EditorialAdviceCardProps) {
  const { t } = useTranslation();
  const typeMeta = getAdviceTypeMeta(advice.type, t);
  const severityMeta = getAdviceSeverityMeta(advice.severity, t);
  const statusMeta = advice.status
    ? getAdviceStatusMeta(advice.status, t)
    : null;
  const hasDetails =
    Boolean(advice.whyItMatters) ||
    Boolean(advice.whenToIgnore) ||
    Boolean(advice.minimalIntervention) ||
    (typeof advice.find === "string" &&
      advice.find.length > 0 &&
      typeof advice.replace === "string" &&
      advice.replace.length > 0);

  return (
    <article
      className={[styles.card, typeClassName[advice.type]].join(" ")}
      data-testid={testId}
    >
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.chip}>
            {getAdviceAreaLabel(advice.area, t)}
          </span>
          <span className={styles.chip}>
            <span aria-hidden="true">{typeMeta.sigil}</span>
            {typeMeta.label}
          </span>
          <span className={[styles.chip, styles.neutralChip].join(" ")}>
            {severityMeta.label}
          </span>
          {statusMeta ? (
            <span className={[styles.chip, styles.neutralChip].join(" ")}>
              {statusMeta.label}
            </span>
          ) : null}
          {meta}
        </div>
        <span className={styles.stamp} aria-hidden="true">
          {typeMeta.sigil}
        </span>
      </header>

      <div className={styles.titleBlock}>
        <h3 className={styles.title}>{advice.title}</h3>
        <p className={styles.body}>{advice.body}</p>
      </div>

      {hasDetails ? (
        <details className={styles.details} open={defaultOpen}>
          <summary className={styles.summary}>
            {t("cesare.editorial.details")}
          </summary>
          <div className={styles.detailsBody}>
            {advice.whyItMatters ? (
              <p className={styles.detailItem}>
                <span className={styles.detailLabel}>
                  {t("cesare.editorial.whyItMatters")}
                </span>
                {advice.whyItMatters}
              </p>
            ) : null}
            {advice.whenToIgnore ? (
              <p className={styles.detailItem}>
                <span className={styles.detailLabel}>
                  {t("cesare.editorial.whenToIgnore")}
                </span>
                {advice.whenToIgnore}
              </p>
            ) : null}
            {advice.minimalIntervention ? (
              <p className={styles.detailItem}>
                <span className={styles.detailLabel}>
                  {t("cesare.editorial.minimalIntervention")}
                </span>
                {advice.minimalIntervention}
              </p>
            ) : null}
            {typeof advice.find === "string" &&
            advice.find.length > 0 &&
            typeof advice.replace === "string" &&
            advice.replace.length > 0 ? (
              <div className={styles.editPreview}>
                <span className={styles.find}>{advice.find}</span>
                <span aria-hidden="true">→</span>
                <span className={styles.replace}>{advice.replace}</span>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </article>
  );
}

type AdviceActionsProps = {
  onExplore?: () => void;
  onMarkAuthorialChoice?: () => void;
  onIgnore?: () => void;
  onResolve?: () => void;
  onApprove?: () => void;
  onApply?: () => void;
  applyLabel?: string;
};

export function EditorialAdviceActions({
  onExplore,
  onMarkAuthorialChoice,
  onIgnore,
  onResolve,
  onApprove,
  onApply,
  applyLabel,
}: AdviceActionsProps) {
  const { t } = useTranslation();
  const menuItems: DropdownMenuItem[] = [];

  if (onMarkAuthorialChoice) {
    menuItems.push({
      label: t("cesare.editorial.markAuthorialChoice"),
      description: t("cesare.editorial.markAuthorialChoiceHint"),
      onClick: onMarkAuthorialChoice,
    });
  }
  if (onResolve) {
    menuItems.push({
      label: t("cesare.editorial.resolve"),
      description: t("cesare.editorial.resolveHint"),
      onClick: onResolve,
    });
  }
  if (onApprove) {
    menuItems.push({
      label: t("cesare.editorial.approve"),
      description: t("cesare.editorial.approveHint"),
      onClick: onApprove,
    });
  }
  if (onIgnore) {
    menuItems.push({
      label: t("cesare.editorial.ignore"),
      description: t("cesare.editorial.ignoreHint"),
      onClick: onIgnore,
    });
  }

  return (
    <>
      {onExplore ? (
        <Button variant="secondary" size="sm" onPress={onExplore}>
          {t("cesare.editorial.explore")}
        </Button>
      ) : null}
      {onApply ? (
        <Button variant="secondary" size="sm" onPress={onApply}>
          {applyLabel ?? t("cesare.editorial.apply")}
        </Button>
      ) : null}
      {menuItems.length > 0 ? (
        <DropdownMenu
          trigger={
            <span className={styles.menuTrigger}>
              {t("cesare.editorial.mark")}
            </span>
          }
          triggerLabel={t("cesare.editorial.actionsMenuLabel")}
          triggerTitle={t("cesare.editorial.actionsMenuTitle")}
          triggerClassName={styles.menuTriggerWrap}
          items={menuItems}
          align="end"
        />
      ) : null}
    </>
  );
}
