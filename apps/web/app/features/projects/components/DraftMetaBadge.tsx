import { useQuery } from "@tanstack/react-query";
import { match } from "ts-pattern";
import { projectDraftMetaQueryOptions } from "../server/draft-meta.server";
import { DRAFT_COLOR_HEX, DRAFT_COLOR_LABEL } from "../draft-color-palette";
import styles from "./DraftMetaBadge.module.css";

interface DraftMetaBadgeProps {
  projectId: string;
}

export function DraftMetaBadge({ projectId }: DraftMetaBadgeProps) {
  const { data: result } = useQuery(projectDraftMetaQueryOptions(projectId));
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => {
      const { draftColor, draftDate } = value;
      if (!draftColor && !draftDate) return null;

      const colorLabel = draftColor
        ? DRAFT_COLOR_LABEL[draftColor]
        : "No color";
      const title = `Draft ${colorLabel}${draftDate ? ` — ${draftDate}` : ""} · managed in Versions on the screenplay`;

      return (
        <span
          className={styles.badge}
          title={title}
          data-testid="draft-meta-badge"
        >
          <span
            className={styles.swatch}
            style={{
              background: draftColor
                ? DRAFT_COLOR_HEX[draftColor]
                : "transparent",
            }}
            aria-hidden="true"
          />
          <span className={styles.label}>{colorLabel}</span>
          {draftDate && <span className={styles.date}>{draftDate}</span>}
        </span>
      );
    })
    .with({ isOk: false, error: { _tag: "DbError" } }, () => (
      <span
        className={styles.badge}
        title="Could not load draft metadata"
        data-testid="draft-meta-badge-error"
      >
        <span className={styles.label}>Draft unavailable</span>
      </span>
    ))
    .exhaustive();
}
