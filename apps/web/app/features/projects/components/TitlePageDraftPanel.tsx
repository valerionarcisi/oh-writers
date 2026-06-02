import { Link } from "@tanstack/react-router";
import type { DraftRevisionColor } from "@oh-writers/domain";
import { DRAFT_COLOR_HEX, DRAFT_COLOR_LABEL } from "../draft-color-palette";
import { useTranslation } from "~/features/i18n";
import styles from "./TitlePageDraftPanel.module.css";

interface TitlePageDraftPanelProps {
  projectId: string;
  draftDate: string | null;
  draftColor: DraftRevisionColor | null;
}

export function TitlePageDraftPanel({
  projectId,
  draftDate,
  draftColor,
}: TitlePageDraftPanelProps) {
  const { t } = useTranslation();
  return (
    <aside className={styles.panel} data-testid="title-page-draft-panel">
      <h2 className={styles.heading}>{t("projects.draftPanel.heading")}</h2>

      <div className={styles.field}>
        <span className={styles.label}>{t("projects.draftPanel.date")}</span>
        <span className={styles.readonly} data-testid="tp-draft-date-readonly">
          {draftDate ?? "—"}
        </span>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>{t("projects.draftPanel.color")}</span>
        <div className={styles.colorReadonly}>
          <span
            className={styles.swatchReadonly}
            style={{
              background: draftColor
                ? DRAFT_COLOR_HEX[draftColor]
                : "transparent",
            }}
            data-testid="tp-draft-color-readonly"
            aria-label={
              draftColor
                ? `${t("projects.draftPanel.colorAriaPrefix")} ${DRAFT_COLOR_LABEL[draftColor]}`
                : t("projects.draftPanel.noColorAria")
            }
          />
          <span className={styles.colorName}>
            {draftColor
              ? DRAFT_COLOR_LABEL[draftColor]
              : t("projects.draftPanel.notSet")}
          </span>
        </div>
      </div>

      <p className={styles.hint}>{t("projects.draftPanel.hint")}</p>
      <Link
        to="/projects/$id/screenplay"
        params={{ id: projectId }}
        className={styles.link}
        data-testid="tp-draft-edit-versions-link"
      >
        {t("projects.draftPanel.editLink")}
      </Link>
    </aside>
  );
}
