import { useNavigate } from "@tanstack/react-router";
import { Button } from "@oh-writers/ui";
import { DashboardImportFountainButton } from "./DashboardImportFountainButton";
import { DashboardImportPdfButton } from "./DashboardImportPdfButton";
import { useTranslation } from "~/features/i18n";
import styles from "./DashboardEmptyState.module.css";

export function DashboardEmptyState() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <section className={styles.empty} aria-labelledby="dashboard-empty-title">
      <svg
        className={styles.illustration}
        viewBox="0 0 220 140"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          x="20"
          y="14"
          width="180"
          height="112"
          rx="4"
          fill="none"
          stroke="currentColor"
          strokeDasharray="4 4"
        />
        <text
          x="34"
          y="44"
          fill="currentColor"
          fontFamily="var(--ds-font-mono)"
          fontSize="11"
        >
          FADE IN:
        </text>
        <text
          x="34"
          y="78"
          fill="currentColor"
          fontFamily="var(--ds-font-mono)"
          fontSize="11"
        >
          {t("dashboard.empty.svgLine")}
        </text>
        <rect x="34" y="98" width="6" height="14" fill="currentColor">
          <animate
            attributeName="opacity"
            values="1;0;1"
            dur="1.2s"
            repeatCount="indefinite"
          />
        </rect>
      </svg>
      <h2 id="dashboard-empty-title" className={styles.heading}>
        {t("dashboard.empty.heading")}
      </h2>
      <p className={styles.body}>{t("dashboard.empty.body")}</p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          type="button"
          onClick={() => navigate({ to: "/projects/new" })}
        >
          {t("dashboard.empty.createFirst")}
        </Button>
        <DashboardImportFountainButton />
        <DashboardImportPdfButton />
        <Button variant="ghost" type="button" disabled>
          {t("dashboard.empty.fromTemplate")}
        </Button>
      </div>
    </section>
  );
}
