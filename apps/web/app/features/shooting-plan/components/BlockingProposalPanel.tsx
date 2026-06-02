import { useButton } from "react-aria";
import { useRef } from "react";
import { useTranslation } from "~/features/i18n";
import type { ProposedBlockingChange } from "./BlockingCanvas";
import styles from "./BlockingProposalPanel.module.css";

interface BlockingProposalPanelProps {
  readonly proposals: ReadonlyArray<ProposedBlockingChange>;
  readonly onAcceptAll: () => void;
  readonly onRejectAll: () => void;
  readonly onAcceptOne: (item: ProposedBlockingChange) => void;
  readonly onRejectOne: (item: ProposedBlockingChange) => void;
  readonly isApplying?: boolean;
}

function PanelButton({
  label,
  onPress,
  variant,
  isDisabled,
  ariaLabel,
}: {
  label: string;
  onPress: () => void;
  variant: "primary" | "ghost" | "danger";
  isDisabled?: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress,
      isDisabled,
      "aria-label": ariaLabel ?? label,
    },
    ref,
  );
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      className={styles.button}
      data-variant={variant}
    >
      {label}
    </button>
  );
}

export function BlockingProposalPanel({
  proposals,
  onAcceptAll,
  onRejectAll,
  onAcceptOne,
  onRejectOne,
  isApplying,
}: BlockingProposalPanelProps) {
  const { t } = useTranslation();
  if (proposals.length === 0) return null;
  const actorCount = proposals.filter((p) => p.kind === "actor").length;
  const cameraCount = proposals.filter((p) => p.kind === "camera").length;

  return (
    <aside
      className={styles.panel}
      role="region"
      aria-label={t("shootingPlan.proposal.regionAria")}
      data-testid="blocking-proposal-panel"
    >
      <header className={styles.header}>
        <span className={styles.title}>
          {t("shootingPlan.proposal.title")}
        </span>
        <span className={styles.subtitle}>
          {actorCount}{" "}
          {actorCount === 1
            ? t("shootingPlan.proposal.actorSingular")
            : t("shootingPlan.proposal.actorPlural")}{" "}
          · {cameraCount}{" "}
          {cameraCount === 1
            ? t("shootingPlan.proposal.cameraSingular")
            : t("shootingPlan.proposal.cameraPlural")}
        </span>
      </header>

      <ul className={styles.list}>
        {proposals.map((p) => (
          <li
            key={p.kind === "actor" ? `a-${p.castId}` : `c-${p.shotId}`}
            className={styles.item}
          >
            <span className={styles.itemLabel}>
              {p.kind === "actor" ? "👤" : "🎥"} {p.label}
            </span>
            <div className={styles.itemActions}>
              <PanelButton
                label="✓"
                ariaLabel={t("shootingPlan.proposal.acceptOneAria").replace(
                  "{name}",
                  p.label,
                )}
                variant="ghost"
                isDisabled={isApplying}
                onPress={() => onAcceptOne(p)}
              />
              <PanelButton
                label="✕"
                ariaLabel={t("shootingPlan.proposal.rejectOneAria").replace(
                  "{name}",
                  p.label,
                )}
                variant="ghost"
                isDisabled={isApplying}
                onPress={() => onRejectOne(p)}
              />
            </div>
          </li>
        ))}
      </ul>

      <footer className={styles.footer}>
        <PanelButton
          label={t("shootingPlan.proposal.rejectAll")}
          variant="danger"
          isDisabled={isApplying}
          onPress={onRejectAll}
        />
        <PanelButton
          label={
            isApplying
              ? t("shootingPlan.proposal.applying")
              : t("shootingPlan.proposal.acceptAll")
          }
          variant="primary"
          isDisabled={isApplying}
          onPress={onAcceptAll}
        />
      </footer>
    </aside>
  );
}
