import { useRef } from "react";
import { useButton } from "react-aria";
import { useTranslation } from "~/features/i18n";
import styles from "./ShootingPlanDock.module.css";

interface ShootingPlanDockProps {
  projectId: string;
  suggestedShotCount: number;
  isGenerating?: boolean;
  onGeneratePlan?: () => void;
  onPrefill?: () => void;
  onExport?: () => void;
  onPrint?: () => void;
  onCesareClick?: () => void;
}

export function ShootingPlanDock({
  suggestedShotCount,
  isGenerating = false,
  onGeneratePlan,
  onPrefill,
  onExport,
  onPrint,
  onCesareClick,
}: ShootingPlanDockProps) {
  const { t } = useTranslation();
  const prefillRef = useRef<HTMLButtonElement>(null);
  const { buttonProps: prefillButtonProps } = useButton(
    {
      onPress: onPrefill,
      isDisabled: !onPrefill,
      "aria-label": t("shootingPlan.dock.prefillAria"),
    },
    prefillRef,
  );

  return (
    <div
      className={styles.dock}
      role="toolbar"
      aria-label={t("shootingPlan.dock.toolbarAria")}
    >
      <span className={styles.dockLabel}>{t("shootingPlan.dock.label")}</span>

      <button
        type="button"
        className={styles.btnPrimary}
        onClick={onGeneratePlan}
        disabled={isGenerating}
        title={t("shootingPlan.dock.generateTitle")}
      >
        {isGenerating ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className={styles.spinIcon}
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M5 3h14M5 3v18l7-4 7 4V3" />
          </svg>
        )}
        {isGenerating
          ? t("shootingPlan.dock.generating")
          : t("shootingPlan.dock.generate")}
        <kbd className={styles.kbd}>⇧⌘G</kbd>
      </button>

      <button
        ref={prefillRef}
        {...prefillButtonProps}
        className={styles.btnGhost}
        title={t("shootingPlan.dock.prefillTitle")}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M3 12a9 9 0 1 1 3 6.7" />
          <path d="M3 19v-6h6" />
        </svg>
        Pre-fill
        <kbd className={styles.kbd}>⇧⌘P</kbd>
      </button>

      <button
        type="button"
        className={styles.btnGhost}
        onClick={onExport}
        title={t("shootingPlan.dock.exportTitle")}
        data-testid="export-csv-btn"
      >
        {t("shootingPlan.dock.export")}
        <kbd className={styles.kbd}>⌘E</kbd>
      </button>

      <button
        type="button"
        className={styles.btnGhost}
        onClick={onPrint}
        title={t("shootingPlan.dock.printTitle")}
        data-testid="export-pdf-btn"
      >
        {t("shootingPlan.dock.print")}
        <kbd className={styles.kbd}>⌘P</kbd>
      </button>

      {onCesareClick && (
        <>
          <div className={styles.sep} aria-hidden="true" />

          <button
            type="button"
            className={styles.cesareBtn}
            title={t("shootingPlan.dock.openCesare")}
            onClick={onCesareClick}
          >
            <span className={styles.cesareDot} aria-hidden="true" />
            Cesare
            {suggestedShotCount > 0 && (
              <span className={styles.cesareCount}>{suggestedShotCount}</span>
            )}
          </button>
        </>
      )}
    </div>
  );
}
