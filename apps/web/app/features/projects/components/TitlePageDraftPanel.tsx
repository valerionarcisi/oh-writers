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
      <h2 className={styles.heading}>Draft corrente</h2>

      <div className={styles.field}>
        <span className={styles.label}>Data</span>
        <span className={styles.readonly} data-testid="tp-draft-date-readonly">
          {draftDate ?? "—"}
        </span>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Colore</span>
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
              draftColor ? `Colore draft: ${draftColor}` : "Nessun colore draft"
            }
          />
          <span className={styles.colorName}>
            {draftColor ? DRAFT_COLOR_LABEL[draftColor] : "Non impostato"}
          </span>
        </div>
      </div>

      <p className={styles.hint}>
        Data e colore appartengono alla versione corrente della sceneggiatura.
      </p>
      <Link
        to="/projects/$id/screenplay"
        params={{ id: projectId }}
        className={styles.link}
        data-testid="tp-draft-edit-versions-link"
      >
        Modifica nelle Versioni →
      </Link>
    </aside>
  );
}
