import { Link } from "@tanstack/react-router";
import type { DraftRevisionColor } from "@oh-writers/domain";
import { DRAFT_COLOR_HEX, DRAFT_COLOR_LABEL } from "../draft-color-palette";
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
  return (
    <aside className={styles.panel} data-testid="title-page-draft-panel">
      <h2 className={styles.heading}>Current draft</h2>

      <div className={styles.field}>
        <span className={styles.label}>Date</span>
        <span className={styles.readonly} data-testid="tp-draft-date-readonly">
          {draftDate ?? "—"}
        </span>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Color</span>
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
              draftColor ? `Draft color: ${draftColor}` : "No draft color"
            }
          />
          <span className={styles.colorName}>
            {draftColor ? DRAFT_COLOR_LABEL[draftColor] : "Not set"}
          </span>
        </div>
      </div>

      <p className={styles.hint}>
        Date and color belong to the current screenplay version.
      </p>
      <Link
        to="/projects/$id/screenplay"
        params={{ id: projectId }}
        className={styles.link}
        data-testid="tp-draft-edit-versions-link"
      >
        Edit in Versions →
      </Link>
    </aside>
  );
}
