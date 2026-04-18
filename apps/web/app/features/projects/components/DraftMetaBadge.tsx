import { useQuery } from "@tanstack/react-query";
import { projectDraftMetaQueryOptions } from "../server/draft-meta.server";
import { DRAFT_COLOR_HEX, DRAFT_COLOR_LABEL } from "../draft-color-palette";
import styles from "./DraftMetaBadge.module.css";

interface DraftMetaBadgeProps {
  projectId: string;
}

export function DraftMetaBadge({ projectId }: DraftMetaBadgeProps) {
  const { data: result } = useQuery(projectDraftMetaQueryOptions(projectId));
  if (!result || !result.isOk) return null;
  const { draftColor, draftDate } = result.value;
  if (!draftColor && !draftDate) return null;

  const colorLabel = draftColor ? DRAFT_COLOR_LABEL[draftColor] : "No color";
  const title = `Draft ${colorLabel}${draftDate ? ` — ${draftDate}` : ""} · managed in Versions on the screenplay`;

  return (
    <span className={styles.badge} title={title} data-testid="draft-meta-badge">
      <span
        className={styles.swatch}
        style={{
          background: draftColor ? DRAFT_COLOR_HEX[draftColor] : "transparent",
        }}
        aria-hidden="true"
      />
      <span className={styles.label}>{colorLabel}</span>
      {draftDate && <span className={styles.date}>{draftDate}</span>}
    </span>
  );
}
