import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@oh-writers/ui";
import { staleScenesOptions } from "~/features/breakdown/hooks/useBreakdown";
import styles from "./SceneStaleBadge.module.css";

interface Props {
  projectId: string;
  versionId: string | null;
}

/**
 * L2 indicator shown above the ProseMirror editor when one or more scenes
 * have breakdown data that is no longer in sync with the script. Clicking
 * the badge navigates to the project's /breakdown page.
 */
export function SceneStaleBadge({ projectId, versionId }: Props) {
  const navigate = useNavigate();
  const { data: staleIds = [] } = useQuery({
    ...staleScenesOptions(versionId ?? ""),
    enabled: !!versionId,
  });

  if (!versionId || staleIds.length === 0) return null;

  const count = staleIds.length;

  const goToBreakdown = () => {
    void navigate({
      to: "/projects/$id/breakdown",
      params: { id: projectId },
    });
  };

  return (
    <div
      className={styles.wrap}
      role="status"
      data-testid="editor-scene-stale-badge"
    >
      <Badge variant="stale">stale</Badge>
      <span>
        <span className={styles.count}>{count}</span>{" "}
        {count === 1
          ? "scena con breakdown non aggiornato"
          : "scene con breakdown non aggiornato"}
      </span>
      <button
        type="button"
        className={styles.link}
        onClick={goToBreakdown}
        data-testid="editor-scene-stale-badge-link"
      >
        Apri breakdown
      </button>
    </div>
  );
}
